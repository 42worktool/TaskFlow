// ============================================================
// upload.ts — multer configuration for local-disk file storage
//
// Files persist under UPLOAD_DIR/<subdir>/<uuid>.<ext>. /app/uploads is
// backed by the named Docker volume `uploads_data` (see docker-compose.yml),
// so uploaded files survive container recreation instead of living only in
// the ./backend:/app dev bind mount.
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
 * multer's underlying parser (busboy) decodes multipart header fields —
 * including the filename — as latin1 by default, even though browsers send
 * the filename as UTF-8. A Korean filename like "보고서.pdf" therefore
 * arrives as mojibake (e.g. "ë³´ê³ ì„œ.pdf"). Re-interpreting those bytes as
 * UTF-8 undoes the mis-decoding; ASCII filenames pass through unchanged.
 */
export function fixOriginalnameEncoding(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8')
}

export const MAX_ORIGINAL_FILENAME_LENGTH = 255

/**
 * `file.originalname` is as client-controlled as `file.mimetype` — it's the
 * multipart part's declared filename, and multer does nothing to validate
 * it. Before this endpoint took multipart uploads, `addAttachmentSchema`
 * enforced `z.string().min(1).max(255)` on the equivalent JSON `file_name`
 * field; this restores that bound. Splitting on both slash styles drops any
 * directory components a client could smuggle in (this server never
 * derives an on-disk path from it — storage uses a random UUID — but the
 * value is echoed back verbatim in API responses and the download's
 * `Content-Disposition` header, so it shouldn't masquerade as a path).
 * Control characters are stripped for the same reason.
 */
export function normalizeOriginalname(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name
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
 * `file.mimetype` is not detected by multer — it's the Content-Type header the
 * client put on the multipart part, so a malicious client can label anything
 * as "image/png". Sniff the actual file signature (magic bytes) so the
 * declared type can't be trusted blindly.
 *
 * Each entry is one or more byte ranges that must all match (WEBP's "RIFF"
 * header and "WEBP" tag sit at different offsets); GIF has two acceptable
 * signatures, so it appears as two entries.
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

// MP4 (ISO base media) files are a sequence of boxes; the first box is
// almost always "ftyp" starting at offset 4, preceded by a 4-byte box size.
function isMp4(header: Buffer): boolean {
  return header.length >= 8 && header.toString('ascii', 4, 8) === 'ftyp'
}

// No magic bytes identify plain text, so fall back to a binary/text
// heuristic: reject a NUL byte or non-whitespace control character anywhere
// in the sample (the same signal git and `file` use to call content
// binary). Bytes >= 0x80 are allowed since valid UTF-8 text — Korean
// filenames' contents included — legitimately contains them.
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
 * Verifies an uploaded file's actual content matches its declared MIME type
 * and that the detected type is on the allowlist. Deletes the file and
 * rejects the request on mismatch, since a spoofed Content-Type is exactly
 * what a malicious upload would use to slip past `fileFilter`.
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
 * multer's diskStorage already wrote `file` before the wrapped handler runs,
 * so any failure past that point (permission denied, not found, DB error)
 * must not leave it orphaned on disk.
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
