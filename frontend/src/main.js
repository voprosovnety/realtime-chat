import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

// Apply theme: an explicit saved choice always wins; otherwise follow the OS
// preference on first visit (so a light-OS user is not forced into dark).
const savedTheme = localStorage.getItem('theme')
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme)
} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
  document.documentElement.setAttribute('data-theme', 'light')
}

// Apply message density: opt-in compact mode persists as `density` in localStorage.
if (localStorage.getItem('density') === 'compact') {
  document.documentElement.setAttribute('data-density', 'compact')
}

const app = createApp(App)
app.use(router)

app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue error]', info, err)
}

app.mount('#app')