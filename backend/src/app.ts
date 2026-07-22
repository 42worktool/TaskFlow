import cookieParser from 'cookie-parser';
import express from 'express';
import { authRouter, googleCallback } from './modules/auth';
import { usersRouter } from './modules/users';
import { workspaceRouter } from './modules/workspace';
import { calendarRouter } from './modules/calendar';
import { inboxRouter } from './modules/inbox';

const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Local Google client compatibility. The canonical callback remains under /api/auth.
app.get('/oauth/google', googleCallback);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/inbox', inboxRouter);

export default app;
