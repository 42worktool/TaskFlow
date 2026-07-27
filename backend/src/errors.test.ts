import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import { sendError } from './errors';

function responseRecorder() {
  let statusCode: number | undefined;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
  } as unknown as Response;

  return {
    response,
    result: () => ({ statusCode, body }),
  };
}

test('sendError preserves malformed JSON as a client error', () => {
  const recorder = responseRecorder();

  sendError(recorder.response, { status: 400, type: 'entity.parse.failed' });

  assert.deepEqual(recorder.result(), {
    statusCode: 400,
    body: {
      status_code: 400,
      error: 'BAD_REQUEST',
      message: 'Invalid request',
    },
  });
});

test('sendError preserves payload-too-large responses', () => {
  const recorder = responseRecorder();

  sendError(recorder.response, { statusCode: 413, type: 'entity.too.large' });

  assert.deepEqual(recorder.result(), {
    statusCode: 413,
    body: {
      status_code: 413,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    },
  });
});
