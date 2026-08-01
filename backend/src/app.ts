import cookieParser from 'cookie-parser';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './docs/openapi';
import { authRouter, googleCallback } from './modules/auth';
import { errorHandler } from './errors';
import { protectedApiRouter } from './routes/protected-api.router';

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
app.use('/api', protectedApiRouter);
app.use(errorHandler);

export default app;
