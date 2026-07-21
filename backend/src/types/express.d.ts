import 'express'

// Add a `user` field to Express Request.
// Once the real auth middleware populates req.user with a richer object,
// extend this interface accordingly (id, name, email, ...).
declare module 'express' {
  interface Request {
    user?: { id: string }
  }
}
