# Label Feature Implementation Plan

## 1. Scope

Implement workspace-scoped labels that can be created and managed by workspace members, then attached to cards in the same workspace.

The implementation must support:

- Listing labels belonging to a workspace.
- Creating labels with a name and color.
- Deleting labels without deleting cards.
- Attaching labels to workspace cards.
- Removing labels from cards.
- Showing labels in card details.
- Enforcing workspace boundaries and existing role permissions.
- Keeping soft-delete and realtime behavior consistent with the rest of the application.

Labels are owned by a workspace, not by an individual card. A label must never be attached to a card in another workspace. Inbox cards cannot receive workspace labels.

## 2. Existing Code and Data Model

### Documentation

- `docs/labels.dto.ts` is the API contract for label responses and requests.
- `docs/board-list-card-plan.txt` explicitly deferred labels to a follow-up feature.
- `docs/index.ts` already exports `labels.dto.ts`.

### Prisma schema

`backend/prisma/schema.prisma` already contains the required relations:

- `Workspace.labels`
- `Label`
- `Card.card_labels`
- `CardLabel`

`Label` fields:

- `id`
- `workspace_id`
- `label_name`
- `label_color`
- audit fields
- `deleted_at`

`CardLabel` fields:

- `label_id`
- `card_id`
- audit fields
- `deleted_at`

Both relations use cascade behavior for hard deletes, but application-level label deletion must soft-delete active records and their active card-label links.

### Existing card support

Cards already include labels in detail responses:

- `backend/src/modules/card/card.service.ts` queries active `CardLabel` rows.
- `backend/src/modules/card/card.dto.ts` maps them to `{ label_id, label_name, label_color }`.
- `frontend/src/types/index.ts` defines `CardDetailLabel` and `CardDetail.labels`.
- `frontend/src/components/CardDetailModal.vue` already renders label chips in read-only metadata.

The label feature should extend this existing behavior instead of introducing a second label representation.

### Existing implementation conventions

Follow the patterns in the list, card, and workspace modules:

- Prisma calls directly from services.
- `authenticatedUserId(req)` in controllers.
- Zod request validation.
- `requireWorkspaceRole` and `getWorkspaceRole` for access control.
- `createdBy`, `updatedBy`, `softDeletedBy`, and `restoredBy` audit helpers.
- Custom errors from `backend/src/errors.ts`.
- `publishWorkspaceChange` after successful mutations.
- Active records filtered with `deleted_at: null`.

## 3. API Contract

All routes are authenticated and use the existing `/api` prefix.

### List workspace labels

```http
GET /api/workspaces/{workspace_id}/labels
```

Response: `200 OK`

```json
[
  {
    "id": "label-uuid",
    "workspace_id": "workspace-uuid",
    "label_name": "Bug",
    "label_color": "#EF4444",
    "created_at": "2026-08-03T12:00:00.000Z"
  }
]
```

Return only active labels. Order by `created_at` ascending unless the product introduces an explicit label ordering requirement.

### Create a workspace label

```http
POST /api/workspaces/{workspace_id}/labels
Content-Type: application/json
```

Request:

```json
{
  "label_name": "Bug",
  "label_color": "#EF4444"
}
```

Response: `201 Created`

```json
{
  "id": "label-uuid",
  "workspace_id": "workspace-uuid",
  "label_name": "Bug",
  "label_color": "#EF4444",
  "created_at": "2026-08-03T12:00:00.000Z"
}
```

Validation:

- `label_name`: trim whitespace, require 1-50 characters.
- `label_color`: require a six-digit hexadecimal color such as `#EF4444`.
- Reject unknown request fields if that matches the module validation convention.
- Decide whether duplicate names are allowed. Recommended first implementation: allow duplicate names because the existing schema has no unique constraint; the UI should make duplicates understandable.

### Update a label

```http
PUT /api/labels/{label_id}
Content-Type: application/json
```

Request fields are optional individually, but at least one is required:

```json
{
  "label_name": "Critical",
  "label_color": "#DC2626"
}
```

