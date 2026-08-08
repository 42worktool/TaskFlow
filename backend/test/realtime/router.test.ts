// 실시간 이벤트 라우팅과 요청 데이터 검증, 핸들러 오류 경계를 검증한다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'
import { RealtimeError, RealtimeHandlerContext, RealtimeRouter } from '../../src/realtime/router'

const context: RealtimeHandlerContext = {
  connectionId: 'connection-id',
  userId: 'user-id',
  send: () => undefined,
  join: () => undefined,
  leave: () => undefined,
  publish: () => undefined,
}

describe('RealtimeRouter', () => {
  it('validates data and returns the handler result', async () => {
    const router = new RealtimeRouter()
    router.register('example.echo', z.object({ value: z.string() }), (_handlerContext, data) => ({
      echoed: data.value,
    }))

    assert.deepEqual(await router.dispatch('example.echo', { value: 'hello' }, context), {
      echoed: 'hello',
    })
  })

  it('rejects unknown events with a stable public error', async () => {
    const router = new RealtimeRouter()

    await assert.rejects(
      router.dispatch('missing.event', {}, context),
      (error: unknown) => error instanceof RealtimeError && error.code === 'UNKNOWN_EVENT',
    )
  })

  it('does not invoke handlers with invalid data', async () => {
    const router = new RealtimeRouter()
    let invoked = false
    router.register('example.validated', z.object({ count: z.number().int() }), () => {
      invoked = true
    })

    await assert.rejects(
      router.dispatch('example.validated', { count: '1' }, context),
      (error: unknown) => error instanceof RealtimeError && error.code === 'INVALID_EVENT_DATA',
    )
    assert.equal(invoked, false)
  })

  it('prevents accidental duplicate registrations', () => {
    const router = new RealtimeRouter()
    router.register('example.unique', z.object({}), () => undefined)

    assert.throws(
      () => router.register('example.unique', z.object({}), () => undefined),
      /already registered/,
    )
  })

  it('does not let a stale unsubscribe remove a newer registration', async () => {
    const router = new RealtimeRouter()
    const unregisterFirst = router.register('example.replaceable', z.object({}), () => 'first')
    unregisterFirst()
    router.register('example.replaceable', z.object({}), () => 'second')

    // 해제 함수는 이벤트 이름 전체가 아니라 자신이 만든 등록 한 건만 소유한다.
    unregisterFirst()

    assert.equal(await router.dispatch('example.replaceable', {}, context), 'second')
  })

  it('requires namespaced event names at registration time', () => {
    const router = new RealtimeRouter()

    assert.throws(
      () => router.register('unnamespaced', z.object({}), () => undefined),
      /Invalid realtime event name/,
    )
  })

  it('prevents handlers from claiming protocol control events', () => {
    const router = new RealtimeRouter()

    for (const event of [
      'auth.authenticate',
      'auth.refresh',
      'system.ready',
      'system.ack',
      'system.error',
    ]) {
      assert.throws(
        () => router.register(event, z.object({}), () => undefined),
        /reserved by the protocol/,
      )
    }

    assert.doesNotThrow(() => router.register('system.ping', z.object({}), () => undefined))
  })
})
