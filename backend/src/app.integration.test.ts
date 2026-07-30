import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import test, { after, before } from 'node:test';

interface HttpResult {
  status: number;
  body: unknown;
}

let server: Server;
let port: number;

function setRequiredEnvironment(): void {
  Object.assign(process.env, {
    APP_ORIGIN: 'http://localhost:5173',
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/oauth/callback/google',
    REDIS_URL: 'redis://localhost:6379',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'test',
    SMTP_PASS: 'test',
    SMTP_FROM: 'test@example.com',
  });
}

function send(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

before(async () => {
  setRequiredEnvironment();
  const { default: app } = await import('./app');
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('malformed JSON is returned as a 400 API error', async () => {
  const result = await send('/api/auth/login', {
    method: 'POST',
    body: '{"email":',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.deepEqual(result, {
    status: 400,
    body: {
      status_code: 400,
      error: 'BAD_REQUEST',
      message: 'Invalid request',
    },
  });
});

test('oversized JSON is returned as a 413 API error', async () => {
  const result = await send('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ value: 'x'.repeat(110 * 1024) }),
    headers: { 'Content-Type': 'application/json' },
  });

  assert.deepEqual(result, {
    status: 413,
    body: {
      status_code: 413,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    },
  });
});

test('protected routes reject requests without a bearer token', async () => {
  const result = await send('/api/workspaces');

  assert.deepEqual(result, {
    status: 401,
    body: {
      status_code: 401,
      error: 'UNAUTHORIZED',
      message: 'A Bearer access token is required',
    },
  });
});

test('feature routes reject requests without a bearer token', async () => {
  for (const path of [
    '/api/friends',
    '/api/inbox',
    '/api/lists/00000000-0000-4000-8000-000000000001',
    '/api/workspaces/00000000-0000-4000-8000-000000000001/dashboard',
    '/api/workspaces/00000000-0000-4000-8000-000000000001/messages',
  ]) {
    const result = await send(path);

    assert.deepEqual(result, {
      status: 401,
      body: {
        status_code: 401,
        error: 'UNAUTHORIZED',
        message: 'A Bearer access token is required',
      },
    });
  }

  const createMessage = await send(
    '/api/workspaces/00000000-0000-4000-8000-000000000001/messages',
    {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
  assert.equal(createMessage.status, 401);
});

test('password login rejects cross-origin requests before service access', async () => {
  const result = await send('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://attacker.example',
    },
  });

  assert.deepEqual(result, {
    status: 403,
    body: {
      status_code: 403,
      error: 'INVALID_ORIGIN',
      message: 'The request origin is not allowed',
    },
  });
});
