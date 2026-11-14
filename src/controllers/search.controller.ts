import type { Request, Response, NextFunction } from "express";
import { searchService } from "@/services/search.service.js";
import type { SearchQueryInput } from "@/validators/search.validator.js";

export class SearchController {
  async searchPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, cursor, limit } = req.query as unknown as SearchQueryInput;
      const result = await searchService.searchPosts(q ?? "", {
        cursor,
        limit,
        requesterId: req.user?.id,
      });
      res.success("Posts search completed", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, cursor, limit } = req.query as unknown as SearchQueryInput;
      const result = await searchService.searchUsers(q ?? "", {
        cursor,
        limit,
        requesterId: req.user?.id,
      });
      res.success("Users search completed", result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const searchController = new SearchController();
