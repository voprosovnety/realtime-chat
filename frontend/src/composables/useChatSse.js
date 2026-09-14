import { ref } from 'vue'
import { api } from '../api'

// ── Module-level SSE state (OUTSIDE the exported function, plain vars, NOT refs) ─
// These MUST be at module scope so they persist across re-renders and the gen
// guard works correctly. If placed inside the function the guard breaks.
let es = null
let chatSseStopped = false
let chatSseDelay = 1000
let chatSseTimer = null
let chatSseGen = 0

/**
 * SSE connection composable.
 *
 * All parameters are passed individually (NOT collapsed into one context object)
 * so the caller can see exactly what state this composable touches.
 *
 * Registers NO lifecycle hooks — ChatView calls stopChatSse() from the chatId
 * watcher and onBeforeUnmount in a specific order.
 */
export function useChatSse({
  chatId,
  me,
  messages,
  chatSidebarRef,
  participants,
  chat,
  pinnedMessages,
  pinnedIndex,
  peerDeliveredId,
  peerReadId,
  newMessageIds,
  showScrollBtn,
  unreadWhileScrolled,
  typingUsersMap,   // reactive({}) — username → true for current chat
  typingUserTimers, // plain {} — username → timeoutId
  peerReadAt,
  currentPinned,
  scheduledMessages,
  isNearBottom,
  scrollToBottom,
  markReadIfPossible,
  markDelivered,
  loadScheduled,
  isMuted,
  playNotifSound,
  sortReactions,
  stablePinnedIndex,
  router,
}) {
  const sseStatus = ref('connected')

  function myId() { return me.value?.username || '' }

  function stopChatSse() {
    chatSseStopped = true
    chatSseGen++
    clearTimeout(chatSseTimer)
    if (es) { es.close(); es = null }
  }

  async function connectSse() {
    chatSseStopped = false
    chatSseDelay = 1000
    const gen = ++chatSseGen

    const attempt = async () => {
      if (chatSseStopped || chatSseGen !== gen) return
      try {
        const sub = await api.subscribeAllChats()
        if (chatSseStopped || chatSseGen !== gen) return
        const params = new URLSearchParams()
        for (const t of sub.topics || []) params.append('topic', t)
        const source = new EventSource(`/.well-known/mercure?${params.toString()}`, { withCredentials: true })
        es = source

        source.onopen = () => { chatSseDelay = 1000; sseStatus.value = 'connected' }
        source.onmessage = async (evt) => {
          const payload = JSON.parse(evt.data)
          const d = payload.data

          if (payload.type === 'chat.created') {
            // CRITICAL: stopChatSse() must be the very FIRST synchronous operation
            // before any await, to prevent race conditions with the gen counter.
            stopChatSse()
            await chatSidebarRef.value?.loadSidebarChats()
            await connectSse()
            return
          }

          if (payload.type === 'chat.deleted') {
            const deletedId = d?.chat_id
            if (deletedId) {
              chatSidebarRef.value?.removeSidebarChat(deletedId)
              if (chatId.value === deletedId) router.push('/')
            }
            return
          }

          if (payload.type === 'chat.updated') {
            const updatedId = d?.chat_id
            const newTitle = d?.title
            if (updatedId && newTitle) {
              chatSidebarRef.value?.replaceSidebarChats(c =>
                c.id === updatedId ? { ...c, display_name: newTitle, title: newTitle } : c
              )
              if (chatId.value === updatedId) chat.value = { ...chat.value, title: newTitle, display_name: newTitle }
            }
            return
          }

          if (payload.type === 'chat.member_removed') {
            if (d?.chat_id === chatId.value && d?.user_id) {
              participants.value = participants.value.filter(p => p.id !== d.user_id)
            }
            return
          }

          // Typing indicator — handled before per-chat filter so all chats get it
          if (payload.type === 'user.typing') {
            const tChatId = d.chatId ?? d.chat_id
            if (tChatId && d.username !== myId()) {
              // stm is the exposed ref auto-unwrapped to its reactive value
              // object — mutate keys directly (Proxy traps keep it reactive).
              const stm = chatSidebarRef.value?.sidebarTypingMap
              const sts = chatSidebarRef.value?.sidebarTypingTimers
              if (stm && sts) {
                stm[tChatId] = d.username
                clearTimeout(sts[tChatId])
                sts[tChatId] = setTimeout(() => {
                  delete stm[tChatId]
                }, 3000)
              }
              if (tChatId === chatId.value) {
                typingUsersMap[d.username] = true
                clearTimeout(typingUserTimers[d.username])
                typingUserTimers[d.username] = setTimeout(() => {
                  delete typingUsersMap[d.username]
                }, 3000)
              }
            }
            return
          }

          // Sidebar update for every message.created regardless of chat
          if (payload.type === 'message.created') {
            // Clear typing for this chat since message was sent
            const stm = chatSidebarRef.value?.sidebarTypingMap
            const sts = chatSidebarRef.value?.sidebarTypingTimers
            if (stm && sts && stm[d.chat_id]) {
              clearTimeout(sts[d.chat_id])
              delete stm[d.chat_id]
            }
            if (d.chat_id === chatId.value && d.sender && typingUsersMap[d.sender]) {
              clearTimeout(typingUserTimers[d.sender])
              delete typingUsersMap[d.sender]
            }
            const fromMe = d.sender === myId()
            chatSidebarRef.value?.sortAndReplaceSidebarChats(c => {
              if (c.id !== d.chat_id) return c
              return {
                ...c,
                last_message: {
                  content: d.content,
                  created_at: d.created_at,
                  sender_username: d.sender,
                  type: d.type ?? 'text',
                  attachment_url: d.attachment_url ?? null,
                  attachment_type: d.attachment_type ?? null,
                  attachments: d.attachments ?? null,
                },
                unread_count: (d.chat_id === chatId.value || fromMe) ? c.unread_count : (c.unread_count || 0) + 1,
              }
            })
          }

          // All other logic only applies to the currently open chat
          const eventChatId = d?.chat_id ?? d?.chatId
          if (eventChatId && eventChatId !== chatId.value) return

          const shouldStick = isNearBottom()

          if (payload.type === 'message.created') {
            if (!messages.value.find(m => m.id === d.id)) {
              messages.value.push(d)
              newMessageIds.value = new Set([...newMessageIds.value, d.id])
              setTimeout(() => {
                newMessageIds.value = new Set([...newMessageIds.value].filter(x => x !== d.id))
              }, 300)
            }
            if (showScrollBtn.value && d.sender !== myId()) {
              unreadWhileScrolled.value++
            }
            // Play notification sound for messages from others, in background or different chat
            if (d.sender !== myId() && !isMuted(d.chat_id)) {
              if (document.hidden || d.chat_id !== chatId.value) {
                playNotifSound()
              }
            }
            // Apply the arrival-time scroll intent before slow receipts can
            // finish after the reader has already scrolled up.
            if (shouldStick) await scrollToBottom()
            await markDelivered(chatId.value, d.id)
            await markReadIfPossible()
            if (d.sender === myId() && scheduledMessages.value.length) loadScheduled()
            return
          }
          if (payload.type === 'message.edited') {
            const i = messages.value.findIndex(m => m.id === d.id)
            if (i !== -1) Object.assign(messages.value[i], d)
            return
          }
          if (payload.type === 'message.deleted') {
            const i = messages.value.findIndex(m => m.id === d.id)
            if (i !== -1) messages.value[i].deleted_at = d.deleted_at
            return
          }
          if (payload.type === 'chat.delivered') {
            if (d?.user && d.user !== myId()) {
              const id = d.last_delivered_message_id
              if (id && (!peerDeliveredId.value || String(id) > String(peerDeliveredId.value))) peerDeliveredId.value = id
            }
            return
          }
          if (payload.type === 'chat.read') {
            if (d?.user && d.user !== myId()) {
              const id = d.last_read_message_id
              if (id && (!peerReadId.value || String(id) > String(peerReadId.value))) {
                peerReadId.value = id
                if (d.at) peerReadAt.value = d.at
              }
            }
            return
          }
          if (payload.type === 'message.reaction') {
            const i = messages.value.findIndex(m => m.id === d.message_id)
            if (i !== -1) messages.value[i].reactions = sortReactions(d.reactions)
            return
          }
          if (payload.type === 'message.pinned') {
            const currentId = currentPinned.value?.id
            pinnedMessages.value = d.pinned_messages || []
            pinnedIndex.value = stablePinnedIndex(pinnedMessages.value, currentId)
            return
          }
          if (payload.type === 'poll.voted') {
            const i = messages.value.findIndex(m => m.id === d.message_id)
            if (i !== -1 && d.poll) {
              const myV = messages.value[i].poll?.my_votes
              messages.value[i] = { ...messages.value[i], poll: { ...d.poll, my_votes: myV ?? d.poll.my_votes } }
            }
            return
          }
        }
        source.onerror = () => {
          source.close()
          if (chatSseStopped || chatSseGen !== gen) return
          sseStatus.value = 'reconnecting'
          chatSseTimer = setTimeout(attempt, chatSseDelay)
          chatSseDelay = Math.min(chatSseDelay * 2, 30000)
        }
      } catch {
        if (chatSseStopped || chatSseGen !== gen) return
        if (!localStorage.getItem('access_token')) {
          router.push('/login')
          return
        }
        sseStatus.value = 'reconnecting'
        chatSseTimer = setTimeout(attempt, chatSseDelay)
        chatSseDelay = Math.min(chatSseDelay * 2, 30000)
      }
    }

    await attempt()
  }

  return { sseStatus, connectSse, stopChatSse }
}
