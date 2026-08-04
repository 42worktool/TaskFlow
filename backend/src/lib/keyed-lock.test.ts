import assert from 'node:assert/strict'
import test from 'node:test'
import { KeyedLock } from './keyed-lock'

test('KeyedLock serializes operations sharing a key', async () => {
  const lock = new KeyedLock()
  const order: string[] = []
  let releaseFirst!: () => void
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = lock.run('workspace:email', async () => {
    order.push('first:start')
    await firstMayFinish
    order.push('first:end')
  })
  const second = lock.run('workspace:email', async () => {
    order.push('second:start')
  })

  await Promise.resolve()
  assert.deepEqual(order, ['first:start'])

  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start'])
})

test('KeyedLock releases a key after a failed operation', async () => {
  const lock = new KeyedLock()
  const expected = new Error('failed')

  await assert.rejects(
    lock.run('workspace:email', async () => {
      throw expected
    }),
    expected,
  )

  assert.equal(await lock.run('workspace:email', async () => 'next'), 'next')
})

test('KeyedLock allows different keys to run concurrently', async () => {
  const lock = new KeyedLock()
  let secondStarted = false
  let releaseFirst!: () => void
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = lock.run('first', async () => firstMayFinish)
  const second = lock.run('second', async () => {
    secondStarted = true
  })

  await second
  assert.equal(secondStarted, true)
  releaseFirst()
  await first
})
