import type { Request, Response, NextFunction } from "express";
import { billingService } from "@/services/billing.service.js";
import type { CreateCheckoutSessionInput } from "@/validators/billing.validator.js";
import { BadRequestError } from "@/errors/BadRequestError.js";

export class BillingController {
  async getPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await billingService.getPlans();
      res.success("Plans fetched successfully", plans, 200);
    } catch (error) {
      next(error);
    }
  }

  async createCheckoutSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { planName } = req.body as CreateCheckoutSessionInput;

      const result = await billingService.createCheckoutSession(userId, planName);
      res.success("Checkout session created successfully", result, 200);
    } catch (error) {
      next(error);
    }
  }

  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers["stripe-signature"] as string | undefined;

      if (!signature) {
        throw new BadRequestError({
          code: "MISSING_STRIPE_SIGNATURE",
          message: "Missing stripe-signature header.",
        });
      }

      // rawBody is attached by express.json({ verify }) or express.raw
      const rawPayload = (req as any).rawBody || req.body;
      const result = await billingService.handleWebhook(rawPayload, signature);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const billingController = new BillingController();
