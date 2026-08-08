export class KeyedLock {
  private readonly tails = new Map<string, Promise<void>>()

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // 같은 Node 프로세스 안에서 같은 키의 작업만 Promise 꼬리에 연결해 직렬화한다.
    // 서로 다른 키는 병렬로 두며, 다중 인스턴스나 DB 동시성은 DB 제약·분산 락으로 따로 보호한다.
    const previous = this.tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })

    this.tails.set(key, current)
    await previous

    try {
      return await operation()
    } finally {
      // 작업이 실패해도 다음 대기자를 해제하고, 마지막 작업이면 키를 제거해 누수를 막는다.
      release()
      if (this.tails.get(key) === current) {
        this.tails.delete(key)
      }
    }
  }
}
