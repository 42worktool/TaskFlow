const userConnections = new Map<string, Set<string>>()

// 사용자 한 명이 여러 탭/기기로 접속할 수 있으므로 연결 ID 집합으로 상태를 센다.
// 첫 연결에서만 online, 마지막 연결 해제에서만 offline 전환을 알린다.

export function addPresenceConnection(userId: string, connectionId: string): boolean {
  const connections = userConnections.get(userId) ?? new Set<string>()
  const becameOnline = connections.size === 0
  connections.add(connectionId)
  userConnections.set(userId, connections)
  return becameOnline
}

export function removePresenceConnection(userId: string, connectionId: string): boolean {
  const connections = userConnections.get(userId)
  if (!connections || !connections.delete(connectionId)) return false
  if (connections.size > 0) return false

  userConnections.delete(userId)
  return true
}

export function isUserOnline(userId: string): boolean {
  return (userConnections.get(userId)?.size ?? 0) > 0
}

export function clearPresence(): void {
  userConnections.clear()
}
