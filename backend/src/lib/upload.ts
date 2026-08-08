// ============================================================
// upload.ts — 로컬 디스크 파일 저장을 위한 multer 설정
//
// 파일은 UPLOAD_DIR/<하위 디렉터리>/<uuid>.<확장자>로 저장한다. /app/uploads는
// Docker의 uploads_data 이름 볼륨에 연결되어 컨테이너를 다시 만들어도 유지된다.
// ============================================================
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer, { type FileFilterCallback } from 'multer'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { AppError } from '../errors'

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR?.trim() || 'uploads')

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const AVATAR_MAX_BYTES = 3 * 1024 * 1024

export const ATTACHMENT_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'text/plain',
  'video/mp4',
])

export const AVATAR_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * multer의 파서(busboy)는 브라우저가 UTF-8로 보낸 multipart 파일명도 기본적으로
 * latin1로 해석한다. 이 때문에 한글 파일명이 깨지므로 latin1 바이트를 UTF-8로
 * 다시 해석한다. ASCII 파일명은 그대로 유지된다.
 */
export function fixOriginalnameEncoding(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8')
}

export const MAX_ORIGINAL_FILENAME_LENGTH = 255

/**
 * file.originalname도 클라이언트가 지정하는 값이므로 신뢰하지 않는다. 양쪽 슬래시를
 * 기준으로 경로 부분을 제거하고, API와 Content-Disposition에 다시 노출될 때 헤더를
 * 교란하지 못하게 제어 문자도 제거한다. 1~255자 길이 검사는 실제 저장명을 만드는
 * storageFor에서 적용해 정규화 후의 값만 검증한다.
 */
export function normalizeOriginalname(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name
  // eslint-disable-next-line no-control-regex -- 업로드 파일명에는 ASCII 제어 문자를 허용하지 않는다.
  return base.replace(/[\x00-\x1f\x7f]/g, '').trim()
}

function storageFor(subdir: string): multer.StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOAD_DIR, subdir)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const normalized = normalizeOriginalname(fixOriginalnameEncoding(file.originalname))
      if (normalized.length < 1 || normalized.length > MAX_ORIGINAL_FILENAME_LENGTH) {
        cb(
          new AppError('INVALID_FILE_NAME', 400, 'File name must be between 1 and 255 characters'),
          '',
        )
        return
      }
      file.originalname = normalized
      cb(null, `${randomUUID()}${path.extname(normalized).toLowerCase()}`)
    },
  })
}

function fileFilterFor(allowlist: Set<string>) {
  return (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (!allowlist.has(file.mimetype)) {
      cb(new AppError('UNSUPPORTED_FILE_TYPE', 400, `Unsupported file type: ${file.mimetype}`))
      return
    }
    cb(null, true)
  }
}

/**
 * file.mimetype은 multer가 탐지한 값이 아니라 클라이언트가 보낸 Content-Type이다.
 * 따라서 앞부분의 간이 signature를 비교해 명백한 선언값 불일치를 한 번 더 거른다.
 *
 * 각 항목은 모두 일치해야 하는 바이트 범위다. WEBP처럼 서로 다른 offset의 표식을
 * 확인할 수 있으며, GIF는 허용 signature가 두 개라 항목도 두 개다.
 */
const IMAGE_SIGNATURES: { mime: string; checks: { offset: number; bytes: number[] }[] }[] = [
  {
    mime: 'image/png',
    checks: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  { mime: 'image/jpeg', checks: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { mime: 'image/gif', checks: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }] },
  { mime: 'image/gif', checks: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }] },
  {
    mime: 'image/webp',
    checks: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
]

function matchesSignature(header: Buffer, checks: { offset: number; bytes: number[] }[]): boolean {
  return checks.every(
    ({ offset, bytes }) =>
      header.length >= offset + bytes.length &&
      bytes.every((byte, i) => header[offset + i] === byte),
  )
}

function detectImageMimeType(header: Buffer): string | null {
  return (
    IMAGE_SIGNATURES.find((signature) => matchesSignature(header, signature.checks))?.mime ?? null
  )
}

// MP4(ISO base media)는 box의 연속이며 첫 box는 보통 4바이트 크기 뒤의 ftyp이다.
function isMp4(header: Buffer): boolean {
  return header.length >= 8 && header.toString('ascii', 4, 8) === 'ftyp'
}

// 일반 텍스트에는 고유 magic bytes가 없어 binary/text 간이 휴리스틱을 사용한다.
// 샘플에 NUL 또는 공백이 아닌 제어 문자가 있으면 거부하고, 정상 UTF-8 한글 등에
// 필요한 0x80 이상 바이트는 허용한다. 이는 UTF-8 유효성이나 파일 전체를 보장하지 않는다.
function looksLikePlainText(header: Buffer): boolean {
  for (const byte of header) {
    if (byte === 0x00 || byte === 0x7f) return false
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return false
  }
  return true
}

function detectFileMimeType(header: Buffer): string | null {
  const image = detectImageMimeType(header)
  if (image) return image
  if (isMp4(header)) return 'video/mp4'
  if (looksLikePlainText(header)) return 'text/plain'
  return null
}

const MAGIC_BYTES_SAMPLE_SIZE = 512

async function readHeaderBytes(filePath: string, length: number): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const header = Buffer.alloc(length)
    const { bytesRead } = await handle.read(header, 0, length, 0)
    return header.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * 업로드 앞 512바이트의 signature/휴리스틱 결과가 선언 MIME 및 허용 목록과 일치하는지
 * 확인한다. 불일치하면 저장된 파일을 지우고 요청을 거부하지만, 완전한 형식 파싱이나
 * 악성 콘텐츠 검사는 아니므로 이 검사만으로 파일의 유효성·안전성을 보장하지 않는다.
 */
export function requireMagicBytesMatch(
  subdir: string,
  allowlist: ReadonlySet<string>,
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const file = req.file
    if (!file) {
      next()
      return
    }
    try {
      const header = await readHeaderBytes(file.path, MAGIC_BYTES_SAMPLE_SIZE)
      const detected = detectFileMimeType(header)
      if (!detected || !allowlist.has(detected) || detected !== file.mimetype) {
        throw new AppError(
          'UNSUPPORTED_FILE_TYPE',
          400,
          `File content does not match declared type: ${file.mimetype}`,
        )
      }
      next()
    } catch (err) {
      await deleteUploadedFile(subdir, file.filename)
      next(err)
    }
  }
}

export const attachmentUpload = multer({
  storage: storageFor('attachments'),
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: fileFilterFor(ATTACHMENT_MIME_ALLOWLIST),
})

export const avatarUpload = multer({
  storage: storageFor('avatars'),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: fileFilterFor(AVATAR_MIME_ALLOWLIST),
})

export async function deleteUploadedFile(subdir: string, filename: string): Promise<void> {
  try {
    await fs.promises.unlink(path.join(UPLOAD_DIR, subdir, filename))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(err)
  }
}

/**
 * diskStorage는 실제 핸들러보다 먼저 파일을 쓴다. 이후 권한/DB 처리에서 실패하면
 * 참조되지 않는 파일이 남지 않도록 래퍼가 업로드 파일을 정리한다.
 */
export async function withUploadCleanup<T>(
  subdir: string,
  file: Express.Multer.File,
  handler: () => Promise<T>,
): Promise<T> {
  try {
    return await handler()
  } catch (err) {
    await deleteUploadedFile(subdir, file.filename)
    throw err
  }
}
