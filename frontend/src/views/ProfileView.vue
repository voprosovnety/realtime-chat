<template>
  <div class="profile-page">
    <div class="profile-card">
      <div class="profile-card-header">
        <button class="btn-icon" title="Back" @click="router.push('/')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="profile-card-title">Profile settings</span>
      </div>

      <div v-if="loading" style="color:var(--text-2);font-size:14px">Loading…</div>

      <template v-else>
        <div class="profile-avatar-section">
          <div style="position:relative;flex-shrink:0">
            <UserAvatar
              :username="username || '?'"
              :avatarUrl="avatarUrl || null"
              size="xl"
              :style="lightboxImages.length ? 'cursor:zoom-in' : ''"
              @click="openAvatarLightbox"
            />
            <label class="avatar-upload-btn" title="Change photo" :class="{ loading: uploadingAvatar }">
              <input type="file" accept="image/*" style="display:none" :disabled="uploadingAvatar" @change="onAvatarFile" />
              <svg v-if="!uploadingAvatar" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            </label>
          </div>

          <div>
            <div style="font-size:15px;font-weight:600;color:var(--text)">{{ username }}</div>
            <div style="font-size:13px;color:var(--text-2);margin-top:2px">{{ email }}</div>
            <button
              type="button"
              class="preset-toggle"
              @click="showPresets = !showPresets"
            >{{ showPresets ? 'Hide presets' : 'Choose preset' }}</button>
          </div>
        </div>

        <!-- Preset avatar picker -->
        <div v-if="showPresets" class="preset-grid">
          <button
            v-for="name in presetAvatars"
            :key="name"
            type="button"
            class="preset-item"
            :class="{ active: avatarUrl === `/avatars/${name}.svg` }"
            :title="name"
            @click="applyPreset(name)"
          >
            <img :src="`/avatars/${name}.svg`" :alt="name" />
          </button>
        </div>

        <div v-if="success" class="profile-success-banner">
          Profile updated successfully
        </div>
        <div v-if="error" class="auth-error">{{ error }}</div>

        <form @submit.prevent="save">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input :value="username" class="input" type="text" disabled style="opacity:0.5;cursor:not-allowed" />
            <p style="font-size:12px;color:var(--text-3);margin-top:4px">Username cannot be changed.</p>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input :value="email" class="input" type="email" disabled style="opacity:0.5;cursor:not-allowed" />
            <p style="font-size:12px;color:var(--text-3);margin-top:4px">Email cannot be changed.</p>
          </div>

          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
        </form>

        <div class="profile-theme-row">
          <span class="profile-theme-label">Appearance</span>
          <button class="btn btn-secondary profile-theme-btn" @click="toggleTheme">
            {{ isDark ? '☀️ Light mode' : '🌙 Dark mode' }}
          </button>
        </div>

        <div class="profile-theme-row">
          <span class="profile-theme-label">Density</span>
          <button class="btn btn-secondary profile-theme-btn" @click="toggleDensity">
            {{ isCompact ? '↕️ Comfortable' : '☰ Compact' }}
          </button>
        </div>

        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border)">
          <button class="btn btn-danger" style="width:100%" @click="logout">Sign out</button>
        </div>
      </template>
    </div>
  </div>

  <!-- Avatar lightbox -->
  <ImageLightbox
    v-if="lightboxOpen && lightboxImages.length"
    :images="lightboxImages"
    :index="lightboxIndex"
    :canApply="true"
    :currentImageIndex="0"
    @close="lightboxOpen = false"
    @navigate="lightboxIndex = $event"
    @apply="applyFromLightbox($event)"
    @delete="deleteFromLightbox($event)"
  />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import UserAvatar from '../components/UserAvatar.vue'
import ImageLightbox from '../components/ImageLightbox.vue'

const router = useRouter()

const isDark = ref(document.documentElement.getAttribute('data-theme') !== 'light')

