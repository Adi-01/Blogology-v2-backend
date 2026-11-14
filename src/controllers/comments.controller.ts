import type { Request, Response, NextFunction } from "express";
import { commentsService } from "@/services/comments.service.js";
import type {
  GetCommentsQueryInput,
  GetRepliesQueryInput,
} from "@/validators/interactions.validator.js";

export class CommentsController {
  async getPostComments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const postId = req.params.id as string;
      const query = req.query as unknown as GetCommentsQueryInput;
      const result = await commentsService.getPostComments(postId, query, req.user?.id);
      res.success("Comments retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async getCommentReplies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const commentId = req.params.id as string;
      const query = req.query as unknown as GetRepliesQueryInput;
      const result = await commentsService.getCommentReplies(commentId, query, req.user?.id);
      res.success("Replies retrieved successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async createComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const postId = req.params.id as string;
      const comment = await commentsService.createComment(req.user!.id, postId, req.body);
      res.success("Comment created successfully", comment, 201);
    } catch (error) {
      next(error);
    }
  }

  async updateComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const commentId = req.params.id as string;
      const comment = await commentsService.updateComment(req.user!.id, commentId, req.body);
      res.success("Comment updated successfully", comment, 200);
    } catch (error) {
      next(error);
    }
  }

  async deleteComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const commentId = req.params.id as string;
      const result = await commentsService.deleteComment(req.user!.id, commentId);
      res.success("Comment deleted successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async likeComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const commentId = req.params.id as string;
      const result = await commentsService.setCommentLike(req.user!.id, commentId, true);
      res.success("Comment liked successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async unlikeComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const commentId = req.params.id as string;
      const result = await commentsService.setCommentLike(req.user!.id, commentId, false);
      res.success("Comment unliked successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const commentsController = new CommentsController();
