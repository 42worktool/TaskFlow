import { afterEach, describe, expect, it } from 'vitest'
import {
  clearInboxDestinations,
  closeUtilityDrawer,
  notifyBoardChanged,
  notifyInboxChanged,
  openUtilityDrawer,
  setInboxDestinations,
  toggleUtilityDrawer,
  utilityDrawerState,
} from './utilityDrawer'

describe('utility drawer state', () => {
  afterEach(() => {
    closeUtilityDrawer()
    clearInboxDestinations()
  })

  it('opens one drawer at a time and toggles the active drawer closed', () => {
    openUtilityDrawer('friends')
    expect(utilityDrawerState.active).toBe('friends')

    toggleUtilityDrawer('inbox')
    expect(utilityDrawerState.active).toBe('inbox')

    toggleUtilityDrawer('inbox')
    expect(utilityDrawerState.active).toBeNull()
  })

  it('shares only the small inbox context needed by the active board', () => {
    const inboxToken = utilityDrawerState.inboxRefreshToken
    const boardToken = utilityDrawerState.boardRefreshToken

    setInboxDestinations([{ id: 'list-1', name: 'Todo' }])
    notifyInboxChanged()
    notifyBoardChanged()

    expect(utilityDrawerState.inboxDestinations).toEqual([
      { id: 'list-1', name: 'Todo' },
    ])
    expect(utilityDrawerState.inboxRefreshToken).toBe(inboxToken + 1)
    expect(utilityDrawerState.boardRefreshToken).toBe(boardToken + 1)
  })
})
