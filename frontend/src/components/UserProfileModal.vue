<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal user-profile-modal" role="dialog" aria-modal="true" aria-label="User profile">
        <button class="btn-icon modal-close-btn" aria-label="Close" @click="$emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div v-if="loading" class="user-profile-loading">Loading…</div>

        <template v-else-if="user">
          <!-- Halo cover band + avatar overlap -->
          <div class="modal-cover-band" :style="coverStyle"></div>
          <div class="modal-avatar-halo">
            <UserAvatar
              :username="user.username"
              :avatarUrl="user.avatar_url"
              :isOnline="user.is_online"
              size="2xl"
              :style="user.avatar_url ? 'cursor:zoom-in' : ''"
              @click="user.avatar_url ? (lightboxOpen = true) : undefined"
            />
          </div>

          <div class="modal-profile-body">
            <div class="user-profile-name">{{ user.username }}</div>
            <div class="user-profile-status">
              <span v-if="user.is_online" class="status-online">● Online</span>
              <span v-else-if="user.last_seen_at" class="status-offline">Last seen {{ formatRelative(user.last_seen_at) }}</span>
              <span v-else class="status-offline">Offline</span>
            </div>

            <!-- Meta info card -->
            <div class="modal-meta-card">
              <div class="meta-row">
                <span class="meta-key">Username</span>
                <span class="meta-val">@{{ user.username }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-key">Status</span>
                <span class="meta-val">{{ user.is_online ? 'Online' : 'Offline' }}</span>
              </div>
            </div>

            <div v-if="!user.is_me" class="user-profile-actions">
              <button class="btn btn-primary" style="width:100%" :disabled="starting" @click="startChat">
                {{ starting ? 'Opening…' : 'Send message' }}
              </button>
            </div>
            <div v-else class="user-profile-actions">
              <button class="btn btn-ghost" style="width:100%" @click="$emit('go-profile')">Edit profile</button>
            </div>
            <div v-if="chatId && user && !user.is_me" class="user-profile-actions" style="margin-top:4px">
              <button class="btn btn-ghost" style="width:100%;gap:6px" @click="$emit('open-media')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                Media
              </button>
            </div>
          </div>
        </template>

        <div v-else class="user-profile-loading">User not found</div>
      </div>
    </div>

    <ImageLightbox
      v-if="lightboxOpen && user?.avatar_url"
      :images="[user.avatar_url]"
      :index="0"
      @close="lightboxOpen = false"
      @navigate="() => {}"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import UserAvatar from './UserAvatar.vue'
import ImageLightbox from './ImageLightbox.vue'
import { api } from '../api.js'

const props = defineProps({
  username: { type: String, required: true },
  sidebarChats: { type: Array, default: () => [] },
  chatId: { type: [String, null], default: null },
})
const emit = defineEmits(['close', 'open-chat', 'go-profile', 'open-media'])

const user = ref(null)
const loading = ref(true)
const starting = ref(false)
const lightboxOpen = ref(false)

const coverStyle = computed(() => ({
  background: 'linear-gradient(135deg, #1a2d4a 0%, #0f1117 100%)'
}))

onMounted(async () => {
  try {
    user.value = await api.getUser(props.username)
  } finally {
    loading.value = false
  }
})

function formatRelative(iso) {
  if (!iso) return 'a while ago'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

async function startChat() {
  starting.value = true
  try {
    const existing = props.sidebarChats.find(c => !c.is_group && c.peer_username === props.username)
    if (existing) {
      emit('open-chat', existing.id)
    } else {
      const chat = await api.createChat({ isGroup: false, participants: [props.username] })
      emit('open-chat', chat.id)
    }
    emit('close')
  } catch {
    starting.value = false
  }
}

function onKey(e) { if (e.key === 'Escape') emit('close') }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>
