<template>
  <aside class="sidebar" :class="{ 'sidebar-hidden': sidebarHidden }">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color:#fff">
          <path d="M20 2H4C2.9 2 2 2.9 2 4v12c0 1.1.9 2 2 2h6l4 4 4-4h2c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4 9c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM8 11c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
        </svg>
      </div>
      <span class="sidebar-logo-text">RealtimeChat</span>
      <button class="online-indicator" :class="{ active: showOnlinePanel }" :title="showOnlinePanel ? 'Close' : 'Online users'" @click="$emit('update:showOnlinePanel', !showOnlinePanel)">
        <span class="online-indicator-dot"></span>{{ onlineUsers.length }} online
      </button>
      <button class="btn-icon" :class="{ active: globalSearchOpen }" title="Search all messages" aria-label="Search all messages" @click="$emit('update:showOnlinePanel', false); $emit('update:globalSearchOpen', !globalSearchOpen)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <button class="btn-icon" title="New chat" aria-label="New chat" @click="$emit('open-create')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>

    <OnlineUsersPanel
      v-if="showOnlinePanel"
      :users="onlineUsers"
      @open-profile="$emit('open-user-profile', $event)"
      @close="$emit('update:showOnlinePanel', false)"
    />
    <GlobalSearchPanel
      v-else-if="globalSearchOpen"
      @close="$emit('update:globalSearchOpen', false)"
      @select="$emit('global-search-select', $event)"
    />
    <div v-else class="sidebar-chats">
      <!-- AI Assistant entry -->
      <button
        class="chat-item"
        :class="{ active: chatId === 'ai' }"
        type="button"
        @click="$emit('navigate-chat', 'ai')"
      >
        <div class="ai-chat-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/></svg>
        </div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">AI Assistant</span>
          </div>
          <div class="chat-item-top" style="margin-top:1px">
            <span class="chat-item-preview">Ask me anything</span>
          </div>
        </div>
      </button>

      <div v-if="sidebarChats.length" class="chats-section-header">
        <span class="chats-section-label">Conversations</span>
        <button class="btn-icon chats-section-search-btn" title="Filter chats" @click.stop="sidebarSearchOpen = !sidebarSearchOpen">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>
      <div v-if="sidebarSearchOpen" class="sidebar-search-bar">
        <input
          v-model="sidebarSearch"
          class="sidebar-chat-filter-input"
          placeholder="Filter chats…"
          autocomplete="off"
          ref="sidebarFilterInputRef"
          @keydown.escape="sidebarSearch = ''; sidebarSearchOpen = false"
        />
        <button class="sidebar-search-close" @click="sidebarSearch = ''; sidebarSearchOpen = false">×</button>
      </div>
      <template v-for="(c, idx) in filteredSidebarChats" :key="c.id">
        <div v-if="c.is_pinned && (idx === 0 || !filteredSidebarChats[idx - 1]?.is_pinned)" class="sidebar-section-label">Pinned</div>
        <div v-if="!c.is_pinned && hasPinnedChats && (idx === 0 || filteredSidebarChats[idx - 1]?.is_pinned)" class="sidebar-section-label">Chats</div>
        <button
          class="chat-item"
          :class="{ active: c.id === chatId, unread: (c.unread_count || 0) > 0 }"
          type="button"
          @click="$emit('navigate-chat', c.id)"
          @contextmenu.prevent="openSidebarMenu($event, c)"
        >
        <UserAvatar :username="c.display_name || c.id" :avatarUrl="c.avatar_url || null" size="lg" shape="circle" />
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">{{ c.display_name || c.id }}</span>
            <svg v-if="isMuted(c.id)" class="muted-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            <svg v-if="c.is_pinned" class="sidebar-pin-icon" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 1l-1.5 1.5 1 1-5.5 5.5-2-1L6.5 9.5 9 12H5l-1 1 4 4 1-1v-4l2.5 2.5 1.5-1.5-1-2 5.5-5.5 1 1L19 5.5z"/></svg>
            <span class="chat-item-time">{{ formatTimeShort(c.last_message?.created_at) }}</span>
          </div>
          <div class="chat-item-top" style="margin-top:1px">
            <span class="chat-item-preview" :class="{ 'chat-item-preview--typing': sidebarTypingMap[c.id] }">
              <template v-if="sidebarTypingMap[c.id]">
                <span v-if="c.is_group" class="sidebar-typing-name">{{ sidebarTypingMap[c.id] }}</span>
                <span class="typing-dots typing-dots--sm"><span></span><span></span><span></span></span>
              </template>
              <template v-else>
                <span v-if="draftMap[c.id]" class="draft-label">Draft: </span>{{ sidebarPreview(c) }}
              </template>
            </span>
            <span v-if="(c.unread_count || 0) > 0" class="unread-badge" :class="{ 'unread-badge--muted': isMuted(c.id) }">{{ c.unread_count }}</span>
          </div>
        </div>
        </button>
      </template>
    </div>

    <div class="sidebar-footer">
      <UserAvatar :username="me?.username || '?'" :avatarUrl="me?.avatar_url" size="md" style="cursor:pointer" @click="$emit('navigate-profile')" />
      <div class="sidebar-footer-user" style="cursor:pointer" @click="$emit('navigate-profile')">
        <div class="sidebar-footer-name">{{ me?.username || '…' }}</div>
        <div class="sidebar-footer-status">{{ me?.email }}</div>
      </div>
      <button class="btn-icon" title="Logout" aria-label="Logout" @click="$emit('logout')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
    <div class="sidebar-version" :title="`RealtimeChat v${appVersion}`">v{{ appVersion }}</div>
  </aside>

  <!-- Sidebar chat context menu (pin/unpin) -->
  <Teleport to="body">
    <template v-if="sidebarItemMenu">
      <div class="sidebar-ctx-backdrop" @click="closeSidebarMenu" @contextmenu.prevent="closeSidebarMenu"></div>
      <div
        ref="sidebarCtxMenuEl"
        class="sidebar-ctx-menu"
        :style="{ left: sidebarItemMenu.x + 'px', top: sidebarItemMenu.y + 'px' }"
      >
        <button class="sidebar-ctx-item" @click="togglePin(sidebarItemMenu.chat)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M16 1l-1.5 1.5 1 1-5.5 5.5-2-1L6.5 9.5 9 12H5l-1 1 4 4 1-1v-4l2.5 2.5 1.5-1.5-1-2 5.5-5.5 1 1L19 5.5z"/>
          </svg>
          {{ sidebarItemMenu.chat.is_pinned ? 'Unpin' : 'Pin' }}
        </button>
      </div>
    </template>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { api } from '../api'
