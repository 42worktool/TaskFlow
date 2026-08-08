// 카드 첨부파일·아바타처럼 원시 파일을 다루는 도메인이 함께 쓰는 전송 계층이다.
// 인증 모듈 위에 두되 특정 도메인 타입과 크기·MIME 정책에는 의존하지 않고,
// 진행률이 필요한 업로드와 인증된 다운로드 방식만 공통화한다.
import { authFetch, authRequestError, authState, resolveErrorMessage } from './auth'

// fetch는 브라우저 공통 업로드 진행률 API가 없어서 업로드만 XMLHttpRequest를 사용한다.
// 이 경로는 authFetch의 401 refresh·재시도를 거치지 않는다. 파일 본문을 자동 재전송해
// 중복 저장하는 것보다, 드문 업로드 중 만료를 오류로 보여 주고 사용자가 재시도하게 한다.
export function uploadFile<T>(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    if (authState.accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${authState.accessToken}`)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((xhr.responseText ? JSON.parse(xhr.responseText) : undefined) as T)
        return
      }
      const body = (() => {
        try {
          return JSON.parse(xhr.responseText) as { error?: string; message?: string }
        } catch {
          return null
        }
      })()
      reject(new Error(resolveErrorMessage(body, '파일을 업로드하지 못했습니다.')))
    }
    xhr.onerror = () => reject(new Error('네트워크 오류로 파일을 업로드하지 못했습니다.'))
    const formData = new FormData()
    formData.append('file', file)
    xhr.send(formData)
  })
}

export async function fetchBlob(url: string): Promise<Blob> {
  const response = await authFetch(url)
  if (!response.ok) {
    throw await authRequestError(response, '파일을 불러오지 못했습니다.')
  }
  return response.blob()
}

export async function downloadFile(url: string, fileName: string): Promise<void> {
  const blob = await fetchBlob(url)
  // 서버 파일을 새 탭에 노출하지 않고 임시 object URL과 download 속성으로 저장한다.
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
