import cookieParser from 'cookie-parser';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './docs/openapi';
import { authRouter, googleCallback } from './modules/auth';
import { usersRouter } from './modules/users';
import { workspaceRouter } from './modules/workspace';
import { calendarRouter } from './modules/calendar';
import { inboxRouter } from './modules/inbox';
import { listRouter } from './modules/list';
import { cardRouter, commentRouter } from './modules/card';

const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/docs.json', (_req, res) => res.json(openApiDocument));
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: 'TaskFlow API Docs',
    explorer: true,
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: false,
      withCredentials: true,
    },
  }),
);

// Local Google client compatibility. The canonical callback remains under /api/auth.
app.get('/oauth/google', googleCallback);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/lists', listRouter);
app.use('/api/cards', cardRouter);
app.use('/api/comments', commentRouter);

export default app;
