import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { AppError } from '../../errors'

const PASSWORD_HASH_PREFIX = 'scrypt-v1'
const PASSWORD_SALT_BYTES = 16
const PASSWORD_KEY_BYTES = 64
const SCRYPT_OPTIONS = {
  N: 1 << 14,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}

export function accountName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('INVALID_NAME', 400, 'Name is required')
  }

  const name = value.trim()
  if (name.length < 2 || name.length > 80) {
    throw new AppError('INVALID_NAME', 400, 'Name must be between 2 and 80 characters')
  }
  return name
}

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_BYTES)
  const key = await derivePasswordKey(password, salt)
  return `${PASSWORD_HASH_PREFIX}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(
  password: string,
  encodedHash: string | null,
): Promise<boolean> {
  // 저장값이 없거나 깨져 있어도 고정 크기의 더미 salt/key로 scrypt를 수행한다.
  // 계정 유무에 따른 계산 시간 차이를 줄이기 위한 구조다.
  let validEncoding = false
  let salt = Buffer.alloc(PASSWORD_SALT_BYTES)
  let expectedKey = Buffer.alloc(PASSWORD_KEY_BYTES)

  if (encodedHash) {
    const [prefix, encodedSalt, encodedKey, ...extra] = encodedHash.split('$')
    if (prefix === PASSWORD_HASH_PREFIX && encodedSalt && encodedKey && extra.length === 0) {
      const decodedSalt = Buffer.from(encodedSalt, 'base64url')
      const decodedKey = Buffer.from(encodedKey, 'base64url')
      if (decodedSalt.length === PASSWORD_SALT_BYTES && decodedKey.length === PASSWORD_KEY_BYTES) {
        salt = decodedSalt
        expectedKey = decodedKey
        validEncoding = true
      }
    }
  }

  const actualKey = await derivePasswordKey(password, salt)
  return validEncoding && timingSafeEqual(actualKey, expectedKey)
}

export function safeEqual(left: string | undefined, right: string | undefined): boolean {
  // 두 값이 있고 바이트 길이도 같을 때 timingSafeEqual을 사용해 일반 === 비교보다
  // OAuth state/nonce 비교 과정의 타이밍 차이를 줄인다. 길이가 다르면 즉시 false를 반환한다.
  if (!left || !right) return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function safeReturnTo(value: unknown): string {
  // 앱 내부 상대 경로만 허용해 OAuth 완료 후 외부 사이트로 보내는 open redirect를 막는다.
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/workspaces'
  }

  try {
    const parsed = new URL(value, 'http://local.invalid')
    if (parsed.origin !== 'http://local.invalid') return '/workspaces'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/workspaces'
  }
}
