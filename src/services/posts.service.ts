import { prisma } from "@/lib/prisma.js";
import type { Prisma, PostStatus, Tag } from "@/generated/prisma/client.js";
import { hasBlockBetween, visibleUserWhere } from "@/lib/block.js";
import { NotFoundError } from "@/errors/NotFoundError.js";
import { ForbiddenError } from "@/errors/ForbiddenError.js";
import { BadRequestError } from "@/errors/BadRequestError.js";
import type {
  CreatePostInput,
  UpdatePostInput,
  GetPostsQueryInput,
} from "@/validators/posts.validator.js";

export function getPostInclude(viewerId?: string) {
  const userFilter = visibleUserWhere(viewerId);
  return {
    author: {
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        bio: true,
        ...(viewerId
          ? {
              followers: {
                where: { followerId: viewerId },
                select: { followerId: true },
              },
            }
          : {}),
      },
    },
    tags: {
      include: {
        tag: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    _count: {
      select: {
        likes: {
          where: {
            user: userFilter,
          },
        },
        bookmarks: {
          where: {
            user: userFilter,
          },
        },
        comments: {
          where: {
            isDeleted: false,
            author: userFilter,
          },
        },
      },
    },
    ...(viewerId
      ? {
          likes: {
            where: { userId: viewerId },
            select: { userId: true },
          },
          bookmarks: {
            where: { userId: viewerId },
            select: { userId: true },
          },
        }
      : {}),
  } satisfies Prisma.PostInclude;
}

export function extractTextFromContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(extractTextFromContent).join(" ");
  }
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    const texts: string[] = [];
    if (typeof obj.text === "string") {
      texts.push(obj.text);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "text" && value && typeof value === "object") {
        texts.push(extractTextFromContent(value));
      }
    }
    return texts.join(" ");
  }
  return "";
}

