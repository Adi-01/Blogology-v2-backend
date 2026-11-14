export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  name: string;
  avatar: string | null;
  planId: string;
  hasOnboarded: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionTokenHash?: string;
      sessionId?: string;
    }

    interface Response {
      success: (message?: string, data?: unknown, status?: number) => Response;
    }
  }
}
