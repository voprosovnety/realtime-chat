<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal poll-form-modal">
      <div class="modal-header">
        <span class="modal-title">Create Poll</span>
        <button class="btn-icon" aria-label="Close" title="Close" @click="$emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <label class="form-label">Question</label>
        <textarea
          v-model="question"
          class="input"
          rows="2"
          placeholder="Ask something…"
          style="resize:vertical"
        />

        <label class="form-label" style="margin-top:12px">Options</label>
        <div class="poll-options-list">
          <div v-for="(opt, i) in options" :key="i" class="poll-option-row">
            <input
              v-model="options[i]"
              class="input poll-option-input"
              :placeholder="`Option ${i + 1}`"
              maxlength="200"
            />
            <button
              v-if="options.length > 2"
              class="btn-icon"
              style="color:var(--danger);padding:4px;flex-shrink:0"
              title="Remove option"
              @click="removeOption(i)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <button
          v-if="options.length < 10"
          class="poll-add-option-btn"
          @click="addOption"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add option
        </button>

        <div class="poll-settings">
          <label class="poll-checkbox-row">
            <input v-model="multipleAnswers" type="checkbox" class="poll-checkbox" />
            Multiple answers
          </label>
          <label class="poll-checkbox-row">
            <input v-model="anonymous" type="checkbox" class="poll-checkbox" />
            Anonymous poll
          </label>
          <label class="poll-checkbox-row">
            <input v-model="allowRetraction" type="checkbox" class="poll-checkbox" />
            Allow vote retraction
          </label>
        </div>

        <div v-if="error" class="auth-error" style="margin:0">{{ error }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="submitting" @click="submit">
          {{ submitting ? 'Creating…' : 'Create Poll' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close', 'submit'])

const question = ref('')
const options = ref(['', ''])
const multipleAnswers = ref(false)
const anonymous = ref(false)
const allowRetraction = ref(true)
const submitting = ref(false)
const error = ref('')

function addOption() {
  if (options.value.length < 10) options.value.push('')
}

function removeOption(i) {
  if (options.value.length > 2) options.value.splice(i, 1)
}

async function submit() {
  error.value = ''
  const q = question.value.trim()
  if (!q) { error.value = 'Question is required'; return }

  const opts = options.value.map(o => o.trim()).filter(Boolean)
  if (opts.length < 2) { error.value = 'At least 2 non-empty options are required'; return }

  submitting.value = true
  try {
    emit('submit', {
      question: q,
      options: opts,
      multipleAnswers: multipleAnswers.value,
      anonymous: anonymous.value,
      allowRetraction: allowRetraction.value,
    })
  } finally {
    submitting.value = false
  }
}
</script>
