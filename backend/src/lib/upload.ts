// ============================================================
// upload.ts — multer configuration for local-disk file storage
//
// Files persist under UPLOAD_DIR/<subdir>/<uuid>.<ext>. In dev the backend
// container's ./backend:/app bind mount means anything written under
// /app/uploads lands directly in the host backend/uploads/ directory, so no
// dedicated Docker volume is needed.
// ============================================================
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer, { type FileFilterCallback } from 'multer'
import type { Request } from 'express'
import { AppError } from '../errors'

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR?.trim() || 'uploads')

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const AVATAR_MAX_BYTES = 3 * 1024 * 1024

const ATTACHMENT_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
])

const AVATAR_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function storageFor(subdir: string): multer.StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOAD_DIR, subdir)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
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
