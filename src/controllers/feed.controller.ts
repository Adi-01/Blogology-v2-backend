import type { Request, Response, NextFunction } from "express";
import { feedService } from "@/services/feed.service.js";
import type { FeedQueryInput } from "@/validators/feed.validator.js";

export class FeedController {
  async getForYouFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const feed = await feedService.getForYouFeed(
        req.user!.id,
        req.query as unknown as FeedQueryInput
      );
      res.success("For-You feed retrieved successfully", feed, 200);
    } catch (error) {
      next(error);
    }
  }

  async getExploreFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const feed = await feedService.getExploreFeed(
        req.user?.id,
        req.query as unknown as FeedQueryInput
      );
      res.success("Explore feed retrieved successfully", feed, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const feedController = new FeedController();
