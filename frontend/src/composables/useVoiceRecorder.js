import { ref, onBeforeUnmount } from 'vue'
import { api } from '../api'

// ── Non-reactive closure state (NOT exported, NOT refs) ────────────
// These must be plain JS variables to avoid unnecessary reactivity overhead.
let mediaRecorder = null
let recordingChunks = []
let recordingStream = null
let recordingTimer = null
let waveformRafId = null
let waveformAudioCtx = null

function releaseStream() {
  recordingStream?.getTracks().forEach(t => t.stop())
  recordingStream = null
}

/**
 * Voice recording composable.
 *
 * @param {object} opts
 * @param {import('vue').ComputedRef<boolean>} opts.isAiChat
 * @param {import('vue').ComputedRef<string>}  opts.chatId
 * @param {function(): boolean}                opts.isNearBottom
 * @param {function(): Promise<void>}          opts.scrollToBottom
 * @param {function(string, string): void}     opts.showToast
 * @param {import('vue').Ref<boolean>}         opts.uploading  — shared with useComposer
 * @param {import('vue').Ref<string>}          opts.composerError
 */
export function useVoiceRecorder({ isAiChat, chatId, isNearBottom, scrollToBottom, showToast, uploading, composerError }) {
  const recording = ref(false)
  const recordingTime = ref(0)
  const waveformBars = ref([])

  function fmtRecTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  function cancelRecording() {
    clearInterval(recordingTimer)
    if (waveformRafId) { cancelAnimationFrame(waveformRafId); waveformRafId = null }
    if (waveformAudioCtx) { waveformAudioCtx.close().catch(() => {}); waveformAudioCtx = null }
    waveformBars.value = []
    recording.value = false
    recordingTime.value = 0
    if (mediaRecorder) {
      mediaRecorder.onstop = null
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    }
    recordingChunks = []
    releaseStream()
  }

  async function startRecording() {
    composerError.value = ''
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      composerError.value = 'Voice recording requires HTTPS — works on localhost or via a secure URL'
      return
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      composerError.value = e.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : `Microphone error: ${e.message}`
      return
    }
    recordingStream = stream

    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', '']
      .find(t => !t || MediaRecorder.isTypeSupported(t))
    try {
      mediaRecorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : {})
    } catch (e) {
      composerError.value = `Recording not supported: ${e.message}`
      releaseStream()
      return
    }
    recordingChunks = []
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordingChunks.push(e.data) }
    mediaRecorder.start()
    recording.value = true
    recordingTime.value = 0
    recordingTimer = setInterval(() => recordingTime.value++, 1000)

    // Start waveform analyser
    try {
      waveformAudioCtx = new AudioContext()
      const source = waveformAudioCtx.createMediaStreamSource(stream)
      const analyser = waveformAudioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const drawBars = () => {
        waveformRafId = requestAnimationFrame(drawBars)
        analyser.getByteFrequencyData(dataArray)
        waveformBars.value = Array.from(dataArray.slice(0, 16)).map(v => Math.max(4, v / 255 * 24))
      }
      drawBars()
    } catch (e) { /* Web Audio API may be unavailable */ }
  }

  async function sendRecording() {
    clearInterval(recordingTimer)
    if (waveformRafId) { cancelAnimationFrame(waveformRafId); waveformRafId = null }
    if (waveformAudioCtx) { waveformAudioCtx.close().catch(() => {}); waveformAudioCtx = null }
    waveformBars.value = []
    recording.value = false

    if (!mediaRecorder) return

    const blob = await new Promise(resolve => {
      mediaRecorder.onstop = () => {
        const type = recordingChunks[0]?.type || 'audio/webm'
        resolve(new Blob(recordingChunks, { type }))
      }
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      else {
        const type = recordingChunks[0]?.type || 'audio/webm'
        resolve(new Blob(recordingChunks, { type }))
      }
    })

    releaseStream()
    recordingChunks = []
    recordingTime.value = 0

    if (blob.size === 0) return

    // Capture scroll position before the async upload so optimistic scroll
    // only fires when the user was already at the bottom.
    const wasNearBottom = isNearBottom()
    uploading.value = true
    try {
      const type = blob.type || 'audio/webm'
      const ext = type.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type })
      const result = await api.uploadFile(file)
      await api.sendMessage(chatId.value, '', null, [{ url: result.url, type: 'audio', name: 'Voice message' }])
      if (wasNearBottom) await scrollToBottom()
    } catch (err) {
      showToast(err?.message || 'Failed to send recording', 'error')
    } finally {
      uploading.value = false
    }
  }

  // CRITICAL: self-register onBeforeUnmount to clean up AudioContext and
  // cancel any in-flight animation frame — must run even if ChatView unmounts
  // while recording is active.
  onBeforeUnmount(() => {
    cancelRecording()
  })

  return {
    recording,
    recordingTime,
    waveformBars,
    startRecording,
    cancelRecording,
    sendRecording,
    fmtRecTime,
  }
}
