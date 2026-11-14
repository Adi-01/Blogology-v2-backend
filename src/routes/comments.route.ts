import { Router } from "express";
import { commentsController } from "@/controllers/comments.controller.js";
import {
  authenticate,
  optionalAuthenticate,
} from "@/middleware/authenticate.middleware.js";
import {
  validateParams,
  validateQuery,
  validateRequest,
} from "@/middleware/validate.middleware.js";
import {
  getRepliesQuerySchema,
  updateCommentSchema,
  uuidIdParamSchema,
} from "@/validators/interactions.validator.js";

const router = Router();

router.get(
  "/:id/replies",
  optionalAuthenticate,
  validateParams(uuidIdParamSchema),
  validateQuery(getRepliesQuerySchema),
  (req, res, next) => commentsController.getCommentReplies(req, res, next)
);

router.patch(
  "/:id",
  authenticate,
  validateParams(uuidIdParamSchema),
  validateRequest(updateCommentSchema),
  (req, res, next) => commentsController.updateComment(req, res, next)
);

router.delete(
  "/:id",
  authenticate,
  validateParams(uuidIdParamSchema),
  (req, res, next) => commentsController.deleteComment(req, res, next)
);

router.post(
  "/:id/like",
  authenticate,
  validateParams(uuidIdParamSchema),
  (req, res, next) => commentsController.likeComment(req, res, next)
);

router.delete(
  "/:id/like",
  authenticate,
  validateParams(uuidIdParamSchema),
  (req, res, next) => commentsController.unlikeComment(req, res, next)
);

export default router;
