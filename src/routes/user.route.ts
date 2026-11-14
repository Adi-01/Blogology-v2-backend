import { Router } from "express";
import { userController } from "@/controllers/user.controller.js";
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
  userIdParamSchema,
  usernameParamSchema,
  updateProfileBodySchema,
  toggleFollowBodySchema,
  toggleBlockBodySchema,
  saveInterestsBodySchema,
  userPaginationQuerySchema,
  userPostsQuerySchema,
} from "@/validators/user.validator.js";

const router = Router();

// ==========================================
// 1. Static User & Preference Routes
// ==========================================

// Personal Profile Update (Task 29)
router.patch(
  "/me",
  authenticate,
  validateRequest(updateProfileBodySchema),
  (req, res, next) => userController.updateProfile(req, res, next)
);

// Account deletion
router.delete("/me", authenticate, (req, res, next) =>
  userController.deleteMe(req, res, next)
);

// Tags & Interests (Task 30 Onboarding)
router.get("/tags", optionalAuthenticate, (req, res, next) =>
  userController.getAllTags(req, res, next)
);

router.get("/me/interests", authenticate, (req, res, next) =>
  userController.getUserInterests(req, res, next)
);

router.post(
  "/me/interests",
  authenticate,
  validateRequest(saveInterestsBodySchema),
  (req, res, next) => userController.saveUserInterests(req, res, next)
);

// Blocked users list
router.get("/blocked", authenticate, (req, res, next) =>
  userController.getBlockedUsers(req, res, next)
);

// ==========================================
// 2. UUID User Relations (Follow & Block)
// ==========================================

router.post(
  "/:id/follow",
  authenticate,
  validateParams(userIdParamSchema),
  validateRequest(toggleFollowBodySchema),
  (req, res, next) => userController.toggleFollow(req, res, next)
);

router.delete(
  "/:id/follow",
  authenticate,
  validateParams(userIdParamSchema),
  (req, res, next) => userController.unfollow(req, res, next)
);

router.get(
  "/:id/followers",
  optionalAuthenticate,
  validateParams(userIdParamSchema),
  validateQuery(userPaginationQuerySchema),
  (req, res, next) => userController.getFollowers(req, res, next)
);

router.get(
  "/:id/following",
  optionalAuthenticate,
  validateParams(userIdParamSchema),
  validateQuery(userPaginationQuerySchema),
  (req, res, next) => userController.getFollowing(req, res, next)
);

router.get(
  "/:id/relationship",
  authenticate,
  validateParams(userIdParamSchema),
  (req, res, next) => userController.getRelationship(req, res, next)
);

router.post(
  "/:id/block",
  authenticate,
  validateParams(userIdParamSchema),
  validateRequest(toggleBlockBodySchema),
  (req, res, next) => userController.toggleBlock(req, res, next)
);

router.delete(
  "/:id/block",
  authenticate,
  validateParams(userIdParamSchema),
  (req, res, next) => userController.unblock(req, res, next)
);

// ==========================================
// 3. Username Public Profile & Posts (Task 27)
// ==========================================

router.get(
  "/:username",
  optionalAuthenticate,
  validateParams(usernameParamSchema),
  (req, res, next) => userController.getUserProfileByUsername(req, res, next)
);

router.get(
  "/:username/posts",
  optionalAuthenticate,
  validateParams(usernameParamSchema),
  validateQuery(userPostsQuerySchema),
  (req, res, next) => userController.getUserPostsByUsername(req, res, next)
);

export default router;
