// 앱 전체가 공유하는 실시간 클라이언트 인스턴스를 구성한다.
// 인증 모듈을 tokenProvider로 주입해 소켓 계층이 로그인 구현 세부사항에 의존하지 않게 한다.
import { getAccessToken } from '../auth'
import { RealtimeClient } from './client'
import type {
  RealtimeClientEvents,
  RealtimeClientRequestResults,
  RealtimeServerEvents,
} from './protocol'

export { RealtimeRequestError } from './client'

export const realtime = new RealtimeClient<
  RealtimeServerEvents,
  RealtimeClientEvents,
  RealtimeClientRequestResults
>({
  tokenProvider: getAccessToken,
})
