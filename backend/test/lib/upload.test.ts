// 업로드 파일명 보호와 콘텐츠 시그니처 검사, 파일 정리 동작을 검증한다.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import type multer from 'multer'
import {
  fixOriginalnameEncoding,
  normalizeOriginalname,
  requireMagicBytesMatch,
  attachmentUpload,
  AVATAR_MIME_ALLOWLIST,
  ATTACHMENT_MIME_ALLOWLIST,
  MAX_ORIGINAL_FILENAME_LENGTH,
  UPLOAD_DIR,
} from '../../src/lib/upload'
import { AppError } from '../../src/errors'

// multer.StorageEngine은 `getFilename`을 공개 타입으로 제공하지 않지만 DiskStorage에는
// 실제 메서드가 있다. 순수 도우미만 따로 검사하지 않고, 연결된 파일명 콜백의 전체 흐름인
// 인코딩 복원 → 정규화 → 길이 검사를 그대로 실행하기 위해 이 타입을 사용한다.
function invokeFilenameCallback(
  upload: multer.Multer,
  file: Partial<Express.Multer.File>,
): Promise<{ err: unknown; filename?: string }> {
  const storage = upload.storage as unknown as {
    getFilename: (
      req: unknown,
      file: unknown,
      cb: (err: unknown, filename?: string) => void,
    ) => void
  }
  return new Promise((resolve) => {
    storage.getFilename({}, file, (err, filename) => resolve({ err, filename }))
  })
}

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const MP4_HEADER = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom', 'ascii')])
const TEXT_CONTENT = Buffer.from('hello world\n오늘 날씨가 좋다\n', 'utf8')

function runMagicBytesCheck(
  subdir: string,
  allowlist: ReadonlySet<string>,
  file: Express.Multer.File,
): Promise<unknown> {
  return new Promise((resolve) => {
    const middleware = requireMagicBytesMatch(subdir, allowlist)
    void middleware(
      { file } as unknown as Request,
      {} as Response,
      ((err?: unknown) => resolve(err)) as NextFunction,
    )
  })
}

function writeFixture(subdir: string, filename: string, content: Buffer): string {
  const dir = path.join(UPLOAD_DIR, subdir)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, content)
  return filePath
}

test('fixOriginalnameEncoding recovers a Korean filename mangled by latin1 decoding', () => {
  const original = '한글 파일명.pdf'
  // busboy가 UTF-8 바이트를 latin1로 잘못 해석해 넘기는 상황을 재현한다.
  const mojibake = Buffer.from(original, 'utf8').toString('latin1')
  assert.equal(fixOriginalnameEncoding(mojibake), original)
})

test('fixOriginalnameEncoding leaves an ASCII filename unchanged', () => {
  assert.equal(fixOriginalnameEncoding('notes.pdf'), 'notes.pdf')
})

test('normalizeOriginalname drops POSIX-style directory components', () => {
  assert.equal(normalizeOriginalname('../../etc/passwd'), 'passwd')
})

test('normalizeOriginalname drops Windows-style directory components', () => {
  assert.equal(normalizeOriginalname('C:\\Windows\\evil.dll'), 'evil.dll')
})

test('normalizeOriginalname strips control characters and trims whitespace', () => {
  assert.equal(normalizeOriginalname('  bad\x00name\x1f.txt  '), 'badname.txt')
})

test('normalizeOriginalname preserves non-ASCII content, including Korean', () => {
  assert.equal(normalizeOriginalname('한글 파일명.pdf'), '한글 파일명.pdf')
})

test('attachment uploads reject a file name longer than the 255 character limit', async () => {
  const longName = `${'a'.repeat(300)}.txt`
  const { err } = await invokeFilenameCallback(attachmentUpload, { originalname: longName })
  assert.ok(err instanceof AppError)
  assert.equal((err as AppError).code, 'INVALID_FILE_NAME')
})

test('attachment uploads reject a file name that is empty after normalization', async () => {
  const { err } = await invokeFilenameCallback(attachmentUpload, { originalname: '  \x00\x1f  ' })
  assert.ok(err instanceof AppError)
  assert.equal((err as AppError).code, 'INVALID_FILE_NAME')
})

test('attachment uploads accept a file name at the 255 character limit', async () => {
  const boundaryName = `${'a'.repeat(MAX_ORIGINAL_FILENAME_LENGTH - 4)}.txt`
  assert.equal(boundaryName.length, MAX_ORIGINAL_FILENAME_LENGTH)
  const { err, filename } = await invokeFilenameCallback(attachmentUpload, {
    originalname: boundaryName,
  })
  assert.equal(err, null)
  assert.ok(filename?.endsWith('.txt'))
})

