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
