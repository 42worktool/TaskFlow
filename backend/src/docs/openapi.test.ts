import assert from 'node:assert/strict';
import test from 'node:test';
import { openApiDocument } from './openapi';

test('OpenAPI document contains every active authentication and account route', () => {
  assert.equal(openApiDocument.openapi, '3.0.3');
  assert.ok(openApiDocument.paths['/api/health'].get);
  assert.ok(openApiDocument.paths['/api/auth/signup'].post);
  assert.ok(openApiDocument.paths['/api/auth/login'].post);
  assert.ok(openApiDocument.paths['/api/auth/oauth/google'].get);
  assert.ok(openApiDocument.paths['/api/auth/oauth/callback/google'].get);
  assert.ok(openApiDocument.paths['/oauth/google'].get);
  assert.ok(openApiDocument.paths['/api/auth/refresh'].post);
  assert.ok(openApiDocument.paths['/api/auth/logout'].post);
  assert.ok(openApiDocument.paths['/api/auth/me'].get);
  assert.ok(openApiDocument.paths['/api/auth/account'].patch);
  assert.ok(openApiDocument.paths['/api/auth/account'].delete);
  assert.ok(openApiDocument.paths['/api/workspaces/{workspaceId}/labels'].get);
  assert.ok(openApiDocument.paths['/api/workspaces/{workspaceId}/labels'].post);
  assert.ok(openApiDocument.paths['/api/labels/{label_id}'].put);
  assert.ok(openApiDocument.paths['/api/labels/{label_id}'].delete);
  assert.ok(openApiDocument.paths['/api/cards/{card_id}/labels'].post);
  assert.ok(openApiDocument.paths['/api/cards/{card_id}/labels/{label_id}'].delete);
});

test('OpenAPI operation IDs are unique', () => {
  const operationIds = Object.values(openApiDocument.paths).flatMap((pathItem) =>
    Object.values(pathItem).flatMap((operation) =>
      'operationId' in operation ? [operation.operationId] : [],
    ),
  );

  assert.equal(new Set(operationIds).size, operationIds.length);
});

test('user responses identify the authentication provider', () => {
  const userSchema = openApiDocument.components.schemas.User;
  const refreshSchema = openApiDocument.components.schemas.AccessTokenResponse;

  assert.ok(userSchema.required.includes('auth_provider'));
  assert.deepEqual(userSchema.properties.auth_provider.enum, ['password', 'google']);
  assert.ok(refreshSchema.required.includes('user'));
  assert.deepEqual(refreshSchema.properties.user, {
    $ref: '#/components/schemas/User',
  });
});

test('all local OpenAPI references resolve', () => {
  const root = openApiDocument as unknown as Record<string, unknown>;

  function resolveReference(reference: string): unknown {
    assert.ok(reference.startsWith('#/'), `Only local references are expected: ${reference}`);
    return reference
      .slice(2)
      .split('/')
      .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
      .reduce<unknown>((value, part) => {
        assert.ok(value && typeof value === 'object', `Reference does not resolve: ${reference}`);
        return (value as Record<string, unknown>)[part];
      }, root);
  }

  function inspect(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref') {
        assert.notEqual(resolveReference(String(child)), undefined, `Reference not found: ${child}`);
      } else {
        inspect(child);
      }
    }
  }

  inspect(openApiDocument);
});
