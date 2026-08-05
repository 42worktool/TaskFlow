# Initial UI Milestones

> Historical milestone plan. Mock data described below has been replaced by
> live API-backed prototype features. See the root `README.md` for current
> behavior and limitations.

This plan starts the Vue UI while treating `docs/*.dto.ts` as the current API contract.
DTOs may change, so pages should not import request logic directly. Keep API access in
`frontend/src/api/`, shared shapes in `frontend/src/types/`, and feature state in
`frontend/src/stores/` or local composables.

## Assumptions

- Vue 3 + Vite remains the frontend baseline.
- Route-level `.vue` files live in `frontend/src/pages/`.
- Smaller reusable elements live in `frontend/src/components/{feature}/`.
- DTO field names are currently snake_case and should be preserved at the API boundary.
- Initial UI can use mocked API functions first, then swap to HTTP implementations.

## Milestone 0: UI Foundation

Goal: create the structure that later screens can build on without rework.

- Add routing structure for auth, workspace index, workspace board, calendar, dashboard,
  timeline, profile, and fallback pages.
- Add layouts: auth layout and workspace app layout.
- Add API client boundary with typed functions grouped by DTO area:
  `auth`, `workspaces`, `lists`, `cards`, `labels`, `comments`, `misc`, `users`.
- Add basic shared UI components: button, input, modal, avatar, loading, empty state,
  error state.
- Add a small mock data layer matching DTOs.

Verify:

- `npm run build` passes.
- Every route renders a placeholder through the router.
- No page imports raw DTO files except through local `types` or API modules.

## Milestone 1: Auth Shell

Goal: users can reach the app through realistic auth screens.

- Implement login, signup, OAuth entry, logout, and current-user loading states.
- Model `UserPublic`, `LoginRequest`, `SignupRequest`, `MeResponse`, and
  `RefreshResponse`.
- Store access token and current user in one auth state module.
- Guard authenticated routes.

Verify:

- Logged-out users land on login/signup.
- Logged-in mock users can enter the workspace index.
- Auth errors display using the common `ErrorResponse` shape.

## Milestone 2: Workspace Index

Goal: users can browse and create workspaces.

- Implement workspace list using `ListWorkspacesResponse`.
- Add create/edit/delete workspace dialogs using `CreateWorkspaceRequest` and
  `UpdateWorkspaceRequest`.
- Show public/private state.
- Keep member management entry visible but disabled or minimal until Milestone 5.

Verify:

- Empty, loading, error, and populated workspace states render.
- Creating or editing a workspace updates the local UI from DTO-shaped responses.
- Deleting a workspace has a confirmation because deletion cascades.

## Milestone 3: Board And Inbox MVP

Goal: the core Trello-like workflow works visually.

- Implement board page with lists sorted by `sequence`.
- Implement cards sorted by `sequence` inside each list.
- Add create/rename/delete list.
- Add create/edit/delete card.
- Add card move between lists using `MoveCardRequest`.
- Add reorder UI using `before_*_id` and `after_*_id`; do not send raw `sequence`.
- Add right-side inbox panel using `GetInboxResponse`.
- Support moving cards to inbox and back to a list.

Verify:

- The board works with mock data containing multiple lists and cards.
- Reorder/move code sends neighbor IDs, not sequence numbers.
- Inbox cards are represented as `list_id: null`.

## Milestone 4: Card Detail

Goal: card detail becomes the single place for richer card editing.

- Add card detail modal from `GetCardResponse`.
- Edit title, description, start date, and deadline.
- Display labels using `CardLabelDto`.
- Display attachments metadata using `AttachmentDto`; upload can remain a later hook.
- Add comments list and comment creation using `CommentDto`.

Verify:

- `null` date and description values render correctly.
- Date updates follow `start_at <= deadline` in the UI before submit.

## Milestone 5: Members, Roles, Labels

Goal: workspace administration is usable enough for team workflows.

- Add workspace detail/member panel using `WorkspaceDetailResponse`.
- Invite member by email using `InviteMemberRequest`.
- Let OWNER and ADMIN change eligible non-owner roles using
  `UpdateMemberRoleRequest`, with per-member loading and error feedback.
- Keep OWNER membership read-only in this dialog; ownership transfer is a
  separate workflow.
- Add label list/create/delete and attach/detach labels on cards.

Verify:

- OWNER, ADMIN, MEMBER, and VIEWER states are visually distinct.
- Destructive label and member actions show confirmations.
- Label attach UI only offers labels from the current workspace.

## Milestone 6: Calendar, Dashboard, Search

Goal: secondary project views exist and reuse board data contracts.

- Add calendar view using `GetCalendarResponse`.
- Add dashboard summary cards and simple charts from available card/list data.
- Add search page or command panel using `SearchResponse`.
- Add timeline view as a read-only date-based card list if full timeline is too large.

Verify:

- Calendar filters by `YYYY-MM`.
- Cards with both `start_at` and `deadline` null are excluded from calendar UI.
- Search results link back to the correct workspace/card context.

## Milestone 7: Integration Hardening

Goal: replace mocks with real API calls with limited churn.

- Swap mock API modules to HTTP implementations.
- Normalize DTO changes only in `api/` or mapper functions.
- Add route-level loading and error boundaries.
- Add smoke tests or component tests for auth, workspace list, board, and card modal.
- Run accessibility pass for keyboard navigation and focus management.

Verify:

- `npm run build` passes.
- Main flows work against the backend or a local API stub.
- DTO changes do not require broad edits across page components.

## Suggested First Tasks

1. Create `frontend/src/router/index.ts` and route placeholders.
2. Create `frontend/src/api/` with mock implementations matching `docs/index.ts`.
3. Build `AuthLayout`, `WorkspaceLayout`, and shared UI primitives.
4. Implement login/signup and workspace index before the board.
