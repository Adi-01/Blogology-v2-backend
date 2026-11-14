import { z } from "zod";

export const aiStreamSchema = z.object({
  feature: z.enum(["compose", "rephrase", "summarise"], {
    required_error: "Feature is required ('compose', 'rephrase', or 'summarise')",
  }),
  context: z.string().default(""),
  prompt: z.string().optional(),
  tone: z.string().optional(),
  postId: z.string().optional(),
});

export type AiStreamInput = z.infer<typeof aiStreamSchema>;
