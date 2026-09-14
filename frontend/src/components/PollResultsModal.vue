<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal poll-results-modal">
      <div class="modal-header">
        <span class="modal-title">{{ poll.question }}</span>
        <button class="btn-icon modal-close-btn" aria-label="Close" title="Close" @click="$emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body prd-body">
        <div v-for="opt in poll.options" :key="opt.text" class="prd-option">
          <div class="prd-option-header">
            <span class="prd-option-text">{{ opt.text }}</span>
            <span class="prd-option-count">{{ opt.votes }} vote{{ opt.votes !== 1 ? 's' : '' }} · {{ pct(opt) }}%</span>
          </div>
          <div class="prd-bar-track">
            <div class="prd-bar-fill" :style="{ width: pct(opt) + '%' }"></div>
          </div>
          <div v-if="!poll.anonymous && opt.voters?.length" class="prd-voters">
            <div v-for="(voter, i) in opt.voters" :key="i" class="prd-voter">
              <UserAvatar :username="voter.username" :avatarUrl="voter.avatar_url" size="xs" />
              <span>{{ voter.username }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer-info">
        Total: {{ poll.total_votes }} vote{{ poll.total_votes !== 1 ? 's' : '' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import UserAvatar from './UserAvatar.vue'

const props = defineProps({ poll: { type: Object, required: true } })
const emit = defineEmits(['close'])

function pct(opt) {
  if (!props.poll.total_votes) return 0
  return Math.round((opt.votes / props.poll.total_votes) * 100)
}

function onKey(e) { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
