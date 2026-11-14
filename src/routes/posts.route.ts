import { Router } from "express";
import { postsController } from "@/controllers/posts.controller.js";
import { interactionsController } from "@/controllers/interactions.controller.js";
import { commentsController } from "@/controllers/comments.controller.js";
import {
  authenticate,
  optionalAuthenticate,
} from "@/middleware/authenticate.middleware.js";
import {
  validateParams,
  validateRequest,
  validateQuery,
} from "@/middleware/validate.middleware.js";
import {
  createPostSchema,
  updatePostSchema,
  getPostsQuerySchema,
} from "@/validators/posts.validator.js";
import {
  createCommentSchema,
  getCommentsQuerySchema,
  uuidIdParamSchema,
} from "@/validators/interactions.validator.js";

const router = Router();

// 1. Author's own posts (MUST precede `/:id` route)
router.get("/mine", authenticate, validateQuery(getPostsQuerySchema), (req, res, next) =>
  postsController.getOwnPosts(req, res, next)
);

// 2. Create new draft
router.post("/", authenticate, validateRequest(createPostSchema), (req, res, next) =>
  postsController.createDraft(req, res, next)
);

// 3. Single post view (Public for PUBLISHED; author-only for DRAFT)
router.get("/:id", optionalAuthenticate, (req, res, next) =>
  postsController.getPostById(req, res, next)
);

// 4. Update post / draft
router.patch("/:id", authenticate, validateRequest(updatePostSchema), (req, res, next) =>
  postsController.updatePost(req, res, next)
);

// 5. Publish post
router.post("/:id/publish", authenticate, (req, res, next) =>
  postsController.publishPost(req, res, next)
);

// 6. Unpublish post
router.post("/:id/unpublish", authenticate, (req, res, next) =>
  postsController.unpublishPost(req, res, next)
);

// 7. Increment view count (fire-and-forget public endpoint, author views excluded)
router.post("/:id/view", optionalAuthenticate, (req, res, next) =>
  postsController.incrementViewCount(req, res, next)
);

// 8. Likes & Bookmarks
router.post("/:id/like", authenticate, validateParams(uuidIdParamSchema), (req, res, next) =>
  interactionsController.likePost(req, res, next)
);
router.delete("/:id/like", authenticate, validateParams(uuidIdParamSchema), (req, res, next) =>
  interactionsController.unlikePost(req, res, next)
);
router.post("/:id/bookmark", authenticate, validateParams(uuidIdParamSchema), (req, res, next) =>
  interactionsController.bookmarkPost(req, res, next)
);
router.delete("/:id/bookmark", authenticate, validateParams(uuidIdParamSchema), (req, res, next) =>
  interactionsController.unbookmarkPost(req, res, next)
);

// 9. Post comments (YouTube-style root comments + replies)
router.get(
  "/:id/comments",
  optionalAuthenticate,
  validateParams(uuidIdParamSchema),
  validateQuery(getCommentsQuerySchema),
  (req, res, next) => commentsController.getPostComments(req, res, next)
);
router.post(
  "/:id/comments",
  authenticate,
  validateParams(uuidIdParamSchema),
  validateRequest(createCommentSchema),
  (req, res, next) => commentsController.createComment(req, res, next)
);

// 10. Soft delete post
router.delete("/:id", authenticate, (req, res, next) =>
  postsController.deletePost(req, res, next)
);

export default router;

