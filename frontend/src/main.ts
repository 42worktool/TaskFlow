// Vue 앱을 시작하고 로그인 세션의 변화에 WebSocket 생명주기를 맞춘다.
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
    // 로그아웃 시 소켓과 세션성 읽지 않음 배지를 함께 폐기해 다음 사용자에게 새지 않게 한다.
    if (!userId || !accessToken) {
      realtime.disconnect()
      clearMessengerUnread()
      realtimeUserId = null
      realtimeAccessToken = null
      return
    }

    const userChanged = realtimeUserId !== null && realtimeUserId !== userId
    if (userChanged) {
      // 같은 탭에서 계정이 바뀌면 이전 사용자의 구독을 복구하지 않도록 연결을 완전히 재생성한다.
      realtime.disconnect()
      clearMessengerUnread()
    }

    // 같은 사용자의 token만 바뀌면 연결을 유지한 채 인증만 갱신해 구독과 UI 흐름을 보존한다.
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