test('requireMagicBytesMatch accepts an avatar whose content matches its declared type', async () => {
  const filePath = writeFixture(
    'avatars',
    'real.png',
    Buffer.concat([PNG_HEADER, Buffer.from('rest')]),
  )
  const file = {
    path: filePath,
    filename: 'real.png',
    mimetype: 'image/png',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('avatars', AVATAR_MIME_ALLOWLIST, file)

  assert.equal(err, undefined)
  assert.equal(fs.existsSync(filePath), true)
  fs.rmSync(filePath, { force: true })
})

test('requireMagicBytesMatch deletes and rejects an avatar whose content does not match its declared Content-Type', async () => {
  // 실제 내용은 JPEG이지만 클라이언트가 PNG라고 선언한 파일이다.
  const filePath = writeFixture(
    'avatars',
    'spoofed.png',
    Buffer.concat([JPEG_HEADER, Buffer.from('rest')]),
  )
  const file = {
    path: filePath,
    filename: 'spoofed.png',
    mimetype: 'image/png',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('avatars', AVATAR_MIME_ALLOWLIST, file)

  assert.ok(err instanceof AppError)
  assert.equal((err as AppError).code, 'UNSUPPORTED_FILE_TYPE')
  assert.equal(fs.existsSync(filePath), false)
})

test('requireMagicBytesMatch deletes and rejects a non-image avatar disguised with an image Content-Type', async () => {
  const filePath = writeFixture(
    'avatars',
    'not-an-image.png',
    Buffer.from('just plain text, not an image'),
  )
  const file = {
    path: filePath,
    filename: 'not-an-image.png',
    mimetype: 'image/png',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('avatars', AVATAR_MIME_ALLOWLIST, file)

  assert.ok(err instanceof AppError)
  assert.equal((err as AppError).code, 'UNSUPPORTED_FILE_TYPE')
  assert.equal(fs.existsSync(filePath), false)
})

test('requireMagicBytesMatch accepts an attachment JPEG whose content matches its declared type', async () => {
  const filePath = writeFixture(
    'attachments',
    'photo.jpg',
    Buffer.concat([JPEG_HEADER, Buffer.from('rest')]),
  )
  const file = {
    path: filePath,
    filename: 'photo.jpg',
    mimetype: 'image/jpeg',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('attachments', ATTACHMENT_MIME_ALLOWLIST, file)

  assert.equal(err, undefined)
  assert.equal(fs.existsSync(filePath), true)
  fs.rmSync(filePath, { force: true })
})

test('requireMagicBytesMatch accepts an attachment MP4 whose content matches its declared type', async () => {
  const filePath = writeFixture(
    'attachments',
    'clip.mp4',
    Buffer.concat([MP4_HEADER, Buffer.from('rest')]),
  )
  const file = {
    path: filePath,
    filename: 'clip.mp4',
    mimetype: 'video/mp4',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('attachments', ATTACHMENT_MIME_ALLOWLIST, file)

  assert.equal(err, undefined)
  assert.equal(fs.existsSync(filePath), true)
  fs.rmSync(filePath, { force: true })
})

test('requireMagicBytesMatch accepts an attachment text file, including UTF-8 Korean content', async () => {
  const filePath = writeFixture('attachments', 'notes.txt', TEXT_CONTENT)
  const file = {
    path: filePath,
    filename: 'notes.txt',
    mimetype: 'text/plain',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('attachments', ATTACHMENT_MIME_ALLOWLIST, file)

  assert.equal(err, undefined)
  assert.equal(fs.existsSync(filePath), true)
  fs.rmSync(filePath, { force: true })
})

test('requireMagicBytesMatch deletes and rejects an attachment MP4 disguised as a text file', async () => {
  const filePath = writeFixture(
    'attachments',
    'video.txt',
    Buffer.concat([MP4_HEADER, Buffer.from('rest')]),
  )
  const file = {
    path: filePath,
    filename: 'video.txt',
    mimetype: 'text/plain',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('attachments', ATTACHMENT_MIME_ALLOWLIST, file)

  assert.ok(err instanceof AppError)
  assert.equal((err as AppError).code, 'UNSUPPORTED_FILE_TYPE')
  assert.equal(fs.existsSync(filePath), false)
})

test('requireMagicBytesMatch deletes and rejects an attachment binary disguised as a text file', async () => {
  // NUL 바이트를 포함하므로 일반 텍스트로 처리할 수 없다.
  const filePath = writeFixture(
    'attachments',
    'binary.txt',
    Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00]),
  )
  const file = {
    path: filePath,
    filename: 'binary.txt',
    mimetype: 'text/plain',
  } as Express.Multer.File

  const err = await runMagicBytesCheck('attachments', ATTACHMENT_MIME_ALLOWLIST, file)

  assert.ok(err instanceof AppError)
  assert.equal((err as AppError).code, 'UNSUPPORTED_FILE_TYPE')
  assert.equal(fs.existsSync(filePath), false)
})

test('deleteUploadedFile removes an existing file and ignores a missing one', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'))
  process.env.UPLOAD_DIR = tempDir
  const { deleteUploadedFile, UPLOAD_DIR } = await import('../../src/lib/upload')

  const subdir = 'attachments'
  const filename = 'sample.txt'
  fs.mkdirSync(path.join(UPLOAD_DIR, subdir), { recursive: true })
  const filePath = path.join(UPLOAD_DIR, subdir, filename)
  fs.writeFileSync(filePath, 'content')

  await deleteUploadedFile(subdir, filename)
  assert.equal(fs.existsSync(filePath), false)

  // 이미 사라진 파일을 다시 삭제해도 오류가 발생하면 안 된다.
  await deleteUploadedFile(subdir, filename)

  fs.rmSync(tempDir, { recursive: true, force: true })
})
