import { z } from "zod";

const coverImageSchema = z
  .string()
  .refine(
    (val) =>
      val.startsWith("/") ||
      val.startsWith("http://") ||
      val.startsWith("https://") ||
      val.startsWith("data:image/"),
    { message: "Invalid cover image URL or path" }
  )
  .nullable()
  .optional();

export const createPostSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .trim()
    .min(1, "Title cannot be empty")
    .max(150, "Title must be at most 150 characters"),
  content: z.unknown().optional().default([]),
  coverImage: coverImageSchema,
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(30, "Tag must be at most 30 characters")
    )
    .max(5, "Maximum 5 tags allowed")
    .optional()
    .default([]),
});

export const updatePostSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty")
    .max(150, "Title must be at most 150 characters")
    .optional(),
  content: z.unknown().optional(),
  coverImage: coverImageSchema,
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(30, "Tag must be at most 30 characters")
    )
    .max(5, "Maximum 5 tags allowed")
    .optional(),
});

export const getPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type GetPostsQueryInput = z.infer<typeof getPostsQuerySchema>;

