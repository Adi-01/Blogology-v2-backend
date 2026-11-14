import type { Request, Response, NextFunction } from "express";
import { postsService } from "@/services/posts.service.js";

export class PostsController {
  async createDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const post = await postsService.createDraft(req.user!.id, req.body);
      res.success("Draft created successfully", post, 201);
    } catch (error) {
      next(error);
    }
  }

  async updatePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const post = await postsService.updatePost(req.user!.id, id, req.body);
      res.success("Post updated successfully", post, 200);
    } catch (error) {
      next(error);
    }
  }

  async publishPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const post = await postsService.publishPost(req.user!.id, id);
      res.success("Post published successfully", post, 200);
    } catch (error) {
      next(error);
    }
  }

  async unpublishPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const post = await postsService.unpublishPost(req.user!.id, id);
      res.success("Post unpublished successfully", post, 200);
    } catch (error) {
      next(error);
    }
  }

  async deletePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      await postsService.deletePost(req.user!.id, id);
      res.success("Post deleted successfully", null, 200);
    } catch (error) {
      next(error);
    }
  }

  async getOwnPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await postsService.getOwnPosts(req.user!.id, req.query as any);
      res.success("Posts retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getPostById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const post = await postsService.getPostById(id, req.user?.id);
      res.success("Post retrieved successfully", post, 200);
    } catch (error) {
      next(error);
    }
  }

  async incrementViewCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await postsService.incrementViewCount(id, req.user?.id);
      res.success("View count incremented successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const postsController = new PostsController();
