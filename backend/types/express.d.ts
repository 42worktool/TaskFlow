import type { Request, Response, NextFunction, RequestHandler } from "express";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface ErrorResponse {
  status_code: number;
  error: string;
  message: string;
}

export interface AuthUser {
  id: string;
  role?: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export type { Request, Response, NextFunction, RequestHandler };