function toggleTheme() {
  isDark.value = !isDark.value
  // Persist the choice explicitly (including 'dark') so a manual selection is not
  // forgotten on the next load and overridden by the OS preference. 'dark' has no
  // dedicated CSS selector — it falls through to the :root defaults, which are dark.
  const theme = isDark.value ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

const isCompact = ref(document.documentElement.getAttribute('data-density') === 'compact')

function toggleDensity() {
  isCompact.value = !isCompact.value
  if (isCompact.value) {
    document.documentElement.setAttribute('data-density', 'compact')
    localStorage.setItem('density', 'compact')
  } else {
    document.documentElement.removeAttribute('data-density')
    localStorage.removeItem('density')
  }
}

const username = ref('')
const email = ref('')
const avatarUrl = ref('')
const loading = ref(true)
const saving = ref(false)
const uploadingAvatar = ref(false)
const error = ref('')
const success = ref(false)
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const avatarHistory = ref([])
const showPresets = ref(false)

const lightboxImages = computed(() => {
  const urls = []
  if (avatarUrl.value) urls.push(avatarUrl.value)
  for (const h of avatarHistory.value) {
    if (h.url !== avatarUrl.value) urls.push(h.url)
  }
  return urls
})

function openAvatarLightbox() {
  if (!lightboxImages.value.length) return
  lightboxIndex.value = 0
  lightboxOpen.value = true
}

const presetAvatars = [
  'dog','cat','rabbit','fox','bear','panda','koala','tiger','lion','wolf',
  'monkey','pig','cow','frog','hamster','mouse','horse','unicorn','chicken',
  'penguin','duck','owl','turtle','octopus','shark','dolphin','giraffe',
  'zebra','crocodile','butterfly',
]

onMounted(async () => {
  try {
    const me = await api.me()
    username.value = me.username || ''
    email.value = me.email || ''
    avatarUrl.value = me.avatar_url || ''
    const hist = await api.getUserAvatarHistory()
    avatarHistory.value = hist.items || []
  } catch {
    router.push('/login')
  } finally {
    loading.value = false
  }
})

async function save() {
  error.value = ''
  success.value = false
  saving.value = true
  try {
    await api.updateProfile({ avatarUrl: avatarUrl.value.trim() || null })
    success.value = true
    setTimeout(() => { success.value = false }, 3000)
  } catch (e) {
    error.value = e.message || 'Failed to update profile'
  } finally {
    saving.value = false
  }
}

async function onAvatarFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  uploadingAvatar.value = true
  error.value = ''
  try {
    const result = await api.uploadFile(file)
    avatarUrl.value = result.url
    await api.updateProfile({ avatarUrl: result.url })
    if (!avatarHistory.value.find(h => h.url === result.url)) {
      avatarHistory.value.unshift({ url: result.url, created_at: new Date().toISOString() })
    }
    success.value = true
    setTimeout(() => { success.value = false }, 3000)
  } catch (err) {
    error.value = err.message
  } finally {
    uploadingAvatar.value = false
  }
}

async function applyPreset(name) {
  const url = `/avatars/${name}.svg`
  if (url === avatarUrl.value) { showPresets.value = false; return }
  uploadingAvatar.value = true
  error.value = ''
  try {
    await api.updateProfile({ avatarUrl: url })
    avatarUrl.value = url
    showPresets.value = false
    success.value = true
    setTimeout(() => { success.value = false }, 3000)
  } catch (err) {
    error.value = err.message
  } finally {
    uploadingAvatar.value = false
  }
}

async function applyHistoryAvatar(url) {
  if (url === avatarUrl.value) return
  uploadingAvatar.value = true
  error.value = ''
  try {
    await api.updateProfile({ avatarUrl: url })
    avatarUrl.value = url
    lightboxIndex.value = 0
    success.value = true
    setTimeout(() => { success.value = false }, 3000)
  } catch (err) {
    error.value = err.message
  } finally {
    uploadingAvatar.value = false
  }
}

function applyFromLightbox(idx) {
  const url = lightboxImages.value[idx]
  if (url) applyHistoryAvatar(url)
}

async function deleteFromLightbox(idx) {
  const url = lightboxImages.value[idx]
  if (!url || url === avatarUrl.value) return
  const entry = avatarHistory.value.find(h => h.url === url)
  if (!entry?.id) return
  try {
    await api.deleteUserAvatarHistory(entry.id)
    avatarHistory.value = avatarHistory.value.filter(h => h.id !== entry.id)
    const newLen = lightboxImages.value.length
    if (lightboxIndex.value >= newLen) lightboxIndex.value = Math.max(0, newLen - 1)
  } catch (err) {
    error.value = err.message
  }
}

async function logout() {
  await api.logout()
  router.push('/login')
}
</script>
