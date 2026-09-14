import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../api'

/**
 * Composer composable — text input, file attachments, drag-drop, emoji,
 * @mention, link preview, scheduled messages, draft saving.
 *
 * dragCounter is a plain closure variable (NOT a ref) — it tracks enter/leave
 * balance to avoid the overlay flickering on child element boundaries.
 */
export function useComposer({
  chatId,
  me,
  isAiChat,
  isGroup,
  messages,
  participants,
  editingId,
  editingText,
  cancelEdit,
  composerEl,
  fileInputEl,
  emojiButtonEl,
  attachBtnEl,
  sendBtnEl,
  listEl,
  isNearBottom,
  scrollToBottom,
  showToast,
  aiMessages,
  aiLoading,
  scheduledMessages,
  loadScheduled,
  uploading,
}) {
  // ── Draft ─────────────────────────────────────────────────────────
  function saveDraft(id, text) {
    if (!id || id === 'ai') return
    if (text) {
      localStorage.setItem(`draft:${id}`, text)
    } else {
      localStorage.removeItem(`draft:${id}`)
    }
  }

  function loadDraft(id) {
    if (!id || id === 'ai') return ''
    return localStorage.getItem(`draft:${id}`) || ''
  }

  // ── Core state ────────────────────────────────────────────────────
  const input = ref('')
  const composerError = ref('')
  const replyingTo = ref(null)
  const pendingFiles = ref([]) // [{ url, type, name, previewUrl, progress }]
  const dragging = ref(false)
  let dragCounter = 0

  // ── @mention ──────────────────────────────────────────────────────
  const mentionOpen = ref(false)
  const mentionQuery = ref('')
  const mentionIdx = ref(0)
  const mentionCursorStart = ref(0)

  const filteredMentions = computed(() => {
    if (!isGroup.value || !mentionOpen.value) return []
    const q = mentionQuery.value.toLowerCase()
    return participants.value
      .filter(p => !p.is_me && p.username.toLowerCase().startsWith(q))
      .slice(0, 6)
  })

  function closeMentionPopup() {
    mentionOpen.value = false
    mentionQuery.value = ''
    mentionIdx.value = 0
  }

  function selectMention(username) {
    const el = composerEl.value
    if (!el) return
    const before = input.value.slice(0, mentionCursorStart.value)
    const after = input.value.slice(el.selectionStart)
    input.value = before + '@' + username + ' ' + after
    closeMentionPopup()
    nextTick(() => {
      const pos = (before + '@' + username + ' ').length
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }

  // ── Emoji picker ──────────────────────────────────────────────────
  const showEmojiPicker = ref(false)
  const emojiPickerPos = ref({ bottom: 70, left: '50%', transform: 'translateX(-50%)' })

  function toggleEmojiPicker() {
    if (showEmojiPicker.value) {
      showEmojiPicker.value = false
      return
    }
    if (emojiButtonEl.value) {
      const rect = emojiButtonEl.value.getBoundingClientRect()
      const PICKER_W = 310
      const center = rect.left + rect.width / 2
      const clampedLeft = Math.max(PICKER_W / 2 + 8, Math.min(center, window.innerWidth - PICKER_W / 2 - 8))
      emojiPickerPos.value = {
        left: clampedLeft,
        bottom: window.innerHeight - rect.top + 8,
      }
    }
    showEmojiPicker.value = true
  }

  function onEmojiSelect(emoji, { reactionPickerMsgId, showFullReactionPicker, doToggleReaction, closeReactionPicker }) {
    if (showFullReactionPicker.value && reactionPickerMsgId.value) {
      doToggleReaction(reactionPickerMsgId.value, emoji)
      closeReactionPicker()
      return
    }
    input.value += emoji
    composerEl.value?.focus()
  }

  // ── Attach menu ───────────────────────────────────────────────────
  const showAttachMenu = ref(false)
  const attachMenuPos = ref({ bottom: 0, left: 0 })

  function toggleAttachMenu() {
    if (!showAttachMenu.value && attachBtnEl.value) {
      const rect = attachBtnEl.value.getBoundingClientRect()
      attachMenuPos.value = { bottom: window.innerHeight - rect.top + 8, left: rect.left }
    }
    showAttachMenu.value = !showAttachMenu.value
  }

  // ── Send menu ─────────────────────────────────────────────────────
  const showSendMenu = ref(false)
  const sendMenuPos = ref({ bottom: 0, right: 0 })
  let sendLongPressTimer = null
  let sendLongPressTriggered = false

  function openSendMenu() {
    if (sendBtnEl.value) {
      const rect = sendBtnEl.value.getBoundingClientRect()
      sendMenuPos.value = {
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right,
      }
    }
    showSendMenu.value = !showSendMenu.value
  }

  function onSendTouchStart() {
    sendLongPressTriggered = false
    sendLongPressTimer = setTimeout(() => {
      sendLongPressTriggered = true
      if (sendBtnEl.value) {
        const rect = sendBtnEl.value.getBoundingClientRect()
        sendMenuPos.value = { bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right }
      }
      showSendMenu.value = true
    }, 500)
  }

  function onSendTouchEnd(e) {
    clearTimeout(sendLongPressTimer)
    if (sendLongPressTriggered) {
      e.preventDefault()
      sendLongPressTriggered = false
    }
  }

  // ── Poll form ──────────────────────────────────────────────────────
  const showPollForm = ref(false)

  async function submitPoll(pollData) {
    showPollForm.value = false
    try {
      await api.sendPoll(chatId.value, pollData)
    } catch (e) {
      composerError.value = e.message
      showPollForm.value = true
    }
  }

  // ── Scheduled messages ─────────────────────────────────────────────
  const showScheduledList = ref(false)
  const showSchedulePicker = ref(false)

  async function openSchedulePicker() {
    if (isAiChat.value) return
    const text = input.value.trim()
    const atts = pendingFiles.value.slice()
    if (!text && !atts.length) {
      composerError.value = 'Type a message first to schedule it'
      return
    }
    composerError.value = ''
    showSchedulePicker.value = true
  }

  async function onSchedulePicked(isoTime) {
    showSchedulePicker.value = false
    const text = input.value.trim()
    const atts = pendingFiles.value.slice()
    const replyId = replyingTo.value?.id ?? null
    try {
      await api.createScheduledMessage(chatId.value, {
        content: text,
        scheduledAt: isoTime,
        replyToId: replyId,
        attachments: atts,
      })
      input.value = ''
      replyingTo.value = null
      pendingFiles.value = []
      await loadScheduled()
    } catch (e) {
      composerError.value = e.message
    }
  }

  function onScheduledUpdated(updated) {
    const i = scheduledMessages.value.findIndex(s => s.id === updated.id)
    if (i !== -1) {
      scheduledMessages.value = scheduledMessages.value
        .map((s, idx) => idx === i ? updated : s)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    }
  }

  function onScheduledDeleted(id) {
    scheduledMessages.value = scheduledMessages.value.filter(s => s.id !== id)
    if (!scheduledMessages.value.length) showScheduledList.value = false
  }

  // ── Link preview ───────────────────────────────────────────────────
  const composerLinkPreview = ref(null)
  const composerLinkPreviewDismissed = ref(false)
  const composerLinkPreviewLoading = ref(false)
  let linkPreviewDebounce = null

  // ── Typing / input handling ────────────────────────────────────────
  let typingDebounce = null

  function onTyping() {
    // @mention detection — use DOM el.value to avoid reactive/cursor timing issues
    if (isGroup.value && composerEl.value) {
      const el = composerEl.value
      const pos = el.selectionStart
      const textBefore = el.value.slice(0, pos)
      const mentionMatch = textBefore.match(/@(\w*)$/)
      if (mentionMatch) {
        mentionCursorStart.value = textBefore.lastIndexOf('@')
        mentionQuery.value = mentionMatch[1]
        mentionOpen.value = true
        mentionIdx.value = 0
      } else {
        closeMentionPopup()
      }
    }
    // Auto-resize textarea — must run after Vue's v-model reconcile pass
    nextTick(() => {
      const el = composerEl.value
      if (el) {
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
      }
    })
    clearTimeout(typingDebounce)
    typingDebounce = setTimeout(() => {
      // The AI conversation is local; only persisted chats have a typing endpoint.
      if (isAiChat.value || !chatId.value) return
      api.sendTyping(chatId.value).catch(() => {})
    }, 400)
    // Link preview debounce
    clearTimeout(linkPreviewDebounce)
    if (!composerLinkPreviewDismissed.value) {
      const urlMatch = input.value.match(/https?:\/\/[^\s]+/)
      if (urlMatch) {
        composerLinkPreviewLoading.value = true
        composerLinkPreview.value = null
        linkPreviewDebounce = setTimeout(async () => {
          try {
            composerLinkPreview.value = await api.getLinkPreview(urlMatch[0])
          } catch { composerLinkPreview.value = null }
          finally { composerLinkPreviewLoading.value = false }
        }, 800)
      } else {
        composerLinkPreview.value = null
        composerLinkPreviewLoading.value = false
      }
    }
  }

  // ── Keyboard handler ───────────────────────────────────────────────
  function onKeydown(e, { send, bulkDeleteConfirming, exitSelectionMode, selectionMode, closeDesktopMenu, desktopMenu, cancelReply }) {
    if (e.key === 'Escape' && bulkDeleteConfirming.value) {
      bulkDeleteConfirming.value = false
      return
    }
    if (e.key === 'Escape' && selectionMode.value) {
      exitSelectionMode()
      return
    }
    if (mentionOpen.value && filteredMentions.value.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx.value = (mentionIdx.value + 1) % filteredMentions.value.length; return }
      if (e.key === 'ArrowUp') { e.preventDefault(); mentionIdx.value = (mentionIdx.value - 1 + filteredMentions.value.length) % filteredMentions.value.length; return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(filteredMentions.value[mentionIdx.value].username); return }
      if (e.key === 'Escape') { closeMentionPopup(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
    if (e.key === 'Escape') {
      if (desktopMenu.value) { closeDesktopMenu(); return }
      if (editingId.value) cancelEdit()
      else cancelReply()
    }
  }

  // ── File handling ──────────────────────────────────────────────────
  async function processFile(file) {
    if (!file) return
    uploading.value = true
    const placeholder = {
      url: null,
      type: null,
      name: file.name,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      progress: 0,
    }
    const idx = pendingFiles.value.push(placeholder) - 1
    try {
      const result = await api.uploadFile(file, (pct) => {
        if (pendingFiles.value[idx]) pendingFiles.value[idx].progress = pct
      })
      if (pendingFiles.value[idx]) {
        pendingFiles.value[idx] = {
          url: result.url,
          type: result.type,
          name: result.name || file.name,
          previewUrl: result.type === 'image' ? result.url : null,
          progress: 100,
        }
      }
    } catch (err) {
      pendingFiles.value.splice(idx, 1)
      showToast(err?.message || 'Upload failed', 'error')
    } finally {
      uploading.value = false
    }
  }

  async function onFileSelect(e) {
    const files = Array.from(e.target.files)
    e.target.value = ''
    for (const f of files) await processFile(f)
  }

  function cancelFile(idx) {
    if (idx === undefined) pendingFiles.value = []
    else pendingFiles.value.splice(idx, 1)
  }

  // ── Drag-drop ──────────────────────────────────────────────────────
  function onDragEnter(e) {
    if (isAiChat.value) return
    if (!e.dataTransfer?.types.includes('Files')) return
    dragCounter++
    dragging.value = true
  }

  function onDragLeave() {
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      dragging.value = false
    }
  }

  async function onDrop(e) {
    dragCounter = 0
    dragging.value = false
    if (isAiChat.value) return
    const files = Array.from(e.dataTransfer?.files || [])
    for (const f of files) await processFile(f)
  }

  // ── Reply ──────────────────────────────────────────────────────────
  function startReply(m) {
    replyingTo.value = {
      id: m.id,
      sender: m.sender,
      content: m.content,
      deleted: !!m.deleted_at,
      type: m.type,
      attachments: m.attachments,
      attachment_type: m.attachment_type,
      attachment_name: m.attachment_name,
    }
    composerEl.value?.focus()
  }

  function cancelReply() {
    replyingTo.value = null
    closeMentionPopup()
  }

  // ── Send ───────────────────────────────────────────────────────────
  async function send(saveEdit) {
    if (isAiChat.value) {
      const text = input.value.trim()
      if (!text || aiLoading.value) return
      input.value = ''
      if (composerEl.value) composerEl.value.style.height = 'auto'
      composerEl.value?.focus()
      await sendToAi(text)
      return
    }
    if (editingId.value) {
      await saveEdit()
      return
    }
    const text = input.value.trim()
    const atts = pendingFiles.value.slice()
    if (!text && !atts.length) return
    const stillUploading = atts.some(f => f.url === null)
    if (stillUploading) {
      composerError.value = 'Please wait for uploads to finish'
      return
    }
    // Capture scroll position BEFORE clearing the composer
    const wasNearBottom = isNearBottom()
    const replyId = replyingTo.value?.id ?? null
    input.value = ''
    replyingTo.value = null
    pendingFiles.value = []
    composerLinkPreview.value = null
    composerLinkPreviewDismissed.value = false
    if (composerEl.value) { composerEl.value.style.height = 'auto' }
    composerEl.value?.focus()
    navigator.vibrate?.(10)
    try {
      await api.sendMessage(chatId.value, text, replyId, atts)
      if (wasNearBottom) await scrollToBottom()
    } catch (e) {
      showToast(e.message || 'Failed to send message', 'error')
    }
  }

  async function sendToAi(text) {
    aiMessages.value.push({
      id: 'u-' + Date.now(),
      sender: me.value?.username || 'You',
      sender_avatar_url: me.value?.avatar_url || null,
      content: text,
      created_at: new Date().toISOString(),
    })
    await scrollToBottom()
    aiLoading.value = true

    const msgs = aiMessages.value.map(m => ({
      role: m.sender === 'AI Assistant' ? 'assistant' : 'user',
      content: m.content,
    }))

    try {
      const result = await api.aiChat(msgs)
      aiMessages.value.push({
        id: 'ai-' + Date.now(),
        sender: 'AI Assistant',
        sender_avatar_url: null,
        content: result.reply,
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      aiMessages.value.push({
        id: 'ai-err-' + Date.now(),
        sender: 'AI Assistant',
        sender_avatar_url: null,
        content: '⚠ ' + (err.message || 'Something went wrong'),
        created_at: new Date().toISOString(),
      })
    } finally {
      aiLoading.value = false
      await scrollToBottom()
    }
  }

  // ── Draft watcher (owns watch on input) ───────────────────────────
  watch(input, (val) => {
    if (!editingId.value && !isAiChat.value) saveDraft(chatId.value, val)
  })

  // ── Proactive VVH update (owns focusin on composerEl) ─────────────
  // Registered on composerEl when mounted so the shell starts shrinking
  // before the keyboard finishes appearing, reducing the layout jump.
  function _onComposerFocusIn() {
    if (window.innerWidth <= 640 && window.visualViewport) {
      document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px')
    }
  }

  onMounted(() => {
    if (composerEl.value) composerEl.value.addEventListener('focusin', _onComposerFocusIn)
  })

  onBeforeUnmount(() => {
    clearTimeout(linkPreviewDebounce)
    clearTimeout(typingDebounce)
    if (composerEl.value) composerEl.value.removeEventListener('focusin', _onComposerFocusIn)
  })

  return {
    input,
    composerError,
    replyingTo,
    pendingFiles,
    dragging,
    mentionOpen,
    mentionQuery,
    mentionIdx,
    mentionCursorStart,
    filteredMentions,
    showEmojiPicker,
    emojiPickerPos,
    showAttachMenu,
    attachMenuPos,
    showSendMenu,
    sendMenuPos,
    showPollForm,
    showScheduledList,
    showSchedulePicker,
    composerLinkPreview,
    composerLinkPreviewDismissed,
    composerLinkPreviewLoading,
    send,
    onTyping,
    onKeydown,
    selectMention,
    closeMentionPopup,
    onEmojiSelect,
    toggleEmojiPicker,
    toggleAttachMenu,
    openSendMenu,
    onSendTouchStart,
    onSendTouchEnd,
    openSchedulePicker,
    onSchedulePicked,
    onScheduledUpdated,
    onScheduledDeleted,
    onFileSelect,
    cancelFile,
    processFile,
    onDragEnter,
    onDragLeave,
    onDrop,
    startReply,
    cancelReply,
    submitPoll,
    saveDraft,
    loadDraft,
    linkPreviewDebounce: { get value() { return linkPreviewDebounce }, set value(v) { linkPreviewDebounce = v } },
    dragCounterReset() { dragCounter = 0 },
  }
}
