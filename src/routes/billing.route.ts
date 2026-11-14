import { Router } from "express";
import { billingController } from "@/controllers/billing.controller.js";
import { authenticate } from "@/middleware/authenticate.middleware.js";
import { validateRequest } from "@/middleware/validate.middleware.js";
import { createCheckoutSessionSchema } from "@/validators/billing.validator.js";

const router = Router();

// 1. Get available plans
router.get("/plans", (req, res, next) =>
  billingController.getPlans(req, res, next)
);

// 2. Create Stripe Checkout Session (upgrade)
router.post(
  "/checkout-session",
  authenticate,
  validateRequest(createCheckoutSessionSchema),
  (req, res, next) => billingController.createCheckoutSession(req, res, next)
);

// 3. Webhook listener from Stripe
router.post("/webhook", (req, res, next) =>
  billingController.handleWebhook(req, res, next)
);

export default router;
