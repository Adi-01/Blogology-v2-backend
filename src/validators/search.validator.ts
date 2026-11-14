import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().max(100, "Search query is too long").optional(),
  cursor: z.string().uuid("Invalid cursor ID").optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
