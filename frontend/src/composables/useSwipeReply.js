import { ref, watch, watchEffect, onBeforeUnmount, nextTick } from 'vue'

/**
 * Mobile message swipe-to-reply and long-press context menu composable.
 *
 * NOTE: _swipeTouchMove (sidebar swipe-to-open, depends on sidebarHidden)
 * is NOT extracted — it STAYS in ChatView registered on document.
 * Only _msgAreaTouchMove (message swipe-to-reply) moves here.
 */
export function useSwipeReply({ listEl, isAiChat, startReply, messages, me }) {
  function myId() { return me.value?.username || '' }

  // ── Reactive state ─────────────────────────────────────────────────
  const swipeMsgId = ref(null)    // message id whose bubble is being swiped
  const msgSwipeX = ref(0)        // current X translate offset (px)
  const msgSwipeDone = ref(false) // true during spring-back transition
  const mobileMenu = ref(null)    // { msg, rawX, rawY, x, y, adjusted } or null
  const mobileMenuEl = ref(null)  // ref to the rendered menu DOM element

  const desktopMenu = ref(null)   // { msg, x, y, anchorEvent } or null
  const desktopMenuEl = ref(null)
  const desktopMenuStyle = ref({})

  // ── Non-reactive closure state ─────────────────────────────────────
  let _msgSwipeId = null
  let _msgSwipeStartX = 0
  let _msgSwipeStartY = 0
  let _msgSwipeDecided = null     // null | 'h' | 'v'
  let _msgLongPressTimer = null
  let _msgLongPressTriggered = false

  // ── Passive:false touchmove for swipe-to-reply ─────────────────────
  // Must be registered with { passive: false } to call preventDefault.
  // Use watchEffect to defer registration until listEl.value is non-null.
  function _msgAreaTouchMove(e) {
    if (window.innerWidth > 640 || !_msgSwipeId || _msgLongPressTriggered) return

    const touch = e.touches[0]
    const dx = touch.clientX - _msgSwipeStartX
    const dy = touch.clientY - _msgSwipeStartY

    if (_msgSwipeDecided === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      _msgSwipeDecided = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }

    if (_msgSwipeDecided === 'v') {
      // Vertical scroll: cancel swipe and long press, let scroll proceed naturally
      clearTimeout(_msgLongPressTimer)
      _msgSwipeId = null
      swipeMsgId.value = null
      return
    }

    // Confirmed horizontal swipe: cancel long press, prevent page scroll
    clearTimeout(_msgLongPressTimer)
    e.preventDefault()
    e.stopPropagation() // prevents sidebar swipe from also triggering

    // Rightward only, rubber-band resistance after 60 px
    const raw = Math.max(0, dx)
    const x = raw <= 60 ? raw : 60 + (raw - 60) * 0.25
    msgSwipeX.value = Math.min(x, 80)
  }

  let _registered = false
  const _stop = watchEffect(() => {
    if (listEl.value && !_registered) {
      listEl.value.addEventListener('touchmove', _msgAreaTouchMove, { passive: false })
      _registered = true
      _stop()
    }
  })

  onBeforeUnmount(() => {
    if (listEl.value) listEl.value.removeEventListener('touchmove', _msgAreaTouchMove)
    clearTimeout(_msgLongPressTimer)
  })

  // ── Touch event handlers ───────────────────────────────────────────
  function onMsgTouchStart(e, m) {
    if (window.innerWidth > 640 || isAiChat.value) return
    if (m.type === 'system' || m.deleted_at) return
    if (mobileMenu.value) return

    _msgSwipeId = m.id
    _msgSwipeStartX = e.touches[0].clientX
    _msgSwipeStartY = e.touches[0].clientY
    _msgSwipeDecided = null
    _msgLongPressTriggered = false
    swipeMsgId.value = m.id
    msgSwipeX.value = 0
    msgSwipeDone.value = false

    _msgLongPressTimer = setTimeout(() => {
      _msgLongPressTriggered = true
      navigator.vibrate?.(30)
      // Cancel any in-progress swipe
      _msgSwipeId = null
      swipeMsgId.value = null
      msgSwipeX.value = 0
      // Store raw touch position; watcher will clamp to viewport after render
      const tx = e.touches[0].clientX
      const ty = e.touches[0].clientY
      mobileMenu.value = { msg: m, rawX: tx, rawY: ty, x: -9999, y: -9999, adjusted: false }
    }, 500)
  }

  function onMsgTouchEnd(e, m) {
    clearTimeout(_msgLongPressTimer)
    if (_msgLongPressTriggered) return

    const swipeXValue = msgSwipeX.value
    const hadSwipe = _msgSwipeId !== null

    _msgSwipeId = null
    _msgSwipeDecided = null
    msgSwipeDone.value = true
    msgSwipeX.value = 0

    setTimeout(() => {
      if (swipeMsgId.value === m.id) {
        swipeMsgId.value = null
        msgSwipeDone.value = false
      }
    }, 280)

    if (hadSwipe && swipeXValue >= 60) {
      startReply(m)
    }
  }

  function onMsgTouchCancel() {
    clearTimeout(_msgLongPressTimer)
    _msgLongPressTriggered = false
    _msgSwipeId = null
    _msgSwipeDecided = null
    msgSwipeDone.value = true
    msgSwipeX.value = 0
    setTimeout(() => {
      swipeMsgId.value = null
      msgSwipeDone.value = false
    }, 280)
  }

  // ── Mobile long-press menu ─────────────────────────────────────────
  function closeMobileMenu() {
    mobileMenu.value = null
  }

  // ── Smart repositioning of mobile long-press menu ──────────────────
  // Runs after Vue updates the DOM so we can measure actual menu dimensions.
  watch(mobileMenu, (newVal) => {
    if (!newVal || newVal.adjusted) return
    if (!mobileMenuEl.value) return
    const el = mobileMenuEl.value
    const menuW = el.offsetWidth
    const menuH = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const EDGE = 8
    const SAFE_BOTTOM = 20   // covers env(safe-area-inset-bottom) on most devices
    const tx = newVal.rawX
    const ty = newVal.rawY
    // Prefer opening below touch, fall back to above when not enough room
    let y = ty + 16
    if (y + menuH > vh - EDGE - SAFE_BOTTOM) y = ty - menuH - 16
    y = Math.max(EDGE, Math.min(y, vh - menuH - EDGE - SAFE_BOTTOM))
    // Center horizontally on touch point, clamp to edges
    let x = tx - menuW / 2
    x = Math.max(EDGE, Math.min(x, vw - menuW - EDGE))
    mobileMenu.value = { ...newVal, x, y, adjusted: true }
  }, { flush: 'post' })

  // ── Desktop right-click context menu ──────────────────────────────
  function openDesktopMenu(e, m) {
    if (m.deleted_at || m.type === 'system') return
    desktopMenu.value = { msg: m, x: e.clientX, y: e.clientY, anchorEvent: e }
    nextTick(() => {
      const el = desktopMenuEl.value
      if (!el) return
      const menuW = el.offsetWidth || 220
      const menuH = el.offsetHeight || 300
      const vw = window.innerWidth
      const vh = window.innerHeight
      const MARGIN = 8
      let x = e.clientX
      let y = e.clientY
      if (x + menuW > vw - MARGIN) x = vw - menuW - MARGIN
      if (x < MARGIN) x = MARGIN
      if (y + menuH > vh - MARGIN) y = vh - menuH - MARGIN
      if (y < MARGIN) y = MARGIN
      desktopMenuStyle.value = {
        left: x + 'px',
        top: y + 'px',
        transformOrigin: e.clientX - x < menuW / 2 ? 'top left' : 'top right',
      }
    })
  }

  function closeDesktopMenu() {
    desktopMenu.value = null
    desktopMenuStyle.value = {}
  }

  return {
    swipeMsgId,
    msgSwipeX,
    msgSwipeDone,
    mobileMenu,
    mobileMenuEl,
    desktopMenu,
    desktopMenuEl,
    desktopMenuStyle,
    onMsgTouchStart,
    onMsgTouchEnd,
    onMsgTouchCancel,
    openDesktopMenu,
    closeDesktopMenu,
    closeMobileMenu,
  }
}
