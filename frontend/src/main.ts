import { createApp, watch } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { authState } from './services/auth'
import { clearMessengerUnread } from './services/messengerUnread'
import { realtime } from './services/realtime'

let realtimeUserId: string | null = null
let realtimeAccessToken: string | null = null

watch(
  () => ({
    userId: authState.user?.id ?? null,
    accessToken: authState.accessToken,
  }),
  ({ userId, accessToken }) => {
    if (!userId || !accessToken) {
      realtime.disconnect()
      clearMessengerUnread()
      realtimeUserId = null
      realtimeAccessToken = null
      return
    }

    const userChanged = realtimeUserId !== null && realtimeUserId !== userId
    if (userChanged) {
      realtime.disconnect()
      clearMessengerUnread()
    }

    const operation =
      !userChanged && realtimeAccessToken !== null && realtime.isConnected
        ? realtime.refreshAuthentication()
        : realtime.connect()
    realtimeUserId = userId
    realtimeAccessToken = accessToken
    void operation.catch((error) => {
      console.warn('[realtime] connection unavailable', error)
    })
  },
  { immediate: true },
)

createApp(App).use(router).mount('#app')
