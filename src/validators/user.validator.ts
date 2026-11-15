import { z } from "zod";

export const userIdParamSchema = z.object({
  id: z.string().uuid("Invalid user ID."),
});

export const usernameParamSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username is required.")
    .max(50, "Username is too long."),
});

export const updateProfileBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty.")
    .max(100, "Name cannot exceed 100 characters.")
    .optional(),
  bio: z
    .string()
    .trim()
    .max(500, "Bio cannot exceed 500 characters.")
    .nullable()
    .optional(),
  avatar: z
    .string()
    .url("Invalid avatar image URL.")
    .nullable()
    .optional()
    .or(z.literal("")),
});

export const toggleFollowBodySchema = z
  .object({
    follow: z.boolean().optional(),
  })
  .optional();

export const toggleBlockBodySchema = z
  .object({
    block: z.boolean().optional(),
  })
  .optional();

export const saveInterestsBodySchema = z.object({
  tagIds: z
    .array(z.string().min(1, "Tag identifier cannot be empty."))
    .min(3, "Please select at least 3 interest tags."),
});

export const userPaginationQuerySchema = z.object({
  cursor: z.string().uuid("Invalid cursor ID.").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const userPostsQuerySchema = z.object({
  cursor: z.string().uuid("Invalid cursor ID.").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type UpdateProfileBodyInput = z.infer<typeof updateProfileBodySchema>;
export type ToggleFollowBodyInput = z.infer<typeof toggleFollowBodySchema>;
export type ToggleBlockBodyInput = z.infer<typeof toggleBlockBodySchema>;
export type SaveInterestsBodyInput = z.infer<typeof saveInterestsBodySchema>;
export type UserPaginationQueryInput = z.infer<typeof userPaginationQuerySchema>;
export type UserPostsQueryInput = z.infer<typeof userPostsQuerySchema>;
