import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('deleteUploadedFile removes an existing file and ignores a missing one', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'))
  process.env.UPLOAD_DIR = tempDir
  const { deleteUploadedFile, UPLOAD_DIR } = await import('./upload')

  const subdir = 'attachments'
  const filename = 'sample.txt'
  fs.mkdirSync(path.join(UPLOAD_DIR, subdir), { recursive: true })
  const filePath = path.join(UPLOAD_DIR, subdir, filename)
  fs.writeFileSync(filePath, 'content')

  await deleteUploadedFile(subdir, filename)
  assert.equal(fs.existsSync(filePath), false)

  // Deleting again (file already gone) must not throw.
  await deleteUploadedFile(subdir, filename)

  fs.rmSync(tempDir, { recursive: true, force: true })
})
