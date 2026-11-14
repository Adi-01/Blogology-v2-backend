import { Router } from "express";
import { aiController } from "@/controllers/ai.controller.js";
import { authenticate } from "@/middleware/authenticate.middleware.js";
import { validateRequest } from "@/middleware/validate.middleware.js";
import { aiStreamSchema } from "@/validators/ai.validator.js";

const router = Router();

// POST /api/v1/ai/stream - SSE streaming endpoint for AI assistance
router.post(
  "/stream",
  authenticate,
  validateRequest(aiStreamSchema),
  (req, res, next) => aiController.stream(req, res, next)
);

export default router;
