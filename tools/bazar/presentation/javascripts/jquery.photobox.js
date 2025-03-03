/*!
    photobox v1.9.9
    (c) 2013 Yair Even Or <http://dropthebit.com>

    MIT-style license.
*/

(function($, doc, win) {
  let Photobox; let photobox; let options; let images = []; let imageLinks; let activeImage = -1; let activeURL; let lastActive; let activeType; let prevImage; let nextImage; let thumbsStripe; let docElm; let APControl; let changeImage
  const transitionend = 'transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd'
  const isOldIE = !('placeholder' in doc.createElement('input'))
  const noPointerEvents = (function() { const el = $('<p>')[0]; el.style.cssText = 'pointer-events:auto'; return !el.style.pointerEvents }())
  let isTouchDevice = false // assume "false" unless there's a touch
  let thumbsContainerWidth; let thumbsTotalWidth; let activeThumb = $()
  const blankImg = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
  const transformOrigin = getPrefixed('transformOrigin')
  const transition = getPrefixed('transition')
  // Normalize rAF
  const raf = window.requestAnimationFrame
           || window.webkitRequestAnimationFrame
           || window.mozRequestAnimationFrame
           || window.msRequestAnimationFrame
           || function(cb) { return window.setTimeout(cb, 1000 / 60) }

  // Preload images
  let preload = {}; const preloadPrev = new Image(); const preloadNext = new Image()
  // DOM elements
  let closeBtn; let image; let video; let prevBtn; let nextBtn; let thumbsToggler; let caption; let captionText; let pbLoader; let autoplayBtn; let thumbs; let wrapper

  const defaults = {
    single: false, // if "true" - gallery will only show a single image, with no way to navigate
    beforeShow: null, // Callback before showing an image
    afterClose: null, // Callback after closing the gallery
    loop: true, // Allows to navigate between first and last images
    thumb: null, // A relative path from the link to the thumbnail (if it's not inside the link)
    thumbs: true, // Show gallery thumbnails below the presented photo
    thumbAttr: 'data-src', // Attribute to get the image for the thumbnail from
    counter: '(A/B)', // Counts which piece of content is being viewed, relative to the total count of items in the photobox set. ["false","String"]
    title: true, // show the original alt or title attribute of the image's thumbnail. (path to image, relative to the element which triggers photobox)
    autoplay: false, // should autoplay on first time or not
    time: 3000, // autoplay interval, in miliseconds (less than 1000 will hide the autoplay button)
    history: false, // should use history hashing if possible (HTML5 API)
    hideFlash: true, // Hides flash elements on the page when photobox is activated. NOTE: flash elements must have wmode parameter set to "opaque" or "transparent" if this is set to false
    zoomable: true, // disable/enable mousewheel image zooming
    wheelNextPrev: true, // change image using mousewheel left/right
    keys: {
      close: [27, 88, 67], // keycodes to close photobox, default: esc (27), 'x' (88), 'c' (67)
      prev: [37, 80], // keycodes to navigate to the previous image, default: Left arrow (37), 'p' (80)
      next: [39, 78] // keycodes to navigate to the next image, default: Right arrow (39), 'n' (78)
    }
  }

  // DOM structure
  const overlay = $('<div id="pbOverlay">').append(
    thumbsToggler = $('<input type="checkbox" id="pbThumbsToggler" checked hidden>'),
    pbLoader = $('<div class="pbLoader"><b></b><b></b><b></b></div>'),
    prevBtn = $('<div id="pbPrevBtn" class="prevNext"><b></b></div>').on('click', next_prev),
    nextBtn = $('<div id="pbNextBtn" class="prevNext"><b></b></div>').on('click', next_prev),
    wrapper = $('<div class="pbWrapper">').append( // gives Perspective
      image = $('<img>'),
      video = $('<div>')
    ),
    closeBtn = $('<div id="pbCloseBtn">').on('click', close)[0],
    autoplayBtn = $('<div id="pbAutoplayBtn">').append(
      $('<div class="pbProgress">')
    ),
    caption = $('<div id="pbCaption">').append(
      '<label for="pbThumbsToggler" title="thumbnails on/off"></label>',
      captionText = $('<div class="pbCaptionText">').append('<div class="title"></div><div class="counter">'),
      thumbs = $('<div>').addClass('pbThumbs')
    )
  )

  /// ////////////////////////////////////////////
  // Should remove this and use underscore/lodash if possible

  function throttle(callback, duration) {
    let wait = false
    return function() {
      if (!wait) {
        callback.call()
        wait = true
        setTimeout(() => { wait = false }, duration)
      }
    }
  }

  /// ////////////////////////////////////////////
  // Initialization (on DOM ready)

  function prepareDOM() {
    noPointerEvents && overlay.hide()

    $(doc).on('touchstart.testMouse', () => {
      $(doc).off('touchstart.testMouse')
      isTouchDevice = true
      overlay.addClass('mobile')
    })

    autoplayBtn.off().on('click', APControl.toggle)
    // attach a delegated event on the thumbs container
    thumbs.off().on('click', 'a', thumbsStripe.click)
    // if useragent is IE < 10 (user deserves a slap on the face, but I gotta support them still...)
    isOldIE && overlay.addClass('msie')

    // cancel prorogation up to the overlay container so it won't close
    overlay.off().on('click', 'img', (e) => {
      e.stopPropagation()
    })

    $(doc.body).append(overlay)

    // need this for later:
    docElm = doc.documentElement
  }

  // @param [List of elements to work on, Custom settings, Callback after image is loaded]
  $.fn.photobox = function(target, settings, callback) {
    return this.each(function() {
      let o
      const PB_data = $(this).data('_photobox')

      if (PB_data) { // don't initiate the plugin more than once on the same element
        if (target === 'destroy') PB_data.destroy()

        return this
      }

      if (typeof target != 'string') target = 'a'

      if (target === 'prepareDOM') {
        prepareDOM()
        return this
      }

      o = $.extend({}, defaults, settings || {})
      photobox = new Photobox(o, this, target)

      // Saves the insance on the gallery's target element
      $(this).data('_photobox', photobox)
      // add a callback to the specific gallery
      photobox.callback = callback
    })
  }

  Photobox = function(_options, object, target) {
    this.options = $.extend({}, _options)
    this.target = target
    this.selector = $(object || doc)

    this.thumbsList = null
    // filter the links which actually HAS an image as a child
    const filtered = this.imageLinksFilter(this.selector.find(target))

    this.imageLinks = filtered[0] // Array of jQuery links
    this.images = filtered[1] // 2D Array of image URL & title
    this.init()
  }

  Photobox.prototype = {
    init() {
      const that = this

      // only generates the thumbStripe once, and listen for any DOM changes on the selector element, if so, re-generate
      // This is done on "mouseenter" so images will not get called unless it's liekly that they would be needed
      this.selector.one('mouseenter.photobox', this.target, (e) => {
        that.thumbsList = thumbsStripe.generate.apply(that)
      })

      this.selector.on('click.photobox', this.target, function(e) {
        e.preventDefault()
        that.open(this)
      })

      // if any node was added or removed from the Selector of the gallery
      this.observerTimeout = null

      if (this.selector[0].nodeType == 1) // observe normal nodes
      { this.observeDOM(this.selector[0], this.onDOMchanges.bind(this)) }
    },

    onDOMchanges() {
      const that = this
      // use a timeout to prevent more than one DOM change event firing at once, and also to overcome the fact that IE's DOMNodeRemoved is fired BEFORE elements were actually removed
      clearTimeout(this.observerTimeout)
      that.observerTimeout = setTimeout(() => {
        const filtered = that.imageLinksFilter(that.selector.find(that.target))
        let activeIndex = 0
        let isActiveUrl = false
        let i

        // Make sure that ONLY DOM changes in the photobox number of items will trigger a change
        if (that.imageLinks.length == filtered[0].length) return

        that.imageLinks = filtered[0]
        that.images = filtered[1]

        // if photobox is opened
        if (photobox) {
          // if gallery which was changed is the currently viewed one:
          if (that.selector == photobox.selector) {
            images = that.images
            imageLinks = that.imageLinks
            // check if the currently VIEWED photo has been detached from a photobox set
            // if so, remove navigation arrows
            // TODO: fix the "images" to be an object and not an array.
            for (i = images.length; i--;) {
              if (images[i][0] == activeURL) isActiveUrl = true
              // if not exits any more
            }
            // if( isActiveUrl ){
            //     overlay.removeClass('hasArrows');
            // }
          }
        }

        // if this gallery has thumbs
        // if( that.options.thumbs ){
        that.thumbsList = thumbsStripe.generate.apply(that)
        thumbs.html(that.thumbsList)
        // }

        if (that.images.length && activeURL && that.options.thumbs) {
          activeIndex = that.thumbsList.find(`a[href="${activeURL}"]`).eq(0).parent().index()

          if (activeIndex == -1) activeIndex = 0

          // updateIndexes(activeIndex);
          thumbsStripe.changeActive(activeIndex, 0)
        }
      }, 50)
    },

    open(link) {
      const startImage = $.inArray(link, this.imageLinks)
      // if image link does not exist in the imageLinks array (probably means it's not a valid part of the gallery)
      if (startImage == -1) return false

      // load the right gallery selector...
      options = this.options
      images = this.images
      imageLinks = this.imageLinks

      photobox = this
      this.setup(1)

      overlay.on(transitionend, () => {
        overlay.off(transitionend).addClass('on') // class 'on' is set when the initial fade-in of the overlay is done
        changeImage(startImage, true)
      }).addClass('show')

      if (isOldIE) overlay.trigger('MSTransitionEnd')

      return false
    },

    imageLinksFilter(obj) {
      const that = this
      const images = []
      const caption = {}
      let captionlink

      return [obj.filter(function(i) {
        // search for the thumb inside the link, if not found then see if there's a 'that.settings.thumb' pointer to the thumbnail
        const link = $(this)
        let thumbImg
        let thumbSrc = ''

        caption.content = link[0].getAttribute('title') || ''

        if (that.options.thumb) thumbImg = link.find(that.options.thumb)[0]

        // try a direct child lookup
        if (!that.options.thumb || !thumbImg) thumbImg = link.find('img')[0]

        // if no img child found in the link
        if (thumbImg) {
          captionlink = thumbImg.getAttribute('data-pb-captionlink')
          thumbSrc = thumbImg.getAttribute(that.options.thumbAttr) || thumbImg.getAttribute('src')

          caption.content = (thumbImg.getAttribute('alt') || thumbImg.getAttribute('title') || '')
        }

        // if there is a caption link to be added:
        if (captionlink) {
          captionlink = captionlink.split('[')
          // parse complex links: text[www.site.com]
          if (captionlink.length == 2) {
            caption.linkText = captionlink[0]
            caption.linkHref = captionlink[1].slice(0, -1)
          } else {
            caption.linkText = captionlink
            caption.linkHref = captionlink
          }
          caption.content += ` <a href="${caption.linkHref}">${caption.linkText}</a>`
        }

        images.push([link[0].href, caption.content, thumbSrc])

        return true
      }), images]
    },

    // check if DOM nodes were added or removed, to re-build the imageLinks and thumbnails
    observeDOM: (function() {
      const MutationObserver = win.MutationObserver || win.WebKitMutationObserver
      const eventListenerSupported = win.addEventListener

      return function(obj, callback) {
        if (MutationObserver) {
          var that = this
          // define a new observer
          const obs = new MutationObserver((mutations, observer) => {
            if (mutations[0].addedNodes.length || mutations[0].removedNodes.length) callback(that)
          })
          // have the observer observe for changes in children
          obs.observe(obj, { childList: true, subtree: true })
        } else if (eventListenerSupported) {
          obj.addEventListener('DOMNodeInserted', callback.bind(that), false)
          obj.addEventListener('DOMNodeRemoved', callback.bind(that), false)
        }
      }
    }()),

    // things that should happen every time the gallery opens or closes (some messed up code below..)
    setup(open) {
      const fn = open ? 'on' : 'off'

      // a hack to change the image src to nothing, because you can't do that in CHROME
      image[0].src = blankImg

      // thumbs stuff
      if (options.thumbs) {
        if (!isTouchDevice) {
          thumbs[fn]('mouseenter.photobox', thumbsStripe.calc)
            [fn]('mousemove.photobox', thumbsStripe.move)
        }
      }

      if (open) {
        image.css({ transition: '0s' }).removeAttr('style') // reset any transition that might be on the element (yes it's ugly)
        overlay.show()
        // Clean up if another gallery was viewed before, which had a thumbsList
        thumbs
          .html(this.thumbsList)
          .trigger('mouseenter.photobox')

        if (options.thumbs) {
          overlay.addClass('thumbs')
        } else {
          thumbsToggler.prop('checked', false)
          overlay.removeClass('thumbs')
        }

        // things to hide if there are less than 2 images
        if (this.images.length < 2 || options.single) overlay.removeClass('thumbs hasArrows hasCounter hasAutoplay')
        else {
          overlay.addClass('hasArrows hasCounter')

          // check is the autoplay button should be visible (per gallery) and if so, should it autoplay or not.
          if (options.time > 1000) {
            overlay.addClass('hasAutoplay')
            if (options.autoplay) APControl.progress.start()
            else APControl.pause()
          } else overlay.removeClass('hasAutoplay')
        }

        options.hideFlash && $('iframe, object, embed').css('visibility', 'hidden')
      } else {
        $(win).off('resize.photobox')
      }

      $(doc).off('keydown.photobox')[fn]({ 'keydown.photobox': keyDown })

      if (isTouchDevice) {
        overlay.removeClass('hasArrows') // no need for Arrows on touch-enabled
        wrapper[fn]('swipe', onSwipe)
      }

      if (options.zoomable) {
        overlay[fn]({ 'mousewheel.photobox': scrollZoom })
        if (!isOldIE) thumbs[fn]({ 'mousewheel.photobox': thumbsResize })
      }

      if (!options.single && options.wheelNextPrev) {
        overlay[fn]({ 'mousewheel.photobox': throttle(wheelNextPrev, 1000) })
      }
    },

    destroy() {
      options = this.options
      this.selector
        .off('click.photobox', this.target)
        .removeData('_photobox')

      close()
    }
  }

  // on touch-devices only
  function onSwipe(e, Dx, Dy) {
    if (Dx == 1) {
      image.css({ transform: 'translateX(25%)', transition: '.2s', opacity: 0 })
      setTimeout(() => { changeImage(prevImage) }, 200)
    } else if (Dx == -1) {
      image.css({ transform: 'translateX(-25%)', transition: '.2s', opacity: 0 })
      setTimeout(() => { changeImage(nextImage) }, 200)
    }

    if (Dy == 1) thumbsToggler.prop('checked', true)
    else if (Dy == -1) thumbsToggler.prop('checked', false)
  }

  // manage the (bottom) thumbs strip
  thumbsStripe = (function() {
    let containerWidth = 0
    let scrollWidth = 0
    let posFromLeft = 0 // Stripe position from the left of the screen
    let stripePos = 0 // When relative mouse position inside the thumbs stripe
    let animated = null
    let padding // in percentage to the containerWidth
    let el; let $el; let ratio; let scrollPos; let
      pos

    return {
      // returns a <ul> element which is populated with all the gallery links and thumbs
      generate() {
        const thumbsList = $('<ul>')
        const elements = []
        const len = this.imageLinks.size()
        let title; let thumbSrc; let link; let type; let
          i

        for (i = 0; i < len; i++) {
          link = this.imageLinks[i]

          thumbSrc = this.images[i][2]
          // continue if has thumb
          if (!thumbSrc) continue

          title = this.images[i][1]
          type = link.rel ? ` class='${link.rel}'` : ''
          elements.push(`<li${type}><a href="${link.href}"><img loading="lazy" src="${thumbSrc}" alt="${title}" title="${title}" /></a></li>`)
        }
        thumbsList.html(elements.join(''))
        return thumbsList
      },

      click(e) {
        e.preventDefault()

        activeThumb.removeClass('active')
        activeThumb = $(this).parent().addClass('active')

        const imageIndex = $(this.parentNode).index()
        return changeImage(imageIndex, 0, 1)
      },

      changeActiveTimeout: null,
      /** Highlights the thumb which represents the photo and centres the thumbs viewer on it.
            **  @thumbClick - if a user clicked on a thumbnail, don't center on it
            */
      changeActive(index, delay, thumbClick) {
        if (!options.thumbs) return

        const lastIndex = activeThumb.index()
        activeThumb.removeClass('active')
        activeThumb = thumbs.find('li').eq(index).addClass('active')

        if (thumbClick || !activeThumb[0]) return
        // set the scrollLeft position of the thumbs list to show the active thumb
        clearTimeout(this.changeActiveTimeout)
        // give the images time to to settle on their new sizes (because of css transition) and then calculate the center...
        this.changeActiveTimeout = setTimeout(() => {
          const pos = activeThumb[0].offsetLeft + activeThumb[0].clientWidth / 2 - docElm.clientWidth / 2
          delay ? thumbs.delay(800) : thumbs.stop()
          thumbs.animate({ scrollLeft: pos }, 500, 'swing')
        }, 200)
      },

      // calculate the thumbs container width, if the window has been resized
      calc(e) {
        el = thumbs[0]

        containerWidth = el.clientWidth
        scrollWidth = el.scrollWidth
        padding = 0.15 * containerWidth

        posFromLeft = thumbs.offset().left
        stripePos = e.pageX - padding - posFromLeft
        pos = stripePos / (containerWidth - padding * 2)
        scrollPos = (scrollWidth - containerWidth) * pos

        thumbs.animate({ scrollLeft: scrollPos }, 200)

        clearTimeout(animated)
        animated = setTimeout(() => {
          animated = null
        }, 200)

        return this
      },

      // move the stripe left or right according to mouse position
      move(e) {
        // don't move anything until initial movement on 'mouseenter' has finished
        if (animated) return

        const ratio = scrollWidth / containerWidth
        let stripePos = e.pageX - padding - posFromLeft // the mouse X position, "normalized" to the carousel position
        let pos; let
          scrollPos

        if (stripePos < 0) stripePos = 0 //

        pos = stripePos / (containerWidth - padding * 2) // calculated position between 0 to 1
        // calculate the percentage of the mouse position within the carousel
        scrollPos = (scrollWidth - containerWidth) * pos

        raf(() => {
          el.scrollLeft = scrollPos
        })
      }
    }
  }())

  // Autoplay controller
  APControl = {
    autoPlayTimer: false,
    play() {
      APControl.autoPlayTimer = setTimeout(() => { changeImage(nextImage) }, options.time)
      APControl.progress.start()
      autoplayBtn.removeClass('play')
      APControl.setTitle('Click to stop autoplay')
      options.autoplay = true
    },
    pause() {
      clearTimeout(APControl.autoPlayTimer)
      APControl.progress.reset()
      autoplayBtn.addClass('play')
      APControl.setTitle('Click to resume autoplay')
      options.autoplay = false
    },
    progress: {
      reset() {
        autoplayBtn.find('div').removeAttr('style')
        setTimeout(() => { autoplayBtn.removeClass('playing') }, 200)
      },
      start() {
        if (!isOldIE) autoplayBtn.find('div').css(transition, `${options.time}ms`)
        autoplayBtn.addClass('playing')
      }
    },
    // sets the button Title property
    setTitle(text) {
      if (text) autoplayBtn.prop('title', `${text} (every ${options.time / 1000} seconds)`)
    },
    // the button onClick handler
    toggle(e) {
      e.stopPropagation()
      APControl[options.autoplay ? 'pause' : 'play']()
    }
  }

  function getPrefixed(prop) {
    let i; const s = doc.createElement('p').style; const
      v = ['ms', 'O', 'Moz', 'Webkit']
    if (s[prop] == '') return prop
    prop = prop.charAt(0).toUpperCase() + prop.slice(1)
    for (i = v.length; i--;) if (s[v[i] + prop] == '') return (v[i] + prop)
  }

  function keyDown(event) {
    const code = event.keyCode; const ok = options.keys; let
      result
    // Prevent default keyboard action (like navigating inside the page)
    return $.inArray(code, ok.close) >= 0 && close()
               || $.inArray(code, ok.next) >= 0 && !options.single && loophole(nextImage)
               || $.inArray(code, ok.prev) >= 0 && !options.single && loophole(prevImage) || true
  }

  function wheelNextPrev(e, dY, dX) {
    if (dX == 1) loophole(nextImage)
    else if (dX == -1) loophole(prevImage)
  }

  // serves as a callback for pbPrevBtn / pbNextBtn buttons but also is called on keypress events
  function next_prev() {
    // don't get crazy when user clicks next or prev buttons rapidly
    // if( !image.hasClass('zoomable') )
    //  return false;

    const idx = (this.id == 'pbPrevBtn') ? prevImage : nextImage

    loophole(idx)
    return false
  }

  function updateIndexes(idx) {
    lastActive = activeImage
    activeImage = idx
    activeURL = images[idx][0]
    prevImage = (activeImage || (options.loop ? images.length : 0)) - 1
    nextImage = ((activeImage + 1) % images.length) || (options.loop ? 0 : -1)
  }

  // check if looping is allowed before changing image/video.
  // A pre-changeImage function, only for linear changes
  function loophole(idx) {
    if (!options.loop) {
      const afterLast = activeImage == images.length - 1 && idx == nextImage
      const beforeFirst = activeImage == 0 && idx == prevImage

      if (afterLast || beforeFirst) return
    }

    changeImage(idx)
  }

  changeImage = (function() {
    let timer

    return function(imageIndex, firstTime, thumbClick) {
      // throttle mechanism
      if (timer) return

      timer = setTimeout(() => {
        timer = null
      }, 150)

      if (!imageIndex || imageIndex < 0) imageIndex = 0

      // hide/show next-prev buttons
      if (!options.loop) {
        nextBtn[imageIndex == images.length - 1 ? 'addClass' : 'removeClass']('hide')
        prevBtn[imageIndex == 0 ? 'addClass' : 'removeClass']('hide')
      }

      // if there's a callback for this point:
      if (typeof options.beforeShow == 'function') options.beforeShow(imageLinks[imageIndex])

      overlay.removeClass('error').addClass(imageIndex > activeImage ? 'next' : 'prev')

      updateIndexes(imageIndex)

      // reset things
      stop()
      video.empty()
      preload.onerror = null
      image.add(video).data('zoom', 1)

      activeType = imageLinks[imageIndex].rel == 'video' ? 'video' : 'image'

      // check if current link is a video
      if (activeType == 'video') {
        video.html(newVideo()).addClass('hide')
        showContent(firstTime)
      } else {
        // give a tiny delay to the preloader, so it won't be showed when images load very quickly
        const loaderTimeout = setTimeout(() => { overlay.addClass('pbLoading') }, 50)

        if (isOldIE) overlay.addClass('hide') // should wait for the image onload. just hide the image while old IE display the preloader

        options.autoplay && APControl.progress.reset()
        preload = new Image()
        preload.onload = function() {
          preload.onload = null

          if (prevImage >= 0) preloadPrev.src = images[prevImage][0]
          if (nextImage >= 0) preloadNext.src = images[nextImage][0]

          clearTimeout(loaderTimeout)
          showContent(firstTime)
        }
        preload.onerror = imageError
        preload.src = activeURL
      }

      // Show Caption text
      captionText.on(transitionend, captionTextChange).addClass('change')
      if (firstTime || isOldIE) captionTextChange()

      thumbsStripe.changeActive(imageIndex, firstTime, thumbClick)
      // Save url hash for current image
      history.save()
    }
  }())

  function newVideo() {
    let url = images[activeImage][0]
    const sign = $('<a>').prop('href', images[activeImage][0])[0].search ? '&' : '?'
    url += `${sign}vq=hd720&wmode=opaque`
    return $('<iframe>').prop({ scrolling: 'no', frameborder: 0, allowTransparency: true, src: url }).attr({ webkitAllowFullScreen: true, mozallowfullscreen: true, allowFullScreen: true })
  }

  // show the item's Title & Counter
  function captionTextChange() {
    captionText.off(transitionend).removeClass('change')
    // change caption's text
    if (options.counter) {
      try {
        var value = options.counter.replace('A', activeImage + 1).replace('B', images.length)
      }
      // if, for some reason, the above has failed from a bad "counter" value, reset and retry
      catch (err) {
        options.counter = '(A/B)'
        captionTextChange()
      }
      caption.find('.counter').text(value)
    }
    if (options.title) caption.find('.title').html(`<span>${images[activeImage][1]}</span>`)
  }

  // Handles the history states when changing images
  var history = {
    save() {
      // only save to history urls which are not already in the hash
      if ('pushState' in window.history && decodeURIComponent(window.location.hash.slice(1)) != activeURL && options.history) {
        window.history.pushState('photobox', `${doc.title}-${images[activeImage][1]}`, `${window.location.pathname + window.location.search}#${encodeURIComponent(activeURL)}`)
      }
    },
    load() {
      if (options && !options.history) return false
      const hash = decodeURIComponent(window.location.hash.slice(1)); let i; let
        j
      if (!hash && overlay.hasClass('show')) close()

      $(`a[href="${hash}"]`).trigger('click.photobox')
    },
    clear() {
      if (options.history && 'pushState' in window.history) window.history.pushState('photobox', doc.title, window.location.pathname + window.location.search)
    }
  }

  // Add Photobox special `onpopstate` to the `onpopstate` function
  window.onpopstate = (function() {
    const cached = window.onpopstate
    return function(event) {
      cached && cached.apply(this, arguments)
      if (event.state == 'photobox') history.load()
    }
  }())

  // handles all image loading error (if image is dead)
  function imageError() {
    overlay.addClass('error')
    image[0].src = blankImg // set the source to a blank image
    preload.onerror = null
  }

  // Shows the content (image/video) on the screen
  function showContent(firstTime) {
    let out; let
      showSaftyTimer
    showSaftyTimer = setTimeout(show, 2000)

    // hides the current image and prepare ground for an image change
    pbLoader.fadeOut(300, () => {
      overlay.removeClass('pbLoading')
      pbLoader.removeAttr('style')
    })
    overlay.addClass('hide')

    image.add(video).removeAttr('style').removeClass('zoomable') // while transitioning an image, do not apply the 'zoomable' class

    // check which element needs to transition-out:
    if (!firstTime && imageLinks[lastActive].rel == 'video') {
      out = video
      image.addClass('prepare')
    } else out = image

    if (firstTime || isOldIE) show()
    else out.on(transitionend, show)

    // in case the 'transitionend' didn't fire
    // after hiding the last seen image, show the new one
    function show() {
      clearTimeout(showSaftyTimer)
      out.off(transitionend).css({ transition: 'none' })
      overlay.removeClass('video')
      if (activeType == 'video') {
        image[0].src = blankImg
        video.addClass('prepare')
        overlay.addClass('video')
      } else image.prop({ src: activeURL, class: 'prepare' })

      // filthy hack for the transitionend event, but cannot work without it:
      setTimeout(() => {
        image.add(video).removeAttr('style').removeClass('prepare')
        overlay.removeClass('hide next prev')
        setTimeout(() => {
          image.add(video).on(transitionend, showDone)
          if (isOldIE) showDone() // IE9 and below don't support transitionEnd...
        }, 0)
      }, 50)
    }
  }

  // a callback whenever a transition of an image or a video is done
  function showDone() {
    image.add(video).off(transitionend).addClass('zoomable')
    if (activeType == 'video') video.removeClass('hide')
    else {
      autoplayBtn && options.autoplay && APControl.play()
    }
    if (typeof photobox.callback == 'function') photobox.callback.apply(imageLinks[activeImage])
  }

  function scrollZoom(e, deltaY, deltaX) {
    if (deltaX) return false

    if (activeType == 'video') {
      var zoomLevel = video.data('zoom') || 1
      zoomLevel += (deltaY / 10)
      if (zoomLevel < 0.5) return false

      video.data('zoom', zoomLevel).css({ width: 624 * zoomLevel, height: 351 * zoomLevel })
    } else {
      var zoomLevel = image.data('zoom') || 1
      const getSize = image[0].getBoundingClientRect()

      zoomLevel += (deltaY / 10)

      if (zoomLevel < 0.1) zoomLevel = 0.1

      raf(() => {
        image.data('zoom', zoomLevel).css({ transform: `scale(${zoomLevel})` })
      })

      // check if image (by mouse) movement should take effect (if image is larger than the window
      if (getSize.height > docElm.clientHeight || getSize.width > docElm.clientWidth) {
        $(doc).on('mousemove.photobox', imageReposition)
      } else {
        $(doc).off('mousemove.photobox')
        image[0].style[transformOrigin] = '50% 50%'
      }
    }
    return false
  }

  function thumbsResize(e, delta) {
    e.preventDefault()
    e.stopPropagation() // stop the event from bubbling up to the Overlay and enlarge the content itself
    const thumbList = photobox.thumbsList; let
      h
    thumbList.css('height', thumbList[0].clientHeight + (delta * 10))
    h = caption[0].clientHeight / 2
    wrapper[0].style.cssText = `margin-top: -${h}px; padding: ${h}px 0;`
    thumbs.hide().show(0)
    // thumbs.trigger('mouseenter').trigger('mousemove');
  }

  // moves the image around during zoom mode on mousemove event
  function imageReposition(e) {
    const y = (e.clientY / docElm.clientHeight) * (docElm.clientHeight + 200) - 100 // extend the range of the Y axis by 100 each side
    const yDelta = y / docElm.clientHeight * 100
    const xDelta = e.clientX / docElm.clientWidth * 100
    const origin = `${xDelta.toFixed(2)}% ${yDelta.toFixed(2)}%`

    raf(() => {
      image[0].style[transformOrigin] = origin
    })
  }

  function stop() {
    clearTimeout(APControl.autoPlayTimer)
    $(doc).off('mousemove.photobox')
    preload.onload = function() {}
    preload.src = preloadPrev.src = preloadNext.src = activeURL
  }

  function close() {
    if (!overlay.hasClass('show')) return false

    stop()
    video.find('iframe').prop('src', '').empty()
    Photobox.prototype.setup()
    history.clear()

    overlay.removeClass('on video').addClass('hide')

    image.on(transitionend, hide)
    isOldIE && hide()

    // the "photobox" instance might be needed for async transitionEnd functions, so give it some time before clearing it
    setTimeout(() => {
      photobox = null
    }, 1000)

    function hide() {
      if (overlay[0].className == '') return // if already hidden
      overlay.removeClass('show hide error pbLoading')
      image.removeAttr('class').removeAttr('style').off().data('zoom', 1)
      caption.find('.title').empty()

      if (noPointerEvents) // pointer-events lack support in IE, so just hide the overlay
      { setTimeout(() => { overlay.hide() }, 200) }

      options.hideFlash && $('iframe, object, embed').css('visibility', 'visible')
    }

    // fall-back if the 'transitionend' event didn't fire
    setTimeout(hide, 500)
    // callback after closing the gallery
    if (typeof options.afterClose === 'function') options.afterClose(overlay)
  }

  /**
    * jQuery Plugin to add basic "swipe" support on touch-enabled devices
    *
    * @author Yair Even Or
    * @version 1.0.0 (March 20, 2013)
    */
  $.event.special.swipe = {
    setup() {
      $(this).bind('touchstart', $.event.special.swipe.handler)
    },

    teardown() {
      $(this).unbind('touchstart', $.event.special.swipe.handler)
    },

    handler(event) {
      const args = [].slice.call(arguments, 1) // clone arguments array, remove original event from cloned array
      const { touches } = event.originalEvent
      let startX; let startY
      let deltaX = 0; let deltaY = 0
      const that = this

      event = $.event.fix(event)

      if (touches.length == 1) {
        startX = touches[0].pageX
        startY = touches[0].pageY
        this.addEventListener('touchmove', onTouchMove, false)
      }

      function cancelTouch() {
        that.removeEventListener('touchmove', onTouchMove)
        startX = startY = null
      }

      function onTouchMove(e) {
        e.preventDefault()

        const Dx = startX - e.touches[0].pageX
        const Dy = startY - e.touches[0].pageY

        if (Math.abs(Dx) >= 20) {
          cancelTouch()
          deltaX = (Dx > 0) ? -1 : 1
        } else if (Math.abs(Dy) >= 20) {
          cancelTouch()
          deltaY = (Dy > 0) ? 1 : -1
        }

        event.type = 'swipe'
        args.unshift(event, deltaX, deltaY) // add back the new event to the front of the arguments with the delatas
        return ($.event.dispatch || $.event.handle).apply(that, args)
      }
    }
  }

  /*! Copyright (c) 2013 Brandon Aaron (http://brandon.aaron.sh)
     * Licensed under the MIT License (LICENSE.txt).
     *
     * Version: 3.1.11
     *
     * Requires: jQuery 1.2.2+
     */
  !(function(a) { typeof define == 'function' && define.amd ? define(['jquery'], a) : typeof exports == 'object' ? module.exports = a : a(jQuery) }((a) => { function b(b) { const g = b || window.event; const h = i.call(arguments, 1); let j = 0; let l = 0; let m = 0; let n = 0; let o = 0; let p = 0; if (b = a.event.fix(g), b.type = 'mousewheel', 'detail' in g && (m = -1 * g.detail), 'wheelDelta' in g && (m = g.wheelDelta), 'wheelDeltaY' in g && (m = g.wheelDeltaY), 'wheelDeltaX' in g && (l = -1 * g.wheelDeltaX), 'axis' in g && g.axis === g.HORIZONTAL_AXIS && (l = -1 * m, m = 0), j = m === 0 ? l : m, 'deltaY' in g && (m = -1 * g.deltaY, j = m), 'deltaX' in g && (l = g.deltaX, m === 0 && (j = -1 * l)), m !== 0 || l !== 0) { if (g.deltaMode === 1) { const q = a.data(this, 'mousewheel-line-height'); j *= q, m *= q, l *= q } else if (g.deltaMode === 2) { const r = a.data(this, 'mousewheel-page-height'); j *= r, m *= r, l *= r } if (n = Math.max(Math.abs(m), Math.abs(l)), (!f || f > n) && (f = n, d(g, n) && (f /= 40)), d(g, n) && (j /= 40, l /= 40, m /= 40), j = Math[j >= 1 ? 'floor' : 'ceil'](j / f), l = Math[l >= 1 ? 'floor' : 'ceil'](l / f), m = Math[m >= 1 ? 'floor' : 'ceil'](m / f), k.settings.normalizeOffset && this.getBoundingClientRect) { const s = this.getBoundingClientRect(); o = b.clientX - s.left, p = b.clientY - s.top } return b.deltaX = l, b.deltaY = m, b.deltaFactor = f, b.offsetX = o, b.offsetY = p, b.deltaMode = 0, h.unshift(b, j, l, m), e && clearTimeout(e), e = setTimeout(c, 200), (a.event.dispatch || a.event.handle).apply(this, h) } } function c() { f = null } function d(a, b) { return k.settings.adjustOldDeltas && a.type === 'mousewheel' && b % 120 === 0 } let e; let f; const g = ['wheel', 'mousewheel', 'DOMMouseScroll', 'MozMousePixelScroll']; const h = 'onwheel' in document || document.documentMode >= 9 ? ['wheel'] : ['mousewheel', 'DomMouseScroll', 'MozMousePixelScroll']; var i = Array.prototype.slice; if (a.event.fixHooks) for (let j = g.length; j;)a.event.fixHooks[g[--j]] = a.event.mouseHooks; var k = a.event.special.mousewheel = { version: '3.1.11', setup() { if (this.addEventListener) for (let c = h.length; c;) this.addEventListener(h[--c], b, !1); else this.onmousewheel = b; a.data(this, 'mousewheel-line-height', k.getLineHeight(this)), a.data(this, 'mousewheel-page-height', k.getPageHeight(this)) }, teardown() { if (this.removeEventListener) for (let c = h.length; c;) this.removeEventListener(h[--c], b, !1); else this.onmousewheel = null; a.removeData(this, 'mousewheel-line-height'), a.removeData(this, 'mousewheel-page-height') }, getLineHeight(b) { let c = a(b)['offsetParent' in a.fn ? 'offsetParent' : 'parent'](); return c.length || (c = a('body')), parseInt(c.css('fontSize'), 10) }, getPageHeight(b) { return a(b).height() }, settings: { adjustOldDeltas: !0, normalizeOffset: !0 } }; a.fn.extend({ mousewheel(a) { return a ? this.bind('mousewheel', a) : this.trigger('mousewheel') }, unmousewheel(a) { return this.unbind('mousewheel', a) } }) }))

  /// /////////// ON DOCUMENT READY /////////////////
  $(doc).ready(prepareDOM)

  // Expose:
  window._photobox = {
    DOM: { overlay },
    close,
    history,
    defaults
  }
}(jQuery, document, window))