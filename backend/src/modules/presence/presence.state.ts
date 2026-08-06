const userConnections = new Map<string, Set<string>>()

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
