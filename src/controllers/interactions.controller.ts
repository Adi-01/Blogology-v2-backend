import type { Request, Response, NextFunction } from "express";
import { interactionsService } from "@/services/interactions.service.js";
import type { BookmarksQueryInput } from "@/validators/interactions.validator.js";

export class InteractionsController {
  async likePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await interactionsService.setPostLike(req.user!.id, id, true);
      res.success("Post liked successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async unlikePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await interactionsService.setPostLike(req.user!.id, id, false);
      res.success("Post unliked successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async bookmarkPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await interactionsService.setPostBookmark(req.user!.id, id, true);
      res.success("Post bookmarked successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async unbookmarkPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await interactionsService.setPostBookmark(req.user!.id, id, false);
      res.success("Bookmark removed successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getBookmarks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as BookmarksQueryInput;
      const result = await interactionsService.getBookmarkedPosts(req.user!.id, query);
      res.success("Bookmarks retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const interactionsController = new InteractionsController();
