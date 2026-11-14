import { prisma } from "@/lib/prisma.js";
import { getStripeClient } from "@/lib/stripe.js";
import { env } from "@/config/env.js";
import { REDIS_KEYS } from "@/lib/constants.js";
import { deleteCache } from "@/lib/redis.js";
import { logger } from "@/lib/logger.js";
import { BadRequestError } from "@/errors/BadRequestError.js";
import { NotFoundError } from "@/errors/NotFoundError.js";
import type Stripe from "stripe";

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface PlanDto {
  id: string;
  name: "FREE" | "PRO";
  price: number;
  aiDailyLimit: number;
  features: PlanFeature[];
}

export class BillingService {
  async getPlans(): Promise<PlanDto[]> {
    const plans = await prisma.plan.findMany({
      orderBy: { price: "asc" },
    });

    return plans.map((plan) => {
      const isPro = plan.name === "PRO";
      return {
        id: plan.id,
        name: plan.name as "FREE" | "PRO",
        price: plan.price,
        aiDailyLimit: plan.aiDailyLimit,
        features: [
          { text: "Full reading & discovery feed access", included: true },
          { text: "Rich BlockNote blog editor & draft management", included: true },
          { text: `${plan.aiDailyLimit} daily AI requests (compose, rephrase, summarise)`, included: true },
          { text: "Likes, bookmarks, replies & author follows", included: true },
        ],
      };
    });
  }

  async createCheckoutSession(userId: string, planName: "PRO"): Promise<{ url: string }> {
    const stripe = getStripeClient();

    const user = await prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
      include: { plan: true },
    });

    if (!user) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    if (user.plan.name === planName) {
      throw new BadRequestError({
        code: "ALREADY_SUBSCRIBED",
        message: `You are already subscribed to the ${planName} plan.`,
      });
    }

    const proPlan = await prisma.plan.findUnique({
      where: { name: planName },
    });

    if (!proPlan) {
      throw new NotFoundError({
        code: "PLAN_NOT_FOUND",
        message: `${planName} plan not found in database.`,
      });
    }

    // Ensure Stripe Customer exists
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Blogology ${proPlan.name} Plan`,
              description: `Upgrade to Blogology ${proPlan.name} with ${proPlan.aiDailyLimit} daily AI requests.`,
            },
            unit_amount: proPlan.price,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        planName: proPlan.name,
      },
      success_url: `${env.FRONTEND_URL}/profile?billing_status=success`,
      cancel_url: `${env.FRONTEND_URL}/profile?billing_status=cancelled`,
    });

    if (!session.url) {
      throw new BadRequestError({
        code: "CHECKOUT_INITIATION_FAILED",
        message: "Failed to initiate Stripe Checkout session.",
      });
    }

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string): Promise<{ received: boolean }> {
    const stripe = getStripeClient();

    if (!env.STRIPE_WEBHOOK_SECRET) {
      logger.error("[Billing] Webhook received but STRIPE_WEBHOOK_SECRET is not configured.");
      throw new BadRequestError({
        code: "WEBHOOK_SECRET_NOT_CONFIGURED",
        message: "Webhook secret not configured.",
      });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      logger.error(`[Billing] Stripe webhook signature verification failed: ${err.message}`);
      throw new BadRequestError({
        code: "INVALID_WEBHOOK_SIGNATURE",
        message: `Webhook signature verification failed: ${err.message}`,
      });
    }

    logger.info(`[Billing] Processing Stripe webhook event: ${event.type} [${event.id}]`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutSessionCompleted(session);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionDeleted(subscription);
        break;
      }

      default:
        logger.info(`[Billing] Unhandled Stripe webhook event type: ${event.type}`);
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    const customerId = session.customer as string | null;
    const subscriptionId = session.subscription as string | null;

    if (!userId) {
      logger.warn(`[Billing] checkout.session.completed missing userId metadata. Customer: ${customerId}`);
      return;
    }

    const proPlan = await prisma.plan.findUnique({
      where: { name: "PRO" },
    });

    if (!proPlan) {
      logger.error("[Billing] PRO plan not found while handling checkout.session.completed.");
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        planId: proPlan.id,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      },
    });

    await this.invalidateUserSessions(userId);
    logger.info(`[Billing] Successfully upgraded user ${userId} to PRO plan.`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const subscriptionId = subscription.id;
    const customerId = subscription.customer as string | null;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId: subscriptionId },
          ...(customerId ? [{ stripeCustomerId: customerId }] : []),
        ],
      },
    });

    if (!user) {
      logger.warn(`[Billing] User not found for canceled subscription: ${subscriptionId}`);
      return;
    }

    const freePlan = await prisma.plan.findUnique({
      where: { name: "FREE" },
    });

    if (!freePlan) {
      logger.error("[Billing] FREE plan not found while handling subscription cancellation.");
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        planId: freePlan.id,
        stripeSubscriptionId: null,
      },
    });

    await this.invalidateUserSessions(user.id);
    logger.info(`[Billing] Downgraded user ${user.id} to FREE plan following subscription cancellation.`);
  }

  private async invalidateUserSessions(userId: string): Promise<void> {
    try {
      const sessions = await prisma.session.findMany({
        where: { userId },
        select: { tokenHash: true },
      });

      await Promise.all(
        sessions.map((s) => deleteCache(REDIS_KEYS.session(s.tokenHash)))
      );
    } catch (err: any) {
      logger.warn(`[Billing] Failed to invalidate sessions for user ${userId}: ${err.message}`);
    }
  }
}

export const billingService = new BillingService();