import UserAvatar from './UserAvatar.vue'
import OnlineUsersPanel from './OnlineUsersPanel.vue'
import GlobalSearchPanel from './GlobalSearchPanel.vue'

const props = defineProps({
  chatId: { type: String, default: null },
  me: { type: Object, default: null },
  appVersion: { type: String, default: 'dev' },
  onlineUsers: { type: Array, default: () => [] },
  showOnlinePanel: { type: Boolean, default: false },
  globalSearchOpen: { type: Boolean, default: false },
  sidebarHidden: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-create',
  'logout',
  'navigate-chat',
  'navigate-profile',
  'open-user-profile',
  'global-search-select',
  'update:showOnlinePanel',
  'update:globalSearchOpen',
])

// ── State owned by sidebar ─────────────────────────────────────────
const sidebarChats = ref([])
const sidebarSearch = ref('')
const sidebarSearchOpen = ref(false)
const sidebarFilterInputRef = ref(null)
const sidebarItemMenu = ref(null) // { chat, x, y, adjusted? }
const sidebarCtxMenuEl = ref(null)
const draftMap = ref({})
const sidebarTypingMap = ref({})
const sidebarTypingTimers = {} // non-reactive

// ── Mute ──────────────────────────────────────────────────────────
const mutedChats = ref(new Set(JSON.parse(localStorage.getItem('mutedChats') || '[]')))

function isMuted(id) { return mutedChats.value.has(id) }

