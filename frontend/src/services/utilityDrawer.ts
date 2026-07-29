import { reactive } from 'vue'
import type { List } from '../types'

export type UtilityDrawer = 'friends' | 'inbox'
export type InboxDestination = Pick<List, 'id' | 'name'>

export const utilityDrawerState = reactive<{
  active: UtilityDrawer | null
  inboxDestinations: InboxDestination[]
  inboxRefreshToken: number
  boardRefreshToken: number
}>({
  active: null,
  inboxDestinations: [],
  inboxRefreshToken: 0,
  boardRefreshToken: 0,
})

export function openUtilityDrawer(drawer: UtilityDrawer): void {
  utilityDrawerState.active = drawer
}

export function toggleUtilityDrawer(drawer: UtilityDrawer): void {
  utilityDrawerState.active =
    utilityDrawerState.active === drawer ? null : drawer
}

export function closeUtilityDrawer(): void {
  utilityDrawerState.active = null
}

export function setInboxDestinations(
  destinations: readonly InboxDestination[],
): void {
  utilityDrawerState.inboxDestinations = destinations.map((list) => ({
    id: list.id,
    name: list.name,
  }))
}

export function clearInboxDestinations(): void {
  utilityDrawerState.inboxDestinations = []
}

export function notifyInboxChanged(): void {
  utilityDrawerState.inboxRefreshToken += 1
}

export function notifyBoardChanged(): void {
  utilityDrawerState.boardRefreshToken += 1
}
