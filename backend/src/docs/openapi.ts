const userSchema = {
  type: 'object',
  required: ['id', 'email', 'name', 'profile_image_url', 'created_at'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email', example: 'user@example.com' },
    name: { type: 'string', minLength: 2, maxLength: 80, example: '홍길동' },
    profile_image_url: {
      type: 'string',
      format: 'uri',
      nullable: true,
      example: null,
    },
    created_at: { type: 'string', format: 'date-time' },
  },
} as const;

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
});

const redirectResponse = (description: string) => ({
  description,
  headers: {
    Location: {
      description: 'Redirect destination',
      schema: { type: 'string', format: 'uri-reference' },
    },
  },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'TaskFlow Authentication API',
    version: '1.0.0',
    description: [
      'TaskFlow의 인증, 계정, Google OAuth 및 세션 API 명세입니다.',
      '',
      '- Access Token은 응답 본문으로 발급되는 Bearer JWT입니다.',
      '- Refresh Token은 `ft_refresh_token` HttpOnly 쿠키로 발급되고 Redis에서 관리됩니다.',
      '- Google OAuth 콜백은 브라우저 리디렉션 전용입니다.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: '현재 TaskFlow origin' }],
  tags: [
    { name: 'System', description: '서버 상태 확인' },
    { name: 'Authentication', description: '수동 회원가입 및 로그인' },
    { name: 'Google OAuth', description: 'Google Authorization Code Flow' },
    { name: 'Session', description: 'Access/Refresh 세션 관리' },
    { name: 'Account', description: '현재 사용자 계정 관리' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: '서버 상태 확인',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: '서버가 정상 동작 중',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/signup': {
      post: {
        tags: ['Authentication'],
        summary: '이메일/비밀번호 회원가입',
        description: '계정을 생성하고 즉시 Access Token과 Refresh Token 세션을 발급합니다.',
        operationId: 'signup',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignupRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: '계정 생성 및 로그인 성공',
            headers: {
              'Set-Cookie': { $ref: '#/components/headers/RefreshTokenCookie' },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSessionResponse' },
              },
            },
          },
          '400': errorResponse('이름, 이메일 또는 비밀번호 검증 실패'),
          '403': errorResponse('Origin 불일치'),
          '409': errorResponse('이미 가입된 이메일'),
          '500': errorResponse('인증 처리 중 내부 오류'),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: '이메일/비밀번호 로그인',
        description: '자격 증명을 검증하고 Access Token과 Refresh Token 세션을 발급합니다.',
        operationId: 'login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: '로그인 성공',
            headers: {
              'Set-Cookie': { $ref: '#/components/headers/RefreshTokenCookie' },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSessionResponse' },
              },
            },
          },
          '401': errorResponse('이메일 또는 비밀번호 불일치'),
          '403': errorResponse('Origin 불일치'),
          '429': errorResponse('로그인 실패 횟수 제한 초과'),
          '500': errorResponse('인증 처리 중 내부 오류'),
        },
      },
    },
    '/api/auth/oauth/google': {
      get: {
        tags: ['Google OAuth'],
        summary: 'Google OAuth 시작',
        description: 'OAuth state와 nonce를 생성한 뒤 Google 로그인 화면으로 이동합니다.',
        operationId: 'beginGoogleOAuth',
        parameters: [
          {
            name: 'return_to',
            in: 'query',
            required: false,
            description: '로그인 완료 후 이동할 애플리케이션 내부 경로',
            schema: { type: 'string', default: '/workspaces', example: '/account' },
          },
        ],
        responses: {
          '302': redirectResponse('Google 로그인 화면으로 이동'),
          '500': errorResponse('OAuth 시작 중 내부 오류'),
        },
      },
    },
    '/api/auth/oauth/callback/google': {
      get: {
        tags: ['Google OAuth'],
        summary: 'Google OAuth 정규 콜백',
        description: 'Google이 호출하는 Authorization Code 콜백입니다. 직접 호출하지 않습니다.',
        operationId: 'googleOAuthCallback',
        parameters: [
          {
            name: 'code',
            in: 'query',
            required: false,
            description: 'Google Authorization Code',
            schema: { type: 'string' },
          },
          {
            name: 'state',
            in: 'query',
            required: false,
            description: 'OAuth CSRF 방지 상태값',
            schema: { type: 'string' },
          },
          {
            name: 'error',
            in: 'query',
            required: false,
            description: 'Google이 반환한 OAuth 오류',
            schema: { type: 'string', example: 'access_denied' },
          },
        ],
        responses: {
          '302': redirectResponse('성공 시 return_to, 실패 시 로그인 오류 화면으로 이동'),
        },
      },
    },
    '/oauth/google': {
      get: {
        tags: ['Google OAuth'],
        summary: 'Google OAuth 로컬 호환 콜백',
        description: [
          '현재 Google Cloud에 등록된 `http://localhost:8080/oauth/google` 콜백입니다.',
          '처리 방식은 정규 콜백과 동일하며 직접 호출하지 않습니다.',
        ].join('\n'),
        operationId: 'googleOAuthCompatibilityCallback',
        parameters: [
          { name: 'code', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'state', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'error', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '302': redirectResponse('성공 시 return_to, 실패 시 로그인 오류 화면으로 이동'),
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Session'],
        summary: 'Access Token 갱신',
        description: 'Refresh Token을 일회성으로 소비하고 새 Refresh Token과 Access Token을 발급합니다.',
        operationId: 'refreshSession',
        security: [{ refreshCookie: [] }],
        responses: {
          '200': {
            description: '토큰 회전 성공',
            headers: {
              'Set-Cookie': { $ref: '#/components/headers/RefreshTokenCookie' },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AccessTokenResponse' },
              },
            },
          },
          '401': errorResponse('Refresh Token 쿠키 누락, 만료 또는 검증 실패'),
          '403': errorResponse('Origin 불일치'),
          '500': errorResponse('세션 갱신 중 내부 오류'),
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Session'],
        summary: '현재 세션 로그아웃',
        description: '현재 Refresh Token 세션을 폐기하고 쿠키를 제거합니다.',
        operationId: 'logout',
        security: [{ refreshCookie: [] }],
        responses: {
          '204': { description: '로그아웃 완료' },
          '403': errorResponse('Origin 불일치'),
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Account'],
        summary: '현재 사용자 조회',
        operationId: 'getCurrentUser',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: '현재 사용자 정보',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          '401': errorResponse('Access Token 누락, 만료 또는 검증 실패'),
          '404': errorResponse('사용자가 더 이상 존재하지 않음'),
        },
      },
    },
    '/api/auth/account': {
      patch: {
        tags: ['Account'],
        summary: '표시 이름 수정',
        operationId: 'updateCurrentAccount',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateAccountRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: '수정된 사용자 정보',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          '400': errorResponse('이름 검증 실패'),
          '401': errorResponse('Access Token 누락, 만료 또는 검증 실패'),
          '403': errorResponse('Origin 불일치'),
          '404': errorResponse('사용자가 더 이상 존재하지 않음'),
        },
      },
      delete: {
        tags: ['Account'],
        summary: '현재 계정 삭제',
        description: '사용자, OAuth 연결 및 모든 Refresh Token 세션을 영구 삭제합니다.',
        operationId: 'deleteCurrentAccount',
        security: [{ bearerAuth: [] }],
        responses: {
          '204': { description: '계정 삭제 완료' },
          '401': errorResponse('Access Token 누락, 만료 또는 검증 실패'),
          '403': errorResponse('Origin 불일치'),
          '404': errorResponse('사용자가 더 이상 존재하지 않음'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '로그인, 회원가입 또는 refresh 응답의 access_token',
      },
      refreshCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'ft_refresh_token',
        description: '서버가 발급하는 HttpOnly Refresh Token 쿠키',
      },
    },
    headers: {
      RefreshTokenCookie: {
        description: 'HttpOnly Refresh Token 쿠키',
        schema: {
          type: 'string',
          example: 'ft_refresh_token=<opaque-token>; Path=/api/auth; HttpOnly; SameSite=Lax',
        },
      },
    },
    schemas: {
      HealthResponse: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['ok'] } },
      },
      User: userSchema,
      SignupRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80, example: '홍길동' },
          email: { type: 'string', format: 'email', maxLength: 254, example: 'user@example.com' },
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            maxLength: 128,
            example: 'password-1234',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', format: 'password', example: 'password-1234' },
        },
      },
      UpdateAccountRequest: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80, example: '새 이름' },
        },
      },
      AuthSessionResponse: {
        type: 'object',
        required: ['user', 'access_token', 'token_type', 'expires_in'],
        properties: {
          user: { $ref: '#/components/schemas/User' },
          access_token: { type: 'string', description: 'JWT Access Token' },
          token_type: { type: 'string', enum: ['Bearer'] },
          expires_in: { type: 'integer', format: 'int32', example: 900 },
        },
      },
      AccessTokenResponse: {
        type: 'object',
        required: ['access_token', 'token_type', 'expires_in'],
        properties: {
          access_token: { type: 'string', description: 'JWT Access Token' },
          token_type: { type: 'string', enum: ['Bearer'] },
          expires_in: { type: 'integer', format: 'int32', example: 900 },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['status_code', 'error', 'message'],
        properties: {
          status_code: { type: 'integer', format: 'int32', example: 401 },
          error: { type: 'string', example: 'INVALID_CREDENTIALS' },
          message: { type: 'string', example: 'Email or password is incorrect' },
        },
      },
    },
  },
} as const;
