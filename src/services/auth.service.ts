import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma.js";
import { getCache, setCache, deleteCache } from "@/lib/redis.js";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/constants.js";
import { env } from "@/config/env.js";
import { sendPasswordResetEmail } from "@/lib/mailer.js";
import { ConflictError } from "@/errors/ConflictError.js";
import { UnauthorizedError } from "@/errors/UnauthorizedError.js";
import { NotFoundError } from "@/errors/NotFoundError.js";
import { ForbiddenError } from "@/errors/ForbiddenError.js";
import { BadRequestError } from "@/errors/BadRequestError.js";
import type { RegisterInput, LoginInput } from "@/validators/auth.validator.js";
import type { AuthenticatedUser } from "@/types/express.js";

export interface SessionMetadata {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface AuthResult {
  user: AuthenticatedUser;
  sessionToken: string;
}

export interface CachedSession {
  sessionId: string;
  user: AuthenticatedUser;
  expiresAt: string;
}

export interface SessionView {
  id: string;
  deviceLabel: string | null;
  ipHint: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

function getDefaultAvatar(name: string): string {
  const seed = encodeURIComponent(name.trim() || "User");
  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}`;
}

export class AuthService {
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private parseIpHint(ip?: string): string | null {
    if (!ip) return null;
    const ipv4Parts = ip.split(".");
    if (ipv4Parts.length === 4) {
      return `${ipv4Parts[0]}.${ipv4Parts[1]}.${ipv4Parts[2]}.x`;
    }
    return "remote-device";
  }

  private parseDeviceLabel(userAgent?: string): string {
    if (!userAgent) return "Unknown Device";
    if (userAgent.includes("Mobile") || userAgent.includes("Android") || userAgent.includes("iPhone")) {
      return "Mobile Browser";
    }
    if (userAgent.includes("Macintosh") || userAgent.includes("Mac OS")) {
      return "Desktop (macOS)";
    }
    if (userAgent.includes("Windows")) {
      return "Desktop (Windows)";
    }
    if (userAgent.includes("Linux")) {
      return "Desktop (Linux)";
    }
    return "Desktop Browser";
  }

  private async createSessionRecord(
    user: AuthenticatedUser,
    metadata?: SessionMetadata
  ): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REDIS_TTL.SESSION_MS);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceLabel: this.parseDeviceLabel(metadata?.userAgent),
        ipHint: this.parseIpHint(metadata?.ip),
        expiresAt,
      },
    });

    // Populate Redis cache immediately for sub-millisecond future requests
    const cacheData: CachedSession = {
      sessionId: session.id,
      user,
      expiresAt: expiresAt.toISOString(),
    };

    await setCache(REDIS_KEYS.session(tokenHash), cacheData, REDIS_TTL.SESSION_SECONDS, 0.05);

    return rawToken;
  }

  async register(input: RegisterInput, metadata?: SessionMetadata): Promise<AuthResult> {
    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, isDeleted: true },
    });

    if (existingEmail) {
      if (existingEmail.isDeleted) {
        // Old account was deleted: purge it completely (cascading all posts/interactions)
        // so the user starts fresh with a new registration and onboarding flow
        await prisma.user.delete({ where: { id: existingEmail.id } });
      } else {
        throw new ConflictError({
          code: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email already exists.",
        });
      }
    }

    let username = input.username;
    if (!username) {
      const emailPrefix = input.email.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "") || "user";
      username = `${emailPrefix}_${crypto.randomBytes(3).toString("hex")}`.toLowerCase();
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existingUsername) {
      throw new ConflictError({
        code: "USERNAME_TAKEN",
        message: "This username is already taken. Please choose another.",
      });
    }

    const freePlan = await prisma.plan.findUnique({
      where: { name: "FREE" },
      select: { id: true },
    });

    if (!freePlan) {
      throw new Error("Default FREE plan not found in database.");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        username,
        name: input.name,
        avatar: getDefaultAvatar(input.name),
        passwordHash,
        planId: freePlan.id,
        hasOnboarded: false,
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        avatar: true,
        planId: true,
        hasOnboarded: true,
      },
    });

    const sessionToken = await this.createSessionRecord(user, metadata);

    return {
      user,
      sessionToken,
    };
  }

  async login(input: LoginInput, metadata?: SessionMetadata): Promise<AuthResult> {
    const user = await prisma.user.findFirst({
      where: {
        email: input.email,
        isDeleted: false,
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        avatar: true,
        passwordHash: true,
        planId: true,
        hasOnboarded: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      });
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      });
    }

    let userAvatar = user.avatar;
    if (!userAvatar || userAvatar.includes("googleusercontent.com")) {
      userAvatar = getDefaultAvatar(user.name);
      await prisma.user.update({
        where: { id: user.id },
        data: { avatar: userAvatar },
      });
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      avatar: userAvatar,
      planId: user.planId,
      hasOnboarded: user.hasOnboarded,
    };

    const sessionToken = await this.createSessionRecord(authenticatedUser, metadata);

    return {
      user: authenticatedUser,
      sessionToken,
    };
  }

  async validateSession(
    rawToken: string
  ): Promise<{ user: AuthenticatedUser; sessionId: string; tokenHash: string } | null> {
    const tokenHash = this.hashToken(rawToken);

    // 1. Try Redis cache first (sub-millisecond)
    const cached = await getCache<CachedSession>(REDIS_KEYS.session(tokenHash));
    if (cached && new Date(cached.expiresAt) > new Date()) {
      return {
        user: cached.user,
        sessionId: cached.sessionId,
        tokenHash,
      };
    }

    // 2. Cache miss: Query PostgreSQL
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            avatar: true,
            planId: true,
            hasOnboarded: true,
            isDeleted: true,
          },
        },
      },
    });

    if (!session || session.user.isDeleted || session.expiresAt <= new Date()) {
      if (session && session.expiresAt <= new Date()) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      }
      return null;
    }

    const user: AuthenticatedUser = {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      name: session.user.name,
      avatar: session.user.avatar,
      planId: session.user.planId,
      hasOnboarded: session.user.hasOnboarded,
    };

    // Populate Redis for subsequent requests with TTL
    const remainingSeconds = Math.max(
      1,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
    );
    const cacheData: CachedSession = {
      sessionId: session.id,
      user,
      expiresAt: session.expiresAt.toISOString(),
    };

    await setCache(REDIS_KEYS.session(tokenHash), cacheData, remainingSeconds, 0.05);

    return {
      user,
      sessionId: session.id,
      tokenHash,
    };
  }

  async listSessions(userId: string, currentTokenHash?: string): Promise<SessionView[]> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        deviceLabel: true,
        ipHint: true,
        createdAt: true,
        tokenHash: true,
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      ipHint: s.ipHint,
      createdAt: s.createdAt,
      isCurrent: s.tokenHash === currentTokenHash,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, tokenHash: true },
    });

    if (!session) {
      throw new NotFoundError({
        code: "SESSION_NOT_FOUND",
        message: "The requested session does not exist.",
      });
    }

    if (session.userId !== userId) {
      throw new ForbiddenError({
        code: "FORBIDDEN",
        message: "You are not authorized to revoke this session.",
      });
    }

    // Purge from Redis
    await deleteCache(REDIS_KEYS.session(session.tokenHash));

    // Delete from PostgreSQL
    await prisma.session.delete({
      where: { id: sessionId },
    });
  }

  async logout(sessionToken?: string): Promise<void> {
    if (!sessionToken) return;
    const tokenHash = this.hashToken(sessionToken);

    // Purge from Redis
    await deleteCache(REDIS_KEYS.session(tokenHash));

    // Delete from PostgreSQL
    await prisma.session.deleteMany({
      where: {
        tokenHash,
      },
    });
  }

  getGoogleAuthUrl(state?: string): string {
    const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const options = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      ...(state ? { state } : {}),
    });

    return `${rootUrl}?${options.toString()}`;
  }

  async handleGoogleCallback(
    code: string,
    metadata?: SessionMetadata
  ): Promise<{ user: AuthenticatedUser; sessionToken: string; redirectTo: string }> {
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const tokenParams = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text();
      console.error("Failed to exchange code with Google:", errorBody);
      throw new BadRequestError({
        code: "GOOGLE_OAUTH_FAILED",
        message: "Failed to authenticate with Google.",
      });
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new BadRequestError({
        code: "GOOGLE_OAUTH_FAILED",
        message: "Failed to retrieve user profile from Google.",
      });
    }

    const googleUser = (await userRes.json()) as {
      sub: string;
      name?: string;
      picture?: string;
      email: string;
      email_verified?: boolean;
    };

    if (!googleUser.email || googleUser.email_verified === false) {
      throw new BadRequestError({
        code: "GOOGLE_OAUTH_FAILED",
        message: "Google account does not have a verified email address.",
      });
    }

    const normalizedEmail = googleUser.email.toLowerCase();

    // Check if account already exists with this email
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        avatar: true,
        planId: true,
        hasOnboarded: true,
        isDeleted: true,
      },
    });

    if (user && user.isDeleted) {
      // Old account was deleted: purge it completely (cascading all posts/interactions)
      // so the user gets a clean slate and is treated as a first-time Google sign up
      await prisma.user.delete({ where: { id: user.id } });
      user = null;
    }

    if (user) {
      // If avatar was not set or using broken Google CDN, populate with DiceBear initials
      const isBrokenGoogleAvatar = user.avatar?.includes("googleusercontent.com");
      if (!user.avatar || isBrokenGoogleAvatar) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatar: getDefaultAvatar(user.name || googleUser.name || user.username) },
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            avatar: true,
            planId: true,
            hasOnboarded: true,
            isDeleted: true,
          },
        });
      }
    } else {
      // First-time Google sign up
      const freePlan = await prisma.plan.findUnique({
        where: { name: "FREE" },
        select: { id: true },
      });

      if (!freePlan) {
        throw new Error("Default FREE plan not found in database.");
      }

      const emailPrefix = normalizedEmail
        .split("@")[0]
        ?.replace(/[^a-zA-Z0-9_]/g, "") || "user";

      let username = emailPrefix;
      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername) {
        username = `${emailPrefix}_${crypto.randomBytes(3).toString("hex")}`;
      }

      const displayName = googleUser.name || username;

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          username,
          name: displayName,
          avatar: getDefaultAvatar(displayName),
          passwordHash: null, // Nullable for OAuth-only users
          planId: freePlan.id,
          hasOnboarded: false,
        },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          avatar: true,
          planId: true,
          hasOnboarded: true,
          isDeleted: true,
        },
      });
    }

    let userAvatar = user.avatar;
    if (!userAvatar || userAvatar.includes("googleusercontent.com")) {
      userAvatar = getDefaultAvatar(user.name);
      await prisma.user.update({
        where: { id: user.id },
        data: { avatar: userAvatar },
      });
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      avatar: userAvatar,
      planId: user.planId,
      hasOnboarded: user.hasOnboarded,
    };

    const sessionToken = await this.createSessionRecord(authenticatedUser, metadata);

    const redirectTo = !user.hasOnboarded
      ? `${env.FRONTEND_URL}/onboarding`
      : `${env.FRONTEND_URL}/for-you-page`;

    return {
      user: authenticatedUser,
      sessionToken,
      redirectTo,
    };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { email, isDeleted: false },
      select: { id: true, email: true, name: true },
    });

    // Unknown email returns 200 without user enumeration
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing unused reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, user.name, resetUrl);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            isDeleted: true,
          },
        },
      },
    });

    if (
      !resetRecord ||
      resetRecord.usedAt !== null ||
      resetRecord.expiresAt <= new Date() ||
      resetRecord.user.isDeleted
    ) {
      throw new BadRequestError({
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "Password reset link is invalid or has expired.",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Atomically mark token as used and update user's password
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
    ]);

    // Invalidate all active sessions for this user
    const sessions = await prisma.session.findMany({
      where: { userId: resetRecord.userId },
      select: { tokenHash: true },
    });

    await Promise.all(
      sessions.map((s) => deleteCache(REDIS_KEYS.session(s.tokenHash)))
    );

    await prisma.session.deleteMany({
      where: { userId: resetRecord.userId },
    });
  }

  async changePassword(
    userId: string,
    currentPasswordInput: string,
    newPasswordInput: string,
    currentSessionTokenHash?: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    // If OAuth-only user has no passwordHash, require forgot password flow or allow initial set
    if (!user.passwordHash) {
      throw new BadRequestError({
        code: "NO_PASSWORD_SET",
        message: "Your account does not have a password set. Please use the Forgot Password flow to set one.",
      });
    }

    const isMatch = await bcrypt.compare(currentPasswordInput, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError({
        code: "INVALID_CURRENT_PASSWORD",
        message: "The current password you entered is incorrect.",
      });
    }

    if (currentPasswordInput === newPasswordInput) {
      throw new BadRequestError({
        code: "PASSWORD_SAME_AS_CURRENT",
        message: "Your new password must be different from your current password.",
      });
    }

    const passwordHash = await bcrypt.hash(newPasswordInput, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate all OTHER active sessions for this user (keep current session active)
    const otherSessions = await prisma.session.findMany({
      where: {
        userId,
        ...(currentSessionTokenHash ? { tokenHash: { not: currentSessionTokenHash } } : {}),
      },
      select: { tokenHash: true },
    });

    await Promise.all(
      otherSessions.map((s) => deleteCache(REDIS_KEYS.session(s.tokenHash)))
    );

    await prisma.session.deleteMany({
      where: {
        userId,
        ...(currentSessionTokenHash ? { tokenHash: { not: currentSessionTokenHash } } : {}),
      },
    });
  }
}

export const authService = new AuthService();
