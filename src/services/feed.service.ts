import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import { twoWayBlockAuthorSql } from "@/lib/block.js";
import {
  getPostInclude,
  formatPost,
  extractExcerpt,
} from "@/services/posts.service.js";
import type { FeedQueryInput } from "@/validators/feed.validator.js";

interface ScoredPostRow {
  id: string;
  effective_score: number;
  sort_date: Date;
  is_followed: boolean;
}

export class FeedService {
  /**
   * Computes the personalized For-You feed for an authenticated user:
   * - Effective score = stored score (recency + engagementVelocity)
   *                   + followBoost (0.5 if author is followed)
   *                   + tagOverlapScore ((matchingTags / totalPostTags) * 0.3)
   * - Excludes own posts, blocked authors, soft-deleted posts/users, and drafts.
   * - Uses deterministic cursor pagination over (effective_score, sort_date, id).
   */
  async getForYouFeed(userId: string, query: FeedQueryInput) {
    const scoredCte = Prisma.sql`
      WITH scored AS (
        SELECT
          p.id,
          COALESCE(p."publishedAt", p."createdAt") AS sort_date,
          (f."followingId" IS NOT NULL) AS is_followed,
          (
            p.score
            + CASE WHEN f."followingId" IS NOT NULL THEN 0.5 ELSE 0 END
            + CASE
                WHEN COALESCE(tc.total_tags, 0) > 0
                THEN (COALESCE(mc.matching_tags, 0)::float / tc.total_tags::float) * 0.3
                ELSE 0
              END
          ) AS effective_score
        FROM "Post" p
        INNER JOIN "User" u
          ON u.id = p."authorId" AND u."isDeleted" = false
        LEFT JOIN "Follow" f
          ON f."followerId" = ${userId} AND f."followingId" = p."authorId"
        LEFT JOIN (
          SELECT "postId", COUNT(*) AS total_tags
          FROM "PostTag"
          GROUP BY "postId"
        ) tc ON tc."postId" = p.id
        LEFT JOIN (
          SELECT pt."postId", COUNT(*) AS matching_tags
          FROM "PostTag" pt
          INNER JOIN "Interest" i ON i."tagId" = pt."tagId" AND i."userId" = ${userId}
          GROUP BY pt."postId"
        ) mc ON mc."postId" = p.id
        WHERE p.status = 'PUBLISHED'::"PostStatus"
          AND p."isDeleted" = false
          AND p."authorId" <> ${userId}
          AND ${twoWayBlockAuthorSql(userId)}
      )
    `;

    return this.executeScoredFeed(scoredCte, query, userId);
  }

  /**
   * Explore feed: surfaces published posts whose tags do NOT overlap with the
   * user's Interest tags. Users with no interests (or guest visitors) see all recent popular posts.
   */
  async getExploreFeed(userId: string | undefined, query: FeedQueryInput) {
    if (!userId) {
      const scoredCte = Prisma.sql`
        WITH scored AS (
          SELECT
            p.id,
            COALESCE(p."publishedAt", p."createdAt") AS sort_date,
            false AS is_followed,
            p.score::float AS effective_score
          FROM "Post" p
          INNER JOIN "User" u
            ON u.id = p."authorId" AND u."isDeleted" = false
          WHERE p.status = 'PUBLISHED'::"PostStatus"
            AND p."isDeleted" = false
        )
      `;
      return this.executeScoredFeed(scoredCte, query, undefined);
    }

    const scoredCte = Prisma.sql`
      WITH scored AS (
        SELECT
          p.id,
          COALESCE(p."publishedAt", p."createdAt") AS sort_date,
          (f."followingId" IS NOT NULL) AS is_followed,
          p.score::float AS effective_score
        FROM "Post" p
        INNER JOIN "User" u
          ON u.id = p."authorId" AND u."isDeleted" = false
        LEFT JOIN "Follow" f
          ON f."followerId" = ${userId} AND f."followingId" = p."authorId"
        WHERE p.status = 'PUBLISHED'::"PostStatus"
          AND p."isDeleted" = false
          AND p."authorId" <> ${userId}
          AND ${twoWayBlockAuthorSql(userId)}
          AND NOT EXISTS (
            SELECT 1
            FROM "PostTag" pt
            INNER JOIN "Interest" i ON i."tagId" = pt."tagId"
            WHERE pt."postId" = p.id
              AND i."userId" = ${userId}
          )
      )
    `;

    return this.executeScoredFeed(scoredCte, query, userId);
  }

  /**
   * Executes deterministic tuple-cursor pagination and Post hydration over any
   * CTE named `scored(id, sort_date, is_followed, effective_score)`.
   */
  async executeScoredFeed(
    scoredCte: Prisma.Sql,
    query: FeedQueryInput,
    viewerId?: string
  ) {
    const limit = query.limit ?? 10;
    const cursor = query.cursor;

    let cursorCondition = Prisma.empty;
    if (cursor) {
      const cursorRows = await prisma.$queryRaw<ScoredPostRow[]>`
        ${scoredCte}
        SELECT id, effective_score, sort_date, is_followed
        FROM scored
        WHERE id = ${cursor}
        LIMIT 1
      `;
      const cursorRow = cursorRows[0];
      if (!cursorRow) {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
        };
      }
      cursorCondition = Prisma.sql`
        WHERE (effective_score, sort_date, id) < (${cursorRow.effective_score}, ${cursorRow.sort_date}, ${cursorRow.id})
      `;
    }

    const rows = await prisma.$queryRaw<ScoredPostRow[]>`
      ${scoredCte}
      SELECT id, effective_score, sort_date, is_followed
      FROM scored
      ${cursorCondition}
      ORDER BY effective_score DESC, sort_date DESC, id DESC
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    if (pageRows.length === 0) {
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
      };
    }

    const pageIds = pageRows.map((r) => r.id);
    const metaById = new Map(pageRows.map((r) => [r.id, r]));

    const hydratedPosts = await prisma.post.findMany({
      where: { id: { in: pageIds } },
      include: getPostInclude(viewerId),
    });

    const postById = new Map(hydratedPosts.map((p) => [p.id, p]));

    const items = pageIds
      .map((id) => {
        const post = postById.get(id);
        const meta = metaById.get(id);
        if (!post || !meta) return null;

        const formatted = formatPost(post);
        const excerpt = extractExcerpt(post.content, 200);
        const { content: _omittedContent, ...feedFields } = formatted;

        return {
          ...feedFields,
          excerpt,
          score: Number(meta.effective_score.toFixed(4)),
          baseScore: post.score,
          isFollowedAuthor: meta.is_followed,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }
}

export const feedService = new FeedService();
