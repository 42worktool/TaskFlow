import { NextFunction, Request, Response } from 'express';

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();

export function createSimpleRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.auth?.userId || req.ip || 'anonymous';
    const key = `${req.method}:${req.baseUrl}:${req.route?.path ?? req.path}:${principal}`;
    const now = Date.now();
    const current = counters.get(key);

    if (!current || current.resetAt <= now) {
      counters.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxRequests) {
      res.status(429).json({
        status_code: 429,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      });
      return;
    }

    current.count += 1;
    counters.set(key, current);
    next();
  };
}