Response: `200 OK` with the updated `LabelDto`. MEMBER+ access to the label's workspace is required. The update is reflected on cards the next time their card details are loaded.

### Delete a label

```http
DELETE /api/labels/{label_id}
```

Response: `204 No Content`.

The service must:

1. Find the active label.
2. Check the caller has MEMBER or higher access to the label workspace.
3. Soft-delete the label.
4. Soft-delete all active `CardLabel` rows for that label in the same transaction.
5. Publish the workspace change after the transaction succeeds.

Cards remain intact. A later card-detail request must no longer return the deleted label.

### Attach a label to a card

```http
POST /api/cards/{card_id}/labels
Content-Type: application/json
```

Request:

```json
{
  "label_id": "label-uuid"
}
```

Response: `201 Created`

```json
{
  "id": "label-uuid",
  "workspace_id": "workspace-uuid",
  "label_name": "Bug",
  "label_color": "#EF4444",
  "created_at": "2026-08-03T12:00:00.000Z"
}
```

The service must verify:

- The card exists and is active.
- The card belongs to a list; inbox cards are rejected.
- The label exists and is active.
- The card list workspace and label workspace are identical.
- The caller has MEMBER or higher access to that workspace.
- An active `CardLabel` row does not already exist.

If a matching soft-deleted join row exists, restore it with `restoredBy` instead of inserting a duplicate composite-key row.

### Remove a label from a card

```http
DELETE /api/cards/{card_id}/labels/{label_id}
```

Response: `204 No Content`.

The service must verify the card and label belong to the same workspace, require MEMBER+ access, then soft-delete the active `CardLabel` row. The label itself remains available to the workspace.

## 4. Backend File Plan

Create a new module:

```text
backend/src/modules/label/
├── index.ts
├── label.controller.ts
├── label.dto.ts
├── label.router.ts
├── label.service.ts
└── label.validation.ts
```

### Service responsibilities

`label.service.ts` should provide functions equivalent to:

- `listLabels({ userId, workspaceId })`
- `createLabel({ userId, workspaceId, labelName, labelColor })`
- `updateLabel({ userId, labelId, labelName?, labelColor? })`
- `deleteLabel({ userId, labelId })`
- `addCardLabel({ userId, cardId, labelId })`
- `removeCardLabel({ userId, cardId, labelId })`

Use transactions for label deletion and card-label attach/restore operations where multiple records or authorization-sensitive reads are involved.

Use DTO mapping so Prisma models are not returned directly from controllers. The label DTO should match `docs/labels.dto.ts` exactly.

### Routing changes

Update:

- `backend/src/routes/protected-api.router.ts`
  - Mount `/labels` with the label router.
- `backend/src/modules/workspace/workspace.router.ts`
  - Add `GET /:workspaceId/labels`.
  - Add `POST /:workspaceId/labels`.
- `backend/src/modules/card/card.router.ts`
  - Add `POST /:card_id/labels`.
  - Add `DELETE /:card_id/labels/:label_id`.
  - Register `label_id` with the UUID parameter validator.

The delete-label route should be mounted before any wildcard route that could consume `/labels/:label_id`.

### Card service changes

Keep the existing card-detail label query and DTO shape. Add label mutations in the label service or card service, but avoid duplicating card authorization logic. If label operations live in a separate service, share small access helpers rather than copying inconsistent checks.

Inbox behavior must remain consistent with existing card movement logic: when a workspace card moves to the inbox, active members and labels are detached. When an inbox card moves to a workspace list, it starts without workspace labels.

## 5. Permission Matrix

| Operation | VIEWER | MEMBER | ADMIN | OWNER |
|---|---:|---:|---:|---:|
| List labels in readable public workspace | Yes | Yes | Yes | Yes |
| List labels in joined private workspace | Yes | Yes | Yes | Yes |
| Create label | No | Yes | Yes | Yes |
| Delete label | No | Yes | Yes | Yes |
| Attach label to card | No | Yes | Yes | Yes |
| Remove label from card | No | Yes | Yes | Yes |

A caller who is not a member of a private workspace must not infer whether its labels, cards, or label IDs exist. Use the existing not-found/forbidden behavior consistently with workspace and card services.

