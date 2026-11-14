import { Router } from "express";
import { feedController } from "@/controllers/feed.controller.js";
import { authenticate, optionalAuthenticate } from "@/middleware/authenticate.middleware.js";
import { validateQuery } from "@/middleware/validate.middleware.js";
import { feedQuerySchema } from "@/validators/feed.validator.js";

const router = Router();

router.get("/for-you", authenticate, validateQuery(feedQuerySchema), (req, res, next) =>
  feedController.getForYouFeed(req, res, next)
);

router.get("/explore", optionalAuthenticate, validateQuery(feedQuerySchema), (req, res, next) =>
  feedController.getExploreFeed(req, res, next)
);

export default router;
