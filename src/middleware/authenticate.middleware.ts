import type { Request, Response, NextFunction } from "express";
import { authService } from "@/services/auth.service.js";
import { UnauthorizedError } from "@/errors/UnauthorizedError.js";
import { COOKIE_NAMES } from "@/lib/constants.js";

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

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

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = extractToken(req);

    if (!rawToken) {
      throw new UnauthorizedError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const session = await authService.validateSession(rawToken);

    if (!session) {
      res.clearCookie(COOKIE_NAMES.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });

      throw new UnauthorizedError({
        code: "UNAUTHORIZED",
        message: "Session expired or invalid. Please log in again.",
      });
    }

    req.user = session.user;
    req.sessionId = session.sessionId;
    req.sessionTokenHash = session.tokenHash;

    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = extractToken(req);
    if (rawToken) {
      const session = await authService.validateSession(rawToken);
      if (session) {
        req.user = session.user;
        req.sessionId = session.sessionId;
        req.sessionTokenHash = session.tokenHash;
      }
    }
    next();
  } catch {
    next();
  }
}