function toggleMute(id) {
  const s = new Set(mutedChats.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  mutedChats.value = s
  localStorage.setItem('mutedChats', JSON.stringify([...s]))
}

// ── Computed ───────────────────────────────────────────────────────
const filteredSidebarChats = computed(() => {
  const sorted = [...sidebarChats.value].sort((a, b) => {
    if (a.is_pinned === b.is_pinned) return 0
    return a.is_pinned ? -1 : 1
  })
  if (!sidebarSearch.value.trim()) return sorted
  const q = sidebarSearch.value.toLowerCase()
  return sorted.filter(c => (c.title || c.display_name || '').toLowerCase().includes(q))
})

const hasPinnedChats = computed(() => filteredSidebarChats.value.some(c => c.is_pinned))

const totalUnread = computed(() =>
  sidebarChats.value.reduce((sum, c) => {
    if (mutedChats.value.has(c.id)) return sum
    return sum + (c.unread_count || 0)
  }, 0)
)

// ── Tab title ──────────────────────────────────────────────────────
watch(totalUnread, n => {
  document.title = n > 0 ? `(${n}) RealtimeChat` : 'RealtimeChat'
}, { immediate: true })

// ── Sidebar search focus ───────────────────────────────────────────
watch(sidebarSearchOpen, (val) => {
  if (val) nextTick(() => sidebarFilterInputRef.value?.focus())
})

// ── Smart repositioning of sidebar context menu ───────────────────
// Runs after Vue renders the menu element so we can read its actual size
// and clamp it to the viewport — critical on narrow mobile screens (≤390px)
// where the sidebar is only 280px wide and an unclamped right-edge position
// would push the menu off-screen.
watch(sidebarItemMenu, (newVal) => {
  if (!newVal || newVal.adjusted) return
  if (!sidebarCtxMenuEl.value) return
  const el = sidebarCtxMenuEl.value
  const menuW = el.offsetWidth || 130
  const menuH = el.offsetHeight || 50
  const vw = window.innerWidth
  const vh = window.innerHeight
  const EDGE = 8
  const SAFE_BOTTOM = 20
  let x = Math.max(EDGE, Math.min(newVal.x, vw - menuW - EDGE))
  let y = Math.max(EDGE, Math.min(newVal.y, vh - menuH - EDGE - SAFE_BOTTOM))
  sidebarItemMenu.value = { ...newVal, x, y, adjusted: true }
}, { flush: 'post' })

// ── Sidebar pin context menu ───────────────────────────────────────
function openSidebarMenu(e, chat) {
  e.preventDefault()
  sidebarItemMenu.value = { chat, x: e.clientX, y: e.clientY }
}

function closeSidebarMenu() {
  sidebarItemMenu.value = null
}

async function togglePin(c) {
  try {
    const result = await api.toggleSidebarPin(c.id)
    const idx = sidebarChats.value.findIndex(sc => sc.id === c.id)
    if (idx !== -1) {
      sidebarChats.value[idx] = { ...sidebarChats.value[idx], is_pinned: result.is_pinned }
    }
  } catch (e) {
    // showToast not available here; parent can handle via emit if needed
  } finally {
    closeSidebarMenu()
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function formatTimeShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function sidebarPreview(c) {
  const draft = draftMap.value[c.id]
  if (draft) return draft
  const lm = c.last_message
  if (!lm) return 'No messages'
  const isMe = lm.sender_username === props.me?.username
  const prefix = c.is_group
    ? (isMe ? 'You: ' : (lm.sender_username ? lm.sender_username + ': ' : ''))
    : (isMe ? 'You: ' : '')
  if (lm.type === 'poll') return prefix + '📊 Poll'
  if (lm.attachments?.length) {
    const imgs = lm.attachments.filter(a => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(a.url || ''))
    if (imgs.length > 1) return prefix + imgs.length + ' photos'
    if (imgs.length === 1) return prefix + 'Photo'
    const vids = lm.attachments.filter(a => /\.(mp4|webm|mov|avi)(\?|$)/i.test(a.url || ''))
    if (vids.length) return prefix + 'Video'
    return prefix + 'File'
  }
  if (lm.content) return prefix + lm.content
  if (lm.attachment_type === 'audio') return prefix + 'Voice message'
  if (lm.attachment_type === 'image') return prefix + 'Photo'
  if (lm.attachment_type === 'video') return prefix + 'Video'
  if (lm.attachment_url) return prefix + 'File'
  return prefix || 'No messages'
}

// ── Public API (exposed to ChatView via template ref) ──────────────
async function loadSidebarChats() {
  try {
    const data = await api.listChats()
    sidebarChats.value = data.items || []
  } catch {}
}

function clearCurrentChatUnread(chatId) {
  const idx = sidebarChats.value.findIndex(c => c.id === chatId)
  if (idx === -1) return
  sidebarChats.value = sidebarChats.value.map((c, i) => i === idx ? { ...c, unread_count: 0 } : c)
}

function updateSidebarChat(chatId, patch) {
  const idx = sidebarChats.value.findIndex(c => c.id === chatId)
  if (idx !== -1) {
    sidebarChats.value[idx] = { ...sidebarChats.value[idx], ...patch }
  }
}

function removeSidebarChat(chatId) {
  sidebarChats.value = sidebarChats.value.filter(c => c.id !== chatId)
}

function addSidebarChat(chat) {
  if (!sidebarChats.value.find(c => c.id === chat.id)) {
    sidebarChats.value.unshift(chat)
  }
}

function setSidebarChats(items) {
  sidebarChats.value = items
}

function replaceSidebarChats(mapFn) {
  sidebarChats.value = sidebarChats.value.map(mapFn)
}

function sortAndReplaceSidebarChats(mapFn) {
  const arr = sidebarChats.value.map(mapFn)
  arr.sort((a, b) => {
    const ta = a.last_message?.created_at ? Date.parse(a.last_message.created_at) : Date.parse(a.created_at || 0)
    const tb = b.last_message?.created_at ? Date.parse(b.last_message.created_at) : Date.parse(b.created_at || 0)
    return tb - ta
  })
  sidebarChats.value = arr
}

function setDraftMap(map) {
  draftMap.value = map
}

function updateDraft(chatId, text) {
  if (!chatId || chatId === 'ai') return
  if (text) {
    draftMap.value = { ...draftMap.value, [chatId]: text }
  } else {
    const m = { ...draftMap.value }
    delete m[chatId]
    draftMap.value = m
  }
}

function focusSidebarSearch() {
  sidebarSearchOpen.value = true
  nextTick(() => sidebarFilterInputRef.value?.focus())
}

defineExpose({
  sidebarChats,
  loadSidebarChats,
  clearCurrentChatUnread,
  updateSidebarChat,
  removeSidebarChat,
  addSidebarChat,
  setSidebarChats,
  replaceSidebarChats,
  sortAndReplaceSidebarChats,
  draftMap,
  setDraftMap,
  updateDraft,
  sidebarTypingMap,
  sidebarTypingTimers,
  mutedChats,
  isMuted,
  toggleMute,
  filteredSidebarChats,
  closeSidebarMenu,
  focusSidebarSearch,
})
</script>

<style scoped>
.muted-icon {
  color: var(--text-3);
  flex-shrink: 0;
  display: block;
}
</style>
