declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
      };
      user?: {
        id: string;
      };
    }
  }
}

export {};
