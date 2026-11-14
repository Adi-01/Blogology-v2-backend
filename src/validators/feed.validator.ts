import { z } from "zod";

export const feedQuerySchema = z.object({
  cursor: z.string().uuid("Invalid cursor post ID").optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export type FeedQueryInput = z.infer<typeof feedQuerySchema>;
