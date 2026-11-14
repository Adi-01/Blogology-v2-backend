import type { Request, Response, NextFunction } from "express";
import { env } from "@/config/env.js";
import { COOKIE_NAMES, REDIS_TTL } from "@/lib/constants.js";
import { logger } from "@/lib/logger.js";
import { authService, type SessionMetadata } from "@/services/auth.service.js";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from "@/validators/auth.validator.js";

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: REDIS_TTL.SESSION_MS,
    path: "/",
  };
}

function extractMetadata(req: Request): SessionMetadata {
  return {
    userAgent: req.headers["user-agent"],
    ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
  };
}

function extractSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );

  return cookies[COOKIE_NAMES.sessionToken];
}

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as RegisterInput;
      const metadata = extractMetadata(req);

      const result = await authService.register(input, metadata);

      res.cookie(COOKIE_NAMES.sessionToken, result.sessionToken, getCookieOptions());

      res.success("Registration successful", result.user, 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as LoginInput;
      const metadata = extractMetadata(req);

      const result = await authService.login(input, metadata);

      res.cookie(COOKIE_NAMES.sessionToken, result.sessionToken, getCookieOptions());

      res.success("Login successful", result.user, 200);
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionToken = extractSessionToken(req);

      await authService.logout(sessionToken);

      res.clearCookie(COOKIE_NAMES.sessionToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      });

      res.success("Logged out successfully", null, 200);
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as ForgotPasswordInput;
      await authService.forgotPassword(email);
      res.success(
        "If an account with that email exists, a password reset link has been sent.",
        null,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body as ResetPasswordInput;
      await authService.resetPassword(token, password);
      res.success(
        "Password reset successfully. Please log in with your new password.",
        null,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body as ChangePasswordInput;
      await authService.changePassword(
        req.user!.id,
        currentPassword,
        newPassword,
        req.sessionTokenHash
      );
      res.success("Password changed successfully", null, 200);
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.success("Current user profile", req.user, 200);
    } catch (error) {
      next(error);
    }
  }

  async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessions = await authService.listSessions(
        req.user!.id,
        req.sessionTokenHash
      );

      res.success("Active sessions retrieved", sessions, 200);
    } catch (error) {
      next(error);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.params.sessionId as string;

      // If user revokes their own current session, clear their cookie
      if (sessionId === req.sessionId) {
        res.clearCookie(COOKIE_NAMES.sessionToken, {
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "lax" as const,
          path: "/",
        });
      }

      await authService.revokeSession(req.user!.id, sessionId);

      res.success("Session revoked successfully", null, 200);
    } catch (error) {
      next(error);
    }
  }

  googleRedirect(req: Request, res: Response): void {
    const state = req.query.state as string | undefined;
    const url = authService.getGoogleAuthUrl(state);
    res.redirect(url);
  }

  async googleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    const code = req.query.code as string | undefined;
    const error = req.query.error as string | undefined;

    if (error || !code) {
      logger.warn("Google OAuth callback error or cancellation", { error });
      return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_cancelled`);
    }

    try {
      const metadata = extractMetadata(req);
      const result = await authService.handleGoogleCallback(code, metadata);

      res.cookie(COOKIE_NAMES.sessionToken, result.sessionToken, getCookieOptions());

      return res.redirect(result.redirectTo);
    } catch (err) {
      logger.error("Google OAuth authentication failure", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
}

export const authController = new AuthController();
