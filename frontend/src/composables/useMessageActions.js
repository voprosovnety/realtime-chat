import { ref, computed, nextTick } from 'vue'
import { api } from '../api'

/**
 * Message actions composable — delete, edit, pin, react, vote, forward, select.
 *
 * No lifecycle hooks, no watchers.
 */
export function useMessageActions({
  chatId,
  messages,
  me,
  pinnedMessages,
  pinnedIndex,
  currentPinned,
  editingId,
  composerEl,
  input,
  editingText,
  showToast,
  isGroup,
  isOwner,
  isAiChat,
  composerError,
}) {
  // ── Helpers ────────────────────────────────────────────────────────
  function myId() { return me.value?.username || '' }
  function isMine(m) { return m.sender === myId() }
  function loadDraft(id) {
    if (!id || id === 'ai') return ''
    return localStorage.getItem(`draft:${id}`) || ''
  }

  // ── Pinned nav lock ────────────────────────────────────────────────
  // pinnedNavLock: prevents the scroll-driven pinnedIndex update from
  // overwriting the user's manual pin navigation for 1.5 s after a click.
  let pinnedNavLock = false
  let pinnedNavLockTimer = null

  function lockPinnedNav() {
    pinnedNavLock = true
    clearTimeout(pinnedNavLockTimer)
    pinnedNavLockTimer = setTimeout(() => { pinnedNavLock = false }, 1500)
  }

  function stablePinnedIndex(newList, currentId) {
    if (!newList.length) return 0
    if (currentId) {
      const idx = newList.findIndex(p => p.id === currentId)
      if (idx >= 0) return idx
    }
    return Math.min(pinnedIndex.value, newList.length - 1)
  }

  // ── Delete ─────────────────────────────────────────────────────────
  const deletingMsgId = ref(null)

  async function removeMessage(m) {
    if (deletingMsgId.value === m.id) {
      deletingMsgId.value = null
      try {
        await api.deleteMessage(chatId.value, m.id)
        const i = messages.value.findIndex(x => x.id === m.id)
        if (i !== -1) messages.value[i].deleted_at = new Date().toISOString()
        if (editingId.value === m.id) cancelEdit()
        showToast('Message deleted', 'success')
      } catch (e) {
        showToast(e?.message || 'Failed to delete message', 'error')
      }
      return
    }
    deletingMsgId.value = m.id
    showToast('Click Delete again to confirm', 'warning')
    setTimeout(() => { if (deletingMsgId.value === m.id) deletingMsgId.value = null }, 3000)
  }

  // ── Edit ───────────────────────────────────────────────────────────
  function startEdit(m) {
    if (m.deleted_at) return
    editingId.value = m.id
    editingText.value = m.content || ''
    input.value = m.content || ''
    nextTick(() => {
      composerEl.value?.focus()
      const el = composerEl.value
      if (el) {
        el.setSelectionRange(el.value.length, el.value.length)
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
      }
    })
  }

  function cancelEdit() {
    editingId.value = null
    editingText.value = ''
    input.value = loadDraft(chatId.value)
    // closeMentionPopup — caller handles via the returned fn
    nextTick(() => {
      const el = composerEl.value
      if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }
    })
  }

  async function saveEdit() {
    const text = input.value.trim()
    if (!text) return
    const id = editingId.value
    try {
      const updated = await api.editMessage(chatId.value, id, text)
      const i = messages.value.findIndex(x => x.id === id)
      if (i !== -1) Object.assign(messages.value[i], updated)
      cancelEdit()
      if (composerEl.value) composerEl.value.style.height = 'auto'
    } catch (e) {
      showToast(e?.message || 'Failed to edit message', 'error')
    }
  }

  // ── Read-by ────────────────────────────────────────────────────────
  const readByMsgId = ref(null)
  const readByList = ref([])
  const readByLoading = ref(false)

  async function openReadBy(msgId) {
    readByMsgId.value = msgId
    readByList.value = []
    readByLoading.value = true
    try {
      readByList.value = await api.getMessageReadBy(chatId.value, msgId)
    } catch {
      readByList.value = []
    } finally {
      readByLoading.value = false
    }
  }

  // ── Pin ────────────────────────────────────────────────────────────
  const canPin = computed(() => !isAiChat.value && (isOwner.value || !isGroup.value))

  async function doPin(messageId) {
    try {
      const currentId = currentPinned.value?.id
      const res = await api.pinMessage(chatId.value, messageId)
      pinnedMessages.value = res.pinned_messages || []
      pinnedIndex.value = stablePinnedIndex(pinnedMessages.value, currentId)
    } catch (e) { showToast(e?.message || 'Failed to update pinned message', 'error') }
  }

  function pinnedPreview(pm) {
    if (pm.content) return pm.content
    const atts = pm.attachments || []
    if (atts.length > 0) {
      const images = atts.filter(a => a.type === 'image')
      if (images.length) return images.length === 1 ? 'Image' : `${images.length} images`
      const audios = atts.filter(a => a.type === 'audio')
      if (audios.length) return 'Voice message'
      const videos = atts.filter(a => a.type === 'video')
      if (videos.length) return 'Video message'
      return atts[0]?.name || 'File'
    }
    if (pm.attachment_type === 'image') return 'Image'
    if (pm.attachment_type === 'audio') return 'Voice message'
    if (pm.attachment_type === 'video') return 'Video message'
    if (pm.attachment_url) return pm.attachment_name || 'File'
    return ''
  }

  async function clickPinnedBar(jumpToMessage) {
    const pm = currentPinned.value
    if (!pm) return
    const len = pinnedMessages.value.length
    const nextIdx = len > 1 ? (pinnedIndex.value - 1 + len) % len : pinnedIndex.value
    lockPinnedNav()
    await jumpToMessage(pm.id)
    pinnedIndex.value = nextIdx
  }

  async function navigatePin(delta, jumpToMessage) {
    const len = pinnedMessages.value.length
    if (!len) return
    const nextIdx = (pinnedIndex.value + delta + len) % len
    pinnedIndex.value = nextIdx
    lockPinnedNav()
    const pm = pinnedMessages.value[nextIdx]
    if (pm) await jumpToMessage(pm.id)
  }

  function updatePinnedIndexFromScroll(listEl) {
    if (pinnedNavLock || !pinnedMessages.value.length || !listEl.value) return
    const container = listEl.value
    const bottom = container.getBoundingClientRect().bottom
    // Find the newest (highest index) pin whose element hasn't scrolled past the bottom fold.
    let targetIdx = 0
    for (let i = pinnedMessages.value.length - 1; i >= 0; i--) {
      const el = document.getElementById(`msg-${pinnedMessages.value[i].id}`)
      if (!el) continue
      if (el.getBoundingClientRect().top <= bottom) {
        targetIdx = i
        break
      }
    }
    if (pinnedIndex.value !== targetIdx) pinnedIndex.value = targetIdx
  }

  // ── Reactions ──────────────────────────────────────────────────────
  async function doToggleReaction(msgId, emoji) {
    const msg = messages.value.find(m => m.id === msgId)
    if (!msg) return
    navigator.vibrate?.(10)

    const myUser = me.value?.username
    const existing = (msg.reactions || []).find(r => r.emoji === emoji)
    const isMineReaction = existing?.users?.includes(myUser)

    if (!msg.reactions) msg.reactions = []
    if (isMineReaction) {
      const idx = msg.reactions.findIndex(r => r.emoji === emoji)
      if (idx !== -1) {
        const newUsers = msg.reactions[idx].users.filter(u => u !== myUser)
        if (newUsers.length === 0) msg.reactions.splice(idx, 1)
        else msg.reactions[idx] = { ...msg.reactions[idx], count: newUsers.length, users: newUsers }
      }
    } else {
      const idx = msg.reactions.findIndex(r => r.emoji === emoji)
      if (idx !== -1) {
        msg.reactions[idx] = { ...msg.reactions[idx], count: msg.reactions[idx].count + 1, users: [...msg.reactions[idx].users, myUser] }
      } else {
        msg.reactions.push({ emoji, count: 1, users: [myUser] })
      }
    }

    try {
      await api.toggleReaction(chatId.value, msgId, emoji)
    } catch (e) {
      showToast(e.message || 'Failed to toggle reaction', 'error')
    }
  }

  function handleReactionClick(m, emoji, event) {
    const el = event.currentTarget
    el.classList.remove('toggling')
    void el.offsetWidth  // force reflow to restart animation on rapid clicks
    el.classList.add('toggling')
    setTimeout(() => el.classList.remove('toggling'), 300)
    doToggleReaction(m.id, emoji)
  }

  function isMyReaction(msg, emoji) {
    if (!msg) return false
    return (msg.reactions || []).find(r => r.emoji === emoji)?.users?.includes(me.value?.username) ?? false
  }

  // ── Polls ──────────────────────────────────────────────────────────
  async function doVotePoll(messageId, optionId) {
    const msg = messages.value.find(m => m.id === messageId)
    if (!msg?.poll) return
    const poll = msg.poll
    const myVotes = poll.my_votes || []

    let newMyVotes
    if (poll.multiple_answers) {
      newMyVotes = myVotes.includes(optionId)
        ? myVotes.filter(v => v !== optionId)
        : [...myVotes, optionId]
    } else {
      newMyVotes = myVotes.includes(optionId) ? [] : [optionId]
    }

    const updatedOptions = poll.options.map(o => {
      const wasVoted = myVotes.includes(o.id)
      const willBeVoted = newMyVotes.includes(o.id)
      if (wasVoted === willBeVoted) return o
      const delta = willBeVoted ? 1 : -1
      return { ...o, votes: Math.max(0, o.votes + delta) }
    })
    const totalDelta = newMyVotes.length - myVotes.length
    const i = messages.value.findIndex(m => m.id === messageId)
    if (i !== -1) {
      messages.value[i] = {
        ...messages.value[i],
        poll: { ...poll, options: updatedOptions, my_votes: newMyVotes, total_votes: poll.total_votes + totalDelta },
      }
    }

    try {
      const res = await api.votePoll(chatId.value, messageId, [optionId])
      const j = messages.value.findIndex(m => m.id === messageId)
      if (j !== -1 && res.poll) {
        messages.value[j] = { ...messages.value[j], poll: res.poll }
      }
    } catch (e) {
      const j = messages.value.findIndex(m => m.id === messageId)
      if (j !== -1) messages.value[j] = { ...messages.value[j], poll }
      composerError.value = e.message
    }
  }

  async function doRetractPollVote(messageId) {
    const msg = messages.value.find(m => m.id === messageId)
    if (!msg?.poll) return
    const poll = msg.poll
    const myCount = (poll.my_votes || []).length
    const i = messages.value.findIndex(m => m.id === messageId)
    if (i !== -1) {
      messages.value[i] = { ...messages.value[i], poll: { ...poll, my_votes: [], total_votes: Math.max(0, (poll.total_votes || 0) - myCount) } }
    }
    try {
      const res = await api.retractPollVote(chatId.value, messageId)
      const j = messages.value.findIndex(m => m.id === messageId)
      if (j !== -1 && res.poll) messages.value[j] = { ...messages.value[j], poll: res.poll }
    } catch (e) {
      const j = messages.value.findIndex(m => m.id === messageId)
      if (j !== -1) messages.value[j] = { ...messages.value[j], poll }
      showToast(e.message || 'Failed to retract vote', 'error')
    }
  }

  const pollResultsMsg = ref(null)

  function openPollResults(msg) {
    pollResultsMsg.value = msg
  }

  // ── Forward ────────────────────────────────────────────────────────
  const forwardingMsg = ref(null)
  const showForwardModal = ref(false)

  function startForward(m) {
    forwardingMsg.value = m
    showForwardModal.value = true
  }

  async function doForward(targetChatId, router) {
    const m = forwardingMsg.value
    if (!m) return
    showForwardModal.value = false
    forwardingMsg.value = null
    try {
      await api.sendForwardedMessage(targetChatId, m.id)
      showToast('Message forwarded', 'success')
      if (targetChatId !== chatId.value) {
        router.push(`/chats/${targetChatId}`)
      }
    } catch (e) {
      showToast(e?.message || 'Failed to forward message', 'error')
    }
  }

  // ── Bulk selection ─────────────────────────────────────────────────
  const selectionMode = ref(false)
  const selectedMsgIds = ref(new Set())
  const bulkDeleteConfirming = ref(false)

  function enterSelectionMode(msgId) {
    selectionMode.value = true
    selectedMsgIds.value = new Set([msgId])
  }

  function exitSelectionMode() {
    selectionMode.value = false
    selectedMsgIds.value = new Set()
    bulkDeleteConfirming.value = false
  }

  function toggleMsgSelection(msgId) {
    if (!selectionMode.value) return
    const s = new Set(selectedMsgIds.value)
    if (s.has(msgId)) s.delete(msgId)
    else s.add(msgId)
    selectedMsgIds.value = s
    bulkDeleteConfirming.value = false  // reset confirm state when selection changes
    if (s.size === 0) exitSelectionMode()
  }

  function onMsgShiftClick(msgId) {
    if (!selectionMode.value) enterSelectionMode(msgId)
    else toggleMsgSelection(msgId)
  }

  function onMsgClick(e, msgId) {
    if (!selectionMode.value) return
    e.stopPropagation()
    toggleMsgSelection(msgId)
  }

  const canDeleteSelected = computed(() =>
    selectedMsgIds.value.size > 0 &&
    [...selectedMsgIds.value].every(id => {
      const m = messages.value.find(x => x.id === id)
      return m && isMine(m) && !m.deleted_at
    })
  )

  async function bulkDelete() {
    if (!bulkDeleteConfirming.value) {
      bulkDeleteConfirming.value = true
      return
    }
    bulkDeleteConfirming.value = false
    const ids = [...selectedMsgIds.value]
    const deletable = ids.filter(id => {
      const m = messages.value.find(x => x.id === id)
      return m && isMine(m) && !m.deleted_at
    })
    if (!deletable.length) return
    for (const id of deletable) {
      try { await api.deleteMessage(chatId.value, id) } catch {}
    }
    showToast(`${deletable.length} message${deletable.length > 1 ? 's' : ''} deleted`, 'success')
    exitSelectionMode()
  }

  function bulkForward() {
    if (!selectedMsgIds.value.size) return
    const id = [...selectedMsgIds.value][0]
    const m = messages.value.find(x => x.id === id)
    if (!m) return
    forwardingMsg.value = m
    showForwardModal.value = true
    exitSelectionMode()
  }

  // ── Copy ───────────────────────────────────────────────────────────
  function copyMessageText(m, closeMobileMenu) {
    if (m.content) {
      showToast('Copied!', 'success')
      navigator.clipboard?.writeText(m.content).catch(() => {})
    }
    closeMobileMenu?.()
  }

  return {
    deletingMsgId,
    readByMsgId,
    readByList,
    readByLoading,
    forwardingMsg,
    showForwardModal,
    selectionMode,
    selectedMsgIds,
    bulkDeleteConfirming,
    canDeleteSelected,
    pollResultsMsg,
    canPin,
    removeMessage,
    startEdit,
    saveEdit,
    cancelEdit,
    openReadBy,
    doPin,
    doToggleReaction,
    handleReactionClick,
    isMyReaction,
    doVotePoll,
    doRetractPollVote,
    openPollResults,
    startForward,
    doForward,
    enterSelectionMode,
    exitSelectionMode,
    toggleMsgSelection,
    onMsgShiftClick,
    onMsgClick,
    bulkDelete,
    bulkForward,
    copyMessageText,
    pinnedPreview,
    stablePinnedIndex,
    lockPinnedNav,
    clickPinnedBar,
    navigatePin,
    updatePinnedIndexFromScroll,
  }
}
