import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
  planName: z.enum(["PRO"], {
    message: "Only PRO plan upgrades are available via checkout.",
  }),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
