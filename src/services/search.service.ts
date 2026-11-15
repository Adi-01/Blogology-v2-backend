import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import { twoWayBlockAuthorSql, visibleUserWhere } from "@/lib/block.js";
import { feedService } from "@/services/feed.service.js";
import { BadRequestError } from "@/errors/BadRequestError.js";

function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, "\\$&");
}

function normalizeQuery(raw: string): string {
  const q = raw.trim();
  if (!q) {
    throw new BadRequestError({
      code: "SEARCH_QUERY_REQUIRED",
      message: "Search query 'q' cannot be empty.",
    });
  }
  return q;
}

interface SearchOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  requesterId?: string | undefined;
}

export class SearchService {
  /**
   * Searches published, non-deleted posts by title or BlockNote text content
   * using PostgreSQL case-insensitive ILIKE and tuple-cursor pagination.
   */
  async searchPosts(rawQuery: string, options: SearchOptions = {}) {
    const q = normalizeQuery(rawQuery);
    const pattern = `%${escapeLikePattern(q)}%`;
    const limit = options.limit ?? 10;
    const requesterId = options.requesterId;

    const followJoin = requesterId
      ? Prisma.sql`LEFT JOIN "Follow" f ON f."followerId" = ${requesterId} AND f."followingId" = p."authorId"`
      : Prisma.empty;

    const isFollowedExpr = requesterId
      ? Prisma.sql`(f."followingId" IS NOT NULL)`
      : Prisma.sql`false`;

    const blockFilter = requesterId
      ? Prisma.sql`AND ${twoWayBlockAuthorSql(requesterId)}`
      : Prisma.empty;

    const scoredCte = Prisma.sql`
      WITH scored AS (
        SELECT
          p.id,
          COALESCE(p."publishedAt", p."createdAt") AS sort_date,
          ${isFollowedExpr} AS is_followed,
          p.score::float AS effective_score
        FROM "Post" p
        INNER JOIN "User" u
          ON u.id = p."authorId" AND u."isDeleted" = false
        ${followJoin}
        WHERE p.status = 'PUBLISHED'::"PostStatus"
          AND p."isDeleted" = false
          ${blockFilter}
          AND (
            p.title ILIKE ${pattern} ESCAPE '\\'
            OR COALESCE(
              jsonb_path_query_array(p.content::jsonb, '$.**.text')::text,
              ''
            ) ILIKE ${pattern} ESCAPE '\\'
          )
      )
    `;

    return feedService.executeScoredFeed(
      scoredCte,
      {
        cursor: options.cursor,
        limit,
      },
      requesterId
    );
  }

  /**
   * Searches non-deleted users by username or name (case-insensitive substring) with
   * deterministic cursor pagination and follower/post counts (no N+1).
   */
  async searchUsers(rawQuery: string, options: SearchOptions = {}) {
    const q = normalizeQuery(rawQuery);
    const limit = options.limit ?? 10;
    const requesterId = options.requesterId;

    const users = await prisma.user.findMany({
      where: {
        ...visibleUserWhere(requesterId),
        OR: [
          {
            username: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: [{ username: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        bio: true,
        _count: {
          select: {
            followers: {
              where: {
                follower: visibleUserWhere(requesterId),
              },
            },
            posts: {
              where: {
                status: "PUBLISHED",
                isDeleted: false,
              },
            },
          },
        },
        ...(requesterId
          ? {
              followers: {
                where: { followerId: requesterId },
                select: { followerId: true },
              },
            }
          : {}),
      },
    });

    const hasMore = users.length > limit;
    const pageUsers = hasMore ? users.slice(0, limit) : users;

    const items = pageUsers.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      followersCount: user._count.followers,
      postsCount: user._count.posts,
      isFollowing:
        "followers" in user && Array.isArray(user.followers)
          ? user.followers.length > 0
          : false,
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }
}

export const searchService = new SearchService();
