import { createApp, watch } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { authState } from './services/auth'
import { realtime } from './services/realtime'

watch(
  () => authState.accessToken,
  (accessToken, previousAccessToken) => {
    if (!accessToken) {
      realtime.disconnect()
      return
    }

    const operation =
      previousAccessToken && realtime.isConnected
        ? realtime.refreshAuthentication()
        : realtime.connect()
    void operation.catch((error) => {
      console.warn('[realtime] connection unavailable', error)
    })
  },
  { immediate: true },
)

createApp(App).use(router).mount('#app')
