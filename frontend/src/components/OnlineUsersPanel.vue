<template>
  <div class="online-panel">
    <div class="online-panel-header">
      <span class="online-panel-title">Online now</span>
      <button class="btn-icon" style="padding:4px" aria-label="Close" title="Close" @click="$emit('close')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="online-panel-list">
      <div v-if="!users.length" class="online-panel-empty">No one else online</div>
      <button
        v-for="u in users"
        :key="u.username"
        class="online-user-item"
        type="button"
        @click="$emit('open-profile', u.username)"
      >
        <UserAvatar :username="u.username" :avatarUrl="u.avatar_url" :isOnline="true" size="sm" />
        <span class="online-user-name">{{ u.username }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import UserAvatar from './UserAvatar.vue'

defineProps({
  users: { type: Array, default: () => [] },
})
defineEmits(['close', 'open-profile'])
</script>
