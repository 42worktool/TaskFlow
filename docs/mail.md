# Email invitation pipeline

> Owner recorded in the original note: hozo
>
> Status: implemented for workspace invitations

## Current flow

```text
POST /api/workspaces/:workspaceId/members
  -> validate ADMIN+ and recipient/role
  -> enforce recipient rate limit in Redis
  -> sign a seven-day, email-bound invitation JWT
  -> enqueue the SMTP message in Redis
  -> background mail worker sends through Nodemailer

POST /api/workspaces/invite/:token
  -> verify signature, issuer, audience, expiry, role, and email
  -> require the signed-in account email to match
  -> create or restore the workspace membership
  -> notify already-connected workspace members
```

Invitation acceptance is idempotent for an already-active member. An expired,
malformed, or deleted-workspace token is rejected. The final workspace owner
rules remain enforced by the normal member-management service.

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
- `backend/src/modules/workspace/workspace.service.ts`: authorization, token
  generation/verification, queueing, and membership acceptance.

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