export function calculateReadingTime(content: unknown): number {
  const text = extractTextFromContent(content).trim();
  if (!text) return 1;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

async function syncPostTags(
  tx: Prisma.TransactionClient,
  postId: string,
  tagNames: string[]
): Promise<void> {
  const normalized = Array.from(
    new Set(tagNames.map((t) => t.trim().toLowerCase()).filter(Boolean))
  );

  await tx.postTag.deleteMany({
    where: { postId },
  });

  if (normalized.length === 0) return;

  const tags: Tag[] = await Promise.all(
    normalized.map((name) =>
      tx.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );

  await tx.postTag.createMany({
    data: tags.map((tag: Tag) => ({
      postId,
      tagId: tag.id,
    })),
    skipDuplicates: true,
  });
}

export function extractExcerpt(content: unknown, maxLength = 200): string {
  const plain = extractTextFromContent(content).replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export function formatPost(post: any) {
  const { tags, _count, likes, bookmarks, ...rest } = post;
  const isFollowedAuthor = Array.isArray(post.author?.followers)
    ? post.author.followers.length > 0
    : undefined;

  return {
    ...rest,
    tags: tags ? tags.map((t: any) => t.tag?.name ?? t.name) : [],
    likesCount: _count?.likes ?? 0,
    bookmarksCount: _count?.bookmarks ?? 0,
    commentsCount: _count?.comments ?? 0,
    likedByMe: Array.isArray(likes) ? likes.length > 0 : false,
    bookmarkedByMe: Array.isArray(bookmarks) ? bookmarks.length > 0 : false,
    ...(isFollowedAuthor !== undefined && { isFollowedAuthor }),
  };
}

export class PostsService {
  async createDraft(authorId: string, input: CreatePostInput) {
    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          authorId,
          title: input.title,
          content: (input.content ?? []) as Prisma.InputJsonValue,
          coverImage: input.coverImage ?? null,
          status: "DRAFT",
          score: 0,
          readingTime: 0,
          viewCount: 0,
        },
      });

      if (input.tags && input.tags.length > 0) {
        await syncPostTags(tx, created.id, input.tags);
      }

      return created;
    });

    return this.getPostById(post.id, authorId);
  }

  async updatePost(authorId: string, postId: string, input: UpdatePostInput) {
    const existing = await prisma.post.findUnique({
      where: { id: postId, isDeleted: false },
    });

    if (!existing) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    if (existing.authorId !== authorId) {
      throw new ForbiddenError({
        code: "FORBIDDEN",
        message: "You are not authorized to modify this post.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: postId },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.content !== undefined && {
            content: input.content as Prisma.InputJsonValue,
          }),
          ...(input.coverImage !== undefined && { coverImage: input.coverImage }),
        },
      });

      if (input.tags !== undefined) {
        await syncPostTags(tx, postId, input.tags);
      }
    });

    return this.getPostById(postId, authorId);
  }

  async publishPost(authorId: string, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenError({
        code: "FORBIDDEN",
        message: "You are not authorized to publish this post.",
      });
    }

    // Publishing preconditions:
    // 1. Title must have at least 5 words
    const titleWords = post.title.trim().split(/\s+/).filter(Boolean).length;
    if (titleWords < 5) {
      throw new BadRequestError({
        code: "INVALID_TITLE",
        message: "Title must contain at least 5 words to publish.",
      });
    }

    // 2. Cover image is required
    if (!post.coverImage) {
      throw new BadRequestError({
        code: "MISSING_COVER_IMAGE",
        message: "A cover image is required to publish.",
      });
    }

    // 3. Minimum 3 tags
    const postWithTags = await prisma.post.findUnique({
      where: { id: postId },
      include: { tags: true },
    });
    if (!postWithTags || postWithTags.tags.length < 3) {
      throw new BadRequestError({
        code: "INSUFFICIENT_TAGS",
        message: "At least 3 tags are required to publish.",
      });
    }

    // 4. Minimum 200 words of content
    const text = extractTextFromContent(post.content).trim();
    const contentWords = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (contentWords < 200) {
      throw new BadRequestError({
        code: "INSUFFICIENT_CONTENT",
        message: "Story must contain at least 200 words to publish.",
      });
    }

    const readingTime = calculateReadingTime(post.content);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: postId },
        data: {
          status: "PUBLISHED",
          publishedAt: post.publishedAt ?? new Date(),
          readingTime,
        },
      });

      await this.computeAndSaveScore(postId, tx);

      return tx.post.findUniqueOrThrow({
        where: { id: postId },
        include: getPostInclude(authorId),
      });
    });

    return formatPost(updated);
  }

  /**
   * Computes and saves the base weighted score on Post:
   * score = recencyScore + engagementVelocity
   * (Requester-specific followBoost and tagOverlapScore are applied at query time)
   */
  async computeAndSaveScore(
    postId: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const db = tx ?? prisma;

    const post = await db.post.findUnique({
      where: { id: postId, isDeleted: false },
      select: { id: true, authorId: true, publishedAt: true, createdAt: true },
    });

    if (!post) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const authorVisibleUsers = visibleUserWhere(post.authorId);
    const [likes24h, comments24h] = await Promise.all([
      db.like.count({
        where: { postId, createdAt: { gte: since24h }, user: authorVisibleUsers },
      }),
      db.comment.count({
        where: {
          postId,
          isDeleted: false,
          createdAt: { gte: since24h },
          author: authorVisibleUsers,
        },
      }),
    ]);

    const publishedTime = (post.publishedAt ?? post.createdAt).getTime();
    const hoursSincePublish = Math.max(0, (Date.now() - publishedTime) / 3_600_000);
    const recencyScore = 1 / (1 + hoursSincePublish / 24);
    const engagementVelocity = (likes24h + comments24h * 2) * 0.1;
    const score = Number((recencyScore + engagementVelocity).toFixed(4));

    await db.post.update({
      where: { id: postId },
      data: { score },
    });

    return score;
  }

  async unpublishPost(authorId: string, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenError({
        code: "FORBIDDEN",
        message: "You are not authorized to unpublish this post.",
      });
    }

    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        status: "DRAFT",
      },
      include: getPostInclude(authorId),
    });

    return formatPost(updated);
  }

  async deletePost(authorId: string, postId: string): Promise<void> {
    const post = await prisma.post.findUnique({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenError({
        code: "FORBIDDEN",
        message: "You are not authorized to delete this post.",
      });
    }

    await prisma.post.update({
      where: { id: postId },
      data: { isDeleted: true },
    });
  }

  async getOwnPosts(authorId: string, query: GetPostsQueryInput) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PostWhereInput = {
      authorId,
      isDeleted: false,
      ...(query?.status && { status: query.status as PostStatus }),
    };

    const [total, posts, aggregateViews, aggregateLikes] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: getPostInclude(authorId),
      }),
      prisma.post.aggregate({
        where: { authorId, isDeleted: false },
        _sum: { viewCount: true },
      }),
      prisma.like.count({
        where: {
          post: { authorId, isDeleted: false },
          user: visibleUserWhere(authorId),
        },
      }),
    ]);

    return {
      items: posts.map(formatPost),
      stats: {
        totalViews: aggregateViews._sum.viewCount ?? 0,
        totalLikes: aggregateLikes,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPostById(postId: string, viewerId?: string) {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        isDeleted: false,
        author: { isDeleted: false },
      },
      include: getPostInclude(viewerId),
    });

    if (!post) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    // Drafts are strictly author-only (404 to guests or other users)
    if (post.status === "DRAFT" && post.authorId !== viewerId) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    // Two-way block hides post completely from blocked/blocking viewers
    if (viewerId && (await hasBlockBetween(viewerId, post.authorId))) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Post not found.",
      });
    }

    return formatPost(post);
  }

  async incrementViewCount(postId: string, viewerId?: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId, isDeleted: false, status: "PUBLISHED" },
      select: { id: true, authorId: true, viewCount: true },
    });

    if (!post) {
      throw new NotFoundError({
        code: "POST_NOT_FOUND",
        message: "Published post not found.",
      });
    }

    // Do not increment view count for author or two-way blocked viewers
    if (
      viewerId &&
      (post.authorId === viewerId || (await hasBlockBetween(viewerId, post.authorId)))
    ) {
      return { viewCount: post.viewCount, incremented: false };
    }

    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        viewCount: { increment: 1 },
      },
      select: { viewCount: true },
    });

    return { ...updated, incremented: true };
  }
}

export const postsService = new PostsService();
