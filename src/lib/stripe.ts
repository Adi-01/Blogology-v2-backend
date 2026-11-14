import Stripe from "stripe";
import { env } from "@/config/env.js";

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : null;

export function getStripeClient(): Stripe {
  if (!stripe) {
    throw new Error("Stripe is not configured. Missing STRIPE_SECRET_KEY.");
  }
  return stripe;
}
