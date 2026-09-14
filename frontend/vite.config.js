import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read app version from the project-root VERSION file.
// Source of truth: /VERSION (semver). devops-agent bumps it per commit.
// Fallback to '0.0.0' so a missing file does not break the build.
let appVersion = '0.0.0'
try {
  appVersion = readFileSync(resolve(__dirname, '..', 'VERSION'), 'utf8').trim() || '0.0.0'
} catch (_) {
  // VERSION file missing — leave fallback
}

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
      },
      '/.well-known/mercure': {
        target: 'http://localhost',
        changeOrigin: true,
      },
    },
  },
})
