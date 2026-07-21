import { prisma } from "../../db/prisma";
import type { AuthUser } from "../../../types/express";
import type { Request, Response, NextFunction } from "express";

// DEV-ONLY auth shim. Replaces Phase 0.4 stub.
// When the auth module ships JWT middleware, delete this middleware from app.ts
// and load the real one before the protected routers. All services read req.user,
// so no service/controller code changes.
export function devAuth(req: Request, _res: Response, next: NextFunction): void {
  const headerUserId = req.headers["x-dev-user"];
  if (typeof headerUserId === "string" && headerUserId.length > 0) {
    req.user = { id: headerUserId } as AuthUser;
    next();
    return;
  }
  // No user -> leave req.user undefined; downstream guard throws 401 as needed.
  next();
}

// Resolves a header-supplied email to a real seeded user id (convenience for curl).
// Usage: x-dev-user: dev-owner@example.com  -> resolves to that user's id.
// Fallback: if the value is already a UUID, pass it through.
export async function devAuthByEmail(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const raw = req.headers["x-dev-user"];
  if (typeof raw !== "string" || raw.length === 0) {
    next();
    return;
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) {
    req.user = { id: raw } as AuthUser;
    next();
    return;
  }
  const user = await prisma.user.findUnique({
    where: { email: raw },
    select: { id: true },
  });
  if (!user) {
    req.user = undefined;
    next();
    return;
  }
  req.user = { id: user.id } as AuthUser;
  next();
}
