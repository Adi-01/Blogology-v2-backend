import { z } from "zod";

export const uuidIdParamSchema = z.object({
  id: z.string().uuid("Invalid resource ID."),
});

export const bookmarksQuerySchema = z.object({
  cursor: z.string().uuid("Invalid cursor ID.").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const getCommentsQuerySchema = z.object({
  sort: z.enum(["top", "newest"]).default("top"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export const getRepliesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const createCommentSchema = z.object({
  body: z
    .string({ required_error: "Comment body is required." })
    .trim()
    .min(1, "Comment cannot be empty.")
    .max(2000, "Comment must be at most 2000 characters."),
  parentId: z.string().uuid("Invalid parent comment ID.").optional(),
});

export const updateCommentSchema = z.object({
  body: z
    .string({ required_error: "Comment body is required." })
    .trim()
    .min(1, "Comment cannot be empty.")
    .max(2000, "Comment must be at most 2000 characters."),
});

export type BookmarksQueryInput = z.infer<typeof bookmarksQuerySchema>;
export type GetCommentsQueryInput = z.infer<typeof getCommentsQuerySchema>;
export type GetRepliesQueryInput = z.infer<typeof getRepliesQuerySchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
