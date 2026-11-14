import type { Request, Response, NextFunction } from "express";
import { userService } from "@/services/user.service.js";
import { COOKIE_NAMES } from "@/lib/constants.js";
import { env } from "@/config/env.js";
import type {
  UpdateProfileBodyInput,
  ToggleFollowBodyInput,
  ToggleBlockBodyInput,
  SaveInterestsBodyInput,
  UserPaginationQueryInput,
  UserPostsQueryInput,
} from "@/validators/user.validator.js";

export class UserController {
  async deleteMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.deleteAccount(req.user!.id);

      // Clear session cookie
      res.clearCookie(COOKIE_NAMES.sessionToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      });

      res.success("Account deleted successfully", null, 200);
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body = req.body as UpdateProfileBodyInput;
      const updated = await userService.updateProfile(req.user!.id, body);
      res.success("Profile updated successfully", updated, 200);
    } catch (error) {
      next(error);
    }
  }

  async getUserProfileByUsername(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const username = req.params.username as string;
      const profile = await userService.getUserProfileByUsername(
        username,
        req.user?.id
      );
      res.success("Author profile retrieved successfully", profile, 200);
    } catch (error) {
      next(error);
    }
  }

  async getUserPostsByUsername(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const username = req.params.username as string;
      const query = req.query as unknown as UserPostsQueryInput;
      const result = await userService.getUserPostsByUsername(
        username,
        query,
        req.user?.id
      );
      res.success("Author posts retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getAllTags(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tags = await userService.getAllTags();
      res.success("Tags retrieved successfully", tags, 200);
    } catch (error) {
      next(error);
    }
  }

  async getUserInterests(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const interests = await userService.getUserInterests(req.user!.id);
      res.success("User interests retrieved successfully", interests, 200);
    } catch (error) {
      next(error);
    }
  }

  async saveUserInterests(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body = req.body as SaveInterestsBodyInput;
      const result = await userService.saveUserInterests(
        req.user!.id,
        body.tagIds
      );
      res.success("Interests saved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async toggleFollow(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const body = req.body as ToggleFollowBodyInput;
      const result = await userService.toggleFollow(
        req.user!.id,
        id,
        body?.follow
      );
      res.success(
        result.isFollowing
          ? "User followed successfully"
          : "User unfollowed successfully",
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  async unfollow(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await userService.toggleFollow(req.user!.id, id, false);
      res.success("User unfollowed successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getFollowers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const query = req.query as unknown as UserPaginationQueryInput;
      const result = await userService.getFollowers(id, query, req.user?.id);
      res.success("Followers retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getFollowing(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const query = req.query as unknown as UserPaginationQueryInput;
      const result = await userService.getFollowing(id, query, req.user?.id);
      res.success("Following retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getRelationship(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await userService.getRelationship(req.user!.id, id);
      res.success("Relationship status retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async toggleBlock(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const body = req.body as ToggleBlockBodyInput;
      const result = await userService.toggleBlock(
        req.user!.id,
        id,
        body?.block
      );
      res.success(
        result.isBlocked
          ? "User blocked successfully"
          : "User unblocked successfully",
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  async unblock(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await userService.toggleBlock(req.user!.id, id, false);
      res.success("User unblocked successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getBlockedUsers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await userService.getBlockedUsers(req.user!.id);
      res.success("Blocked users retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
