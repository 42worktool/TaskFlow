// Generic file-transfer helpers built on top of auth.ts's session-aware
// fetch wrapper. Used by any domain API that moves raw files (card
// attachments, avatars, ...), so it stays independent of any one domain.
import { authFetch, authRequestError, authState, resolveErrorMessage } from './auth'

// fetch() has no cross-browser way to report upload progress, so file
// uploads go through XMLHttpRequest instead of apiRequest/authFetch. This
// intentionally skips the automatic 401-refresh-retry that authFetch does;
// access tokens live 15 minutes, so mid-upload expiry is a rare edge case
// surfaced as a plain error instead.
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
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
