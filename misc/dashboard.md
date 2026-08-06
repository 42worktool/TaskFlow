# Workspace activity dashboard

The dashboard at `/workspaces/:workspaceId/dashboard` is a read-only view over
the existing workspace activity log and current board state. It does not add a
second analytics store.

## Metric definitions

| Metric | Definition |
| --- | --- |
| Contribution heatmap | Distinct activity `transaction_id` values per UTC day for the selected UTC period |
| Raw activity | Activity log rows for a day; shown only as tooltip context |
| Created issues | `CARD_CREATED` events during the selected period |
| Completed actions | `CARD_COMPLETED` events during the selected period |
| Reopened actions | `CARD_REOPENED` events during the selected period |
| Current total | Active cards currently attached to active workspace lists |
| Current done | Active workspace cards whose `is_completed` flag is `true` |
| Current not done | Current total minus current done |
| Completion rate | Current done divided by current total |

A card is the prototype's issue unit. Its completion button updates the card's
own `is_completed` flag, so completing or reopening a card never moves it to a
different list. A list's `is_done` flag remains only as an optional visual
marker for teams that want to highlight a workflow column; it does not affect
completion history or dashboard totals.

The contribution heatmap counts distinct transactions because a single API
operation can produce more than one trigger row. Event totals such as completed
actions remain event counts, so completing, reopening, and completing the same
card again records two completed actions. `WORKSPACE_CREATED` is excluded from
all dashboard aggregates and the activity feed because workspace creation is
outside the board-progress scope.

## API

`GET /api/workspaces/:workspaceId/dashboard?period=30` accepts `7`, `30`, `90`,
or `365`; it defaults to `30` and rejects unknown query fields. It returns:

- `summary`: current card state and selected-period totals;
- `daily_activity`: selected-period padded UTC date buckets;
- `daily_flow`: selected-period padded UTC date buckets for created, completed,
  and reopened cards;
- `lists`: current card count and completed-card count for every active list;
- `activity_breakdown`: selected-period activity rows grouped by target type;
- `recent_activity`: up to 50 latest selected-period events with timestamp,
  target, and the active actor when available.

Private workspaces require membership. Authenticated users can read dashboards
for public workspaces, matching normal public board visibility.

## Realtime refresh

The dashboard reuses the workspace WebSocket invalidation already owned by the
layout. It debounces a fresh aggregate request after a `workspace.changed`
event, so it does not add polling or another WebSocket message type.

Activity from before the activity-log migration is not backfilled. Inbox-only
cards are personal and therefore do not appear in workspace activity metrics.
Moving an existing Inbox card onto a board is a card movement, not a newly
created issue.
