// 한글 IME 조합 중 Enter가 keydown과 compositionend로 중복 전달되는 문제를 흡수한다.
interface ComposerEnterSubmitter {
  handleEnter: (event: KeyboardEvent) => void
  handleCompositionEnd: () => void
  reset: () => void
}

export function createComposerEnterSubmitter(
  submit: () => void,
  defer: (callback: () => void) => void,
): ComposerEnterSubmitter {
  let pendingCompositionSubmit = false
  let scheduledSubmit = false

  function handleEnter(event: KeyboardEvent): void {
    // Chrome은 조합 중 isComposing 외에 keyCode 229로도 알리므로 둘 다 기다린다.
    if (event.isComposing || event.keyCode === 229) {
      pendingCompositionSubmit = true
      return
    }

    event.preventDefault()
    pendingCompositionSubmit = false
    if (scheduledSubmit) return
    submit()
  }

  function handleCompositionEnd(): void {
    if (!pendingCompositionSubmit || scheduledSubmit) return
    pendingCompositionSubmit = false
    scheduledSubmit = true
    // compositionend 직후 DOM 입력값이 확정된 다음 tick에 보내 마지막 글자 누락을 막는다.
    defer(() => {
      if (!scheduledSubmit) return
      scheduledSubmit = false
      submit()
    })
  }

  function reset(): void {
    pendingCompositionSubmit = false
    scheduledSubmit = false
  }

  return { handleEnter, handleCompositionEnd, reset }
}
