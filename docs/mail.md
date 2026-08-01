# Email invitation pipeline

> Owner recorded in the original note: hozo
>
> Status: implemented for workspace invitations

## Current flow

```text
POST /api/workspaces/:workspaceId/members
  -> validate ADMIN+ and recipient/role
  -> enforce recipient rate limit in Redis
  -> store a hashed, seven-day one-time invitation token in Redis
  -> enqueue the SMTP message in Redis
  -> background mail worker sends through Nodemailer

GET /api/workspaces/invite/:token
  -> require a signed-in account
  -> return workspace name and role without consuming the token

POST /api/workspaces/invite/:token
  -> atomically read and delete the Redis invitation with GETDEL
  -> create or restore the workspace membership
  -> notify already-connected workspace members
```

The delivery address is not an account binding: a recipient may accept with a
different TaskFlow account after confirming that account in the UI. The token is
removed before the database membership write, so concurrent acceptance has one
winner. If the database write then fails, the invitation must be sent again. An
expired, malformed, consumed, or deleted-workspace token is rejected. The final
workspace owner rules remain enforced by the normal member-management service.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | required | SMTP hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | required | SMTP username |
| `SMTP_PASS` | required | SMTP password or app password |
| `SMTP_FROM` | required | Sender used for all outgoing messages |

The current transporter uses STARTTLS (`secure: false`), so configure a
provider endpoint intended for that mode, such as Gmail on port 587.

## Components

- `backend/src/lib/mailer.ts`: shared Nodemailer transporter.
- `backend/src/lib/mail-templates.ts`: plain-text and HTML invitation template.
- `backend/src/lib/mail-rate-limiter.ts`: five messages per recipient per hour.
- `backend/src/lib/mail-queue.ts`: Redis list and a dedicated blocking worker
  connection.
- `backend/src/modules/workspace/workspace-invitation.store.ts`: opaque
  invitation creation, hashed Redis storage, preview, and atomic one-time
  removal.
- `backend/src/modules/workspace/workspace.service.ts`: authorization, token
  queueing, preview, and membership acceptance.

The worker starts with the backend and participates in graceful shutdown. Mail
delivery is deliberately a small prototype queue: failed jobs are logged but
there is no retry/dead-letter policy.

## Verification

Template rendering is covered by the backend test suite:

```bash
cd backend
npm test
```

An end-to-end delivery check requires valid SMTP credentials and a recipient
address. Never commit those credentials to the repository.
