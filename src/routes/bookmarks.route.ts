import { Router } from "express";
import { interactionsController } from "@/controllers/interactions.controller.js";
import { authenticate } from "@/middleware/authenticate.middleware.js";
import { validateQuery } from "@/middleware/validate.middleware.js";
import { bookmarksQuerySchema } from "@/validators/interactions.validator.js";

const router = Router();

router.get("/", authenticate, validateQuery(bookmarksQuerySchema), (req, res, next) =>
  interactionsController.getBookmarks(req, res, next)
);

export default router;
