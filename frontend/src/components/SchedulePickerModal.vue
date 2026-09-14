<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal schedule-picker-modal">
      <div class="modal-header">
        <span class="modal-title">Schedule message</span>
        <button class="btn-icon" aria-label="Close" title="Close" @click="$emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <label class="form-label">Send at</label>
        <input
          ref="inputEl"
          v-model="when"
          type="datetime-local"
          :min="minWhen"
          class="input"
        />
        <div v-if="error" class="auth-error" style="margin-top:8px">{{ error }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="!when" @click="submit">Schedule</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['close', 'submit'])

const inputEl = ref(null)
const when = ref('')
const error = ref('')

function pad(n) { return String(n).padStart(2, '0') }
function toLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const minWhen = toLocal(new Date())

onMounted(() => {
  const def = new Date(Date.now() + 60 * 60 * 1000)
  when.value = toLocal(def)
  setTimeout(() => inputEl.value?.focus(), 0)
})

function submit() {
  error.value = ''
  if (!when.value) { error.value = 'Pick a date and time'; return }
  const d = new Date(when.value)
  if (isNaN(d)) { error.value = 'Invalid date'; return }
  if (d.getTime() <= Date.now() + 5000) {
    error.value = 'Scheduled time must be in the future'
    return
  }
  emit('submit', d.toISOString())
}
</script>