## 6. Realtime Behavior

Label mutations affect workspace board/card state. Extend the realtime event contract if consumers need to refresh automatically:

- Add `label` to the backend `workspaceChangeEventSchema.entity` enum.
- Add `label` to `frontend/src/types/index.ts` `WorkspaceChangedEvent.entity`.
- Publish the affected `workspace_id`, label or card `entity_id`, and relevant `list_ids`.
- Update frontend event consumers so label creation/deletion refreshes workspace labels and label attach/remove refreshes the affected card detail.

If the current frontend only refreshes on `card` events, use `entity: 'card'` for attach/remove and document that choice. The preferred design is an explicit `label` entity for label catalog mutations and a card update event for card-label mutations.

Realtime publication must happen after the database transaction succeeds and must not turn a successful database mutation into an HTTP failure if publication fails, matching current realtime behavior.

## 7. Frontend File Plan

Create:

```text
frontend/src/api/label.ts
```

Recommended API methods:

- `LabelAPI.list(workspaceId)`
- `LabelAPI.create(workspaceId, data)`
- `LabelAPI.update(labelId, patch)`
- `LabelAPI.remove(labelId)`
- `LabelAPI.attach(cardId, labelId)`
- `LabelAPI.detach(cardId, labelId)`

- `frontend/src/components/WorkspaceLabelsMenu.vue`
  - Provides the page-level Trello-style manager.
  - Creates, edits, and deletes workspace labels with color inputs.
  - Is opened from the workspace header beside the members control.

Update:

- `frontend/src/types/index.ts`
  - Add a workspace `Label` type matching `LabelDto`.
  - Keep `CardDetailLabel` for the card-detail representation.
  - Extend realtime entity types if the backend event is extended.
- `frontend/src/components/CardDetailModal.vue`
  - Load available workspace labels when card detail opens.
  - Add attach/remove controls for editable users.
  - Preserve the existing read-only chip display.
  - Handle loading, duplicate, permission, and request errors.
- `frontend/src/components/TaskCard.vue`
  - Add compact label display only if board list responses include label data. Do not assume labels are available in the current `Card` list DTO.
- Add a workspace label-management component or modal reachable from the board/workspace context.
- Add component-specific styles under `frontend/src/styles`.

The frontend should update local state after attach/remove and avoid requiring a full board reload for a card-detail-only change.

## 8. OpenAPI and Tests

Update the OpenAPI source under `backend/src/docs` for every new route, including:

- Parameters and UUID formats.
- Request bodies.
- `200`, `201`, `204`, `400`, `401`, `403`, `404`, and `409` responses where applicable.
- Label response schemas.
- Cross-workspace and inbox-card error behavior.

Add backend tests covering:

- Listing labels for a workspace.
- Creating labels with valid and invalid colors/names.
- Role enforcement for every write operation.
- Deleting a label and verifying active card-label rows are soft-deleted.
- Attaching a label to a card in the same workspace.
- Rejecting cross-workspace attachment.
- Rejecting inbox-card attachment.
- Rejecting duplicate active attachment.
- Restoring a previously detached join row.
- Removing a label without deleting the label.
- Card detail excluding deleted labels.

Add frontend tests covering:

- Correct request paths, methods, and payloads in `frontend/src/api/label.ts`.
- Label list/create/delete calls.
- Attach/detach calls.
- Card-detail label rendering and mutation state.

## 9. Verification Checklist

Run the project’s existing commands after implementation:

```bash
cd backend
npm test
npm run typecheck

cd ../frontend
npm test
npm run typecheck
npm run build
```

Also verify manually or through integration tests:

- A member can create and attach a label.
- A viewer can view labels but cannot mutate them.
- A label from workspace A cannot be attached to a card in workspace B.
- An inbox card cannot receive a workspace label.
- Deleting a label keeps cards and comments intact.
- Deleted labels disappear from card detail responses.
- Removing a label preserves the label for later reuse.
- Realtime events refresh the appropriate workspace/card state.
- `docs/labels.dto.ts`, OpenAPI definitions, backend responses, and frontend types use the same field names.
