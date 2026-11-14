import { prisma } from "@/lib/prisma.js";
import { hasBlockBetween, visibleUserWhere } from "@/lib/block.js";
import {
  extractExcerpt,
  formatPost,
  getPostInclude,
  postsService,
} from "@/services/posts.service.js";
import { NotFoundError } from "@/errors/NotFoundError.js";
import { ForbiddenError } from "@/errors/ForbiddenError.js";
import type { BookmarksQueryInput } from "@/validators/interactions.validator.js";

/**
 * Ensures a post is published, non-deleted, and not hidden by a two-way block
 * before permitting interactive mutations (like, bookmark, comment).
 */
export async function assertPublishedPostInteractable(postId: string, userId: string) {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      isDeleted: false,
      status: "PUBLISHED",
      author: { isDeleted: false },
    },
    select: {
      id: true,
      authorId: true,
    },
  });

  if (!post) {
    throw new NotFoundError({
      code: "POST_NOT_FOUND",
      message: "Published post not found.",
    });
  }

  if (await hasBlockBetween(userId, post.authorId)) {
    throw new ForbiddenError({
      code: "INTERACTION_BLOCKED",
      message: "You cannot interact with this post.",
    });
  }

  return post;
}

export class InteractionsService {
  async setPostLike(userId: string, postId: string, liked: boolean) {
    await assertPublishedPostInteractable(postId, userId);

    if (liked) {
      await prisma.like.upsert({
        where: { userId_postId: { userId, postId } },
        create: { userId, postId },
        update: {},
      });
    } else {
      await prisma.like.deleteMany({
        where: { userId, postId },
      });
    }

    await postsService.computeAndSaveScore(postId);

    const likesCount = await prisma.like.count({
      where: {
        postId,
        user: visibleUserWhere(userId),
      },
    });

    return {
      postId,
      likesCount,
      likedByMe: liked,
    };
  }

  async setPostBookmark(userId: string, postId: string, bookmarked: boolean) {
    if (bookmarked) {
      await assertPublishedPostInteractable(postId, userId);
      await prisma.bookmark.upsert({
        where: { userId_postId: { userId, postId } },
        create: { userId, postId },
        update: {},
      });
    } else {
      await prisma.bookmark.deleteMany({
        where: { userId, postId },
      });
    }

    const bookmarksCount = await prisma.bookmark.count({
      where: {
        postId,
        user: visibleUserWhere(userId),
      },
    });

    return {
      postId,
      bookmarksCount,
      bookmarkedByMe: bookmarked,
    };
  }

  async getBookmarkedPosts(userId: string, query: BookmarksQueryInput) {
    const limit = query.limit ?? 10;
    let cursorCreatedAt: Date | null = null;
    let cursorPostId: string | null = null;

    if (query.cursor) {
      const cursorBookmark = await prisma.bookmark.findUnique({
        where: { userId_postId: { userId, postId: query.cursor } },
        select: { createdAt: true, postId: true },
      });

      if (!cursorBookmark) {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
        };
      }

      cursorCreatedAt = cursorBookmark.createdAt;
      cursorPostId = cursorBookmark.postId;
    }

    const rows = await prisma.bookmark.findMany({
      where: {
        userId,
        post: {
          isDeleted: false,
          status: "PUBLISHED",
          author: visibleUserWhere(userId),
        },
        ...(cursorCreatedAt && cursorPostId
          ? {
              OR: [
                { createdAt: { lt: cursorCreatedAt } },
                {
                  createdAt: cursorCreatedAt,
                  postId: { lt: cursorPostId },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { postId: "desc" }],
      take: limit + 1,
      include: {
        post: {
          include: getPostInclude(userId),
        },
      },
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const authorIds = Array.from(new Set(pageRows.map((row) => row.post.authorId)));
    const followedRows =
      authorIds.length > 0
        ? await prisma.follow.findMany({
            where: {
              followerId: userId,
              followingId: { in: authorIds },
            },
            select: { followingId: true },
          })
        : [];
    const followedSet = new Set(followedRows.map((f) => f.followingId));

    const items = pageRows.map((row) => {
      const formatted = formatPost(row.post);
      const excerpt = extractExcerpt(row.post.content, 200);
      const { content: _omittedContent, ...feedFields } = formatted;

      return {
        ...feedFields,
        excerpt,
        baseScore: row.post.score,
        isFollowedAuthor: followedSet.has(row.post.authorId),
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }
}

export const interactionsService = new InteractionsService();
