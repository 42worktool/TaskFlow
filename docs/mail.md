# Mail Setup

> Owner: hozo
> Status: lib ready — route/invitation wiring TBD

---

## 0. Current State Summary

- `backend/src/lib/mailer.ts` — nodemailer transporter + `sendMail()` helper
- `backend/src/lib/mailer.test.ts` — quick smoke test script
- `backend/src/config/index.ts` — `config.smtp` object (host, port, user, pass, from)
- `.env.example` — SMTP_* variables documented
- `backend/package.json` — `nodemailer` dependency + `@types/nodemailer` devDependency

---

## 1. Architecture

```
.env ─► config/index.ts ─► lib/mailer.ts (singleton transporter) ─► callers (invite, etc.)
```

The transporter is created once at module load time using `createTransport()`. The `sendMail()` function wraps `transporter.sendMail()` and always sets the `from` address from config.

---

## 2. Configuration

### 2.1 Environment variables

| Variable     | Default             | Description                        |
|-------------|---------------------|------------------------------------|
| SMTP_HOST   | (required)          | SMTP server hostname               |
| SMTP_PORT   | 587                 | SMTP port                          |
| SMTP_USER   | (required)          | SMTP auth username                 |
| SMTP_PASS   | (required)          | SMTP auth password / app password  |
| SMTP_FROM   | (required)          | `From` header for all outgoing mail|

### 2.2 Gmail example

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password        # Generate via Google Account > App Passwords
SMTP_FROM="TaskFlow <noreply@yourdomain.com>"
```

Port 587 uses STARTTLS (`secure: false`). Port 465 uses implicit TLS (`secure: true` is set automatically when port is 465).

---

## 3. API

### `sendMail(options: MailOptions): Promise<void>`

```ts
interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}
```

`from` is always taken from `config.smtp.from` — callers don't set it.

Returns void on success, throws on failure.

### Usage example

```ts
import { sendMail } from '../lib/mailer';

await sendMail({
  to: 'user@example.com',
  subject: 'Welcome to TaskFlow',
  text: 'Your account has been created.',
  html: '<h1>Welcome</h1><p>Your account has been created.</p>',
});
```

---

## 4. Testing

```bash
# Add TEST_EMAIL_TO to .env
echo 'TEST_EMAIL_TO=you@example.com' >> .env

# Run the smoke test
cd backend
npx tsx --env-file=.env src/lib/mailer.test.ts
```

Output: logs success or failure with the error details.

---

## 5. Next Steps (out of scope for this step)

- Wire `sendMail()` into workspace invite flow (`POST /api/workspaces/:id/members`)
- Rate limiting on email sends (Redis-backed throttle)
- Email templates (welcome, invite, password reset) — plain `text`/`html` strings for now
- Queue system for async delivery (optional — nodemailer is already async)
