import { describe, expect, it, vi } from 'vitest'
import { createComposerEnterSubmitter } from './composerKeyboard'

function keyboardEvent(
  overrides: Partial<Pick<KeyboardEvent, 'isComposing' | 'keyCode'>> = {},
) {
  return {
    isComposing: false,
    keyCode: 13,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent
}

describe('createComposerEnterSubmitter', () => {
  it('submits once after composition and reads the finalized value', () => {
    const deferred: Array<() => void> = []
    let content = '마지'
    const event = keyboardEvent({ isComposing: true })
    const submitted: string[] = []
    const submitter = createComposerEnterSubmitter(
      () => submitted.push(content),
      (callback) => deferred.push(callback),
    )

    submitter.handleEnter(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(submitted).toEqual([])

    content = '마지막'
    submitter.handleCompositionEnd()
    expect(submitted).toEqual([])
    expect(deferred).toHaveLength(1)

    deferred[0]()
    submitter.handleCompositionEnd()
    expect(submitted).toEqual(['마지막'])
  })

  it('defers the legacy 229 IME key code until composition ends', () => {
    const deferred: Array<() => void> = []
    const event = keyboardEvent({ keyCode: 229 })
    const submit = vi.fn()
    const submitter = createComposerEnterSubmitter(
      submit,
      (callback) => deferred.push(callback),
    )

    submitter.handleEnter(event)
    submitter.handleCompositionEnd()

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(1)

    deferred[0]()
    expect(submit).toHaveBeenCalledOnce()
  })

  it('prevents a regular Enter and submits exactly once', () => {
    const event = keyboardEvent()
    const submit = vi.fn()
    const submitter = createComposerEnterSubmitter(submit, vi.fn())

    submitter.handleEnter(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledOnce()
  })

  it('does not double-submit if another Enter arrives before the deferred send', () => {
    const deferred: Array<() => void> = []
    const submit = vi.fn()
    const submitter = createComposerEnterSubmitter(
      submit,
      (callback) => deferred.push(callback),
    )

    submitter.handleEnter(keyboardEvent({ isComposing: true }))
    submitter.handleCompositionEnd()
    const secondEnter = keyboardEvent()
    submitter.handleEnter(secondEnter)
    deferred[0]()

    expect(secondEnter.preventDefault).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledOnce()
  })

  it('cancels a deferred send when the conversation changes', () => {
    const deferred: Array<() => void> = []
    const submit = vi.fn()
    const submitter = createComposerEnterSubmitter(
      submit,
      (callback) => deferred.push(callback),
    )

    submitter.handleEnter(keyboardEvent({ isComposing: true }))
    submitter.handleCompositionEnd()
    submitter.reset()
    deferred[0]()

    expect(submit).not.toHaveBeenCalled()
  })

  it('forgets an unfinished composition when the composer changes', () => {
    const defer = vi.fn()
    const submit = vi.fn()
    const submitter = createComposerEnterSubmitter(submit, defer)

    submitter.handleEnter(keyboardEvent({ isComposing: true }))
    submitter.reset()
    submitter.handleCompositionEnd()

    expect(defer).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })
})
