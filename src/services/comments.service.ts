import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import {
  hasBlockBetween,
  twoWayBlockAndSql,
  visibleUserWhere,
} from "@/lib/block.js";
import { assertPublishedPostInteractable } from "@/services/interactions.service.js";
import { postsService } from "@/services/posts.service.js";
import { NotFoundError } from "@/errors/NotFoundError.js";
import { ForbiddenError } from "@/errors/ForbiddenError.js";
import { BadRequestError } from "@/errors/BadRequestError.js";
import type {
  CreateCommentInput,
  GetCommentsQueryInput,
  GetRepliesQueryInput,
  UpdateCommentInput,
} from "@/validators/interactions.validator.js";

function getCommentInclude(viewerId?: string) {
  const userFilter = visibleUserWhere(viewerId);

  return {
    author: {
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
      },
    },
    _count: {
      select: {
        likes: { where: { user: userFilter } },
        replies: { where: { isDeleted: false, author: userFilter } },
      },
    },
    ...(viewerId
      ? {
          likes: {
            where: { userId: viewerId },
            select: { userId: true },
          },
        }
      : {}),
  };
}

interface CommentWithIncludes {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  };
  _count: {
    likes: number;
    replies: number;
  };
  likes?: { userId: string }[];
}

function formatComment(comment: CommentWithIncludes) {
  const likedByMe = Array.isArray(comment.likes) ? comment.likes.length > 0 : false;
  const repliesCount = comment._count.replies;

  if (comment.isDeleted) {
    return {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      body: null,
      isDeleted: true,
      isEdited: false,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: null,
      likesCount: 0,
      likedByMe: false,
      repliesCount,
    };
  }

  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    body: comment.body,
    isDeleted: false,
    isEdited: comment.updatedAt.getTime() - comment.createdAt.getTime() > 1000,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: comment.author,
    likesCount: comment._count.likes,
    likedByMe,
    repliesCount,
  };
}

async function assertPostReadable(postId: string, viewerId?: string) {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      isDeleted: false,
      author: { isDeleted: false },
    },
    select: {
      id: true,
      authorId: true,
      status: true,
    },
  });

  if (!post || (post.status === "DRAFT" && post.authorId !== viewerId)) {
    throw new NotFoundError({
      code: "POST_NOT_FOUND",
      message: "Post not found.",
    });
  }

  if (viewerId && (await hasBlockBetween(viewerId, post.authorId))) {
    throw new NotFoundError({
      code: "POST_NOT_FOUND",
      message: "Post not found.",
    });
  }

  return post;
}

export class CommentsService {
  async getPostComments(
    postId: string,
    query: GetCommentsQueryInput,
    viewerId?: string
  ) {
    await assertPostReadable(postId, viewerId);

    const sort = query.sort ?? "top";
    const page = query.page ?? 1;
    const limit = query.limit ?? 15;
    const skip = (page - 1) * limit;
    const userFilter = visibleUserWhere(viewerId);

    const rootWhere: Prisma.CommentWhereInput = {
      postId,
      parentId: null,
      OR: [
        { isDeleted: false, author: userFilter },
        {
          isDeleted: true,
          replies: { some: { isDeleted: false, author: userFilter } },
        },
      ],
    };

    const [total, totalCommentsCount] = await Promise.all([
      prisma.comment.count({ where: rootWhere }),
      prisma.comment.count({
        where: { postId, isDeleted: false, author: userFilter },
      }),
    ]);

    if (total === 0 || skip >= total) {
      return {
        items: [],
        total,
        totalCommentsCount,
        page,
        limit,
        hasMore: false,
      };
    }

    let orderedComments: CommentWithIncludes[];

    if (sort === "newest") {
      orderedComments = await prisma.comment.findMany({
        where: rootWhere,
        orderBy: [{ isDeleted: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        include: getCommentInclude(viewerId),
      });
    } else {
      const blockAuthorSql = twoWayBlockAndSql(viewerId, Prisma.raw('au."id"'));
      const blockLikerSql = twoWayBlockAndSql(viewerId, Prisma.raw('lu."id"'));
      const blockReplierSql = twoWayBlockAndSql(viewerId, Prisma.raw('ru."id"'));

      const idRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id
        FROM "Comment" c
        INNER JOIN "User" au ON au.id = c."authorId"
        WHERE c."postId" = ${postId}
          AND c."parentId" IS NULL
          AND (
            (c."isDeleted" = false AND au."isDeleted" = false ${blockAuthorSql})
            OR (
              c."isDeleted" = true
              AND EXISTS (
                SELECT 1 FROM "Comment" r
                INNER JOIN "User" ru ON ru.id = r."authorId" AND ru."isDeleted" = false
                WHERE r."parentId" = c.id
                  AND r."isDeleted" = false
                  ${blockReplierSql}
              )
            )
          )
        ORDER BY
          c."isDeleted" ASC,
          CASE WHEN c."isDeleted" THEN 0 ELSE (
            SELECT COUNT(*)::int
            FROM "CommentLike" cl
            INNER JOIN "User" lu ON lu.id = cl."userId" AND lu."isDeleted" = false
            WHERE cl."commentId" = c.id
              ${blockLikerSql}
          ) END DESC,
          c."createdAt" DESC,
          c.id DESC
        OFFSET ${skip}
        LIMIT ${limit}
      `;

      const pageIds = idRows.map((row) => row.id);
      if (pageIds.length === 0) {
        orderedComments = [];
      } else {
        const hydrated = await prisma.comment.findMany({
          where: { id: { in: pageIds } },
          include: getCommentInclude(viewerId),
        });
        const byId = new Map(hydrated.map((c) => [c.id, c]));
        orderedComments = pageIds
          .map((id) => byId.get(id))
          .filter((c): c is NonNullable<typeof c> => c !== undefined);
      }
    }

    return {
      items: orderedComments.map(formatComment),
      total,
      totalCommentsCount,
      page,
      limit,
      hasMore: skip + orderedComments.length < total,
    };
  }

  async getCommentReplies(
    commentId: string,
    query: GetRepliesQueryInput,
    viewerId?: string
  ) {
    const parent = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, parentId: true },
    });

    if (!parent || parent.parentId !== null) {
      throw new NotFoundError({
        code: "COMMENT_NOT_FOUND",
        message: "Parent comment not found.",
      });
    }

    await assertPostReadable(parent.postId, viewerId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CommentWhereInput = {
      parentId: commentId,
      isDeleted: false,
      author: visibleUserWhere(viewerId),
    };

    const [total, replies] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip,
        take: limit,
        include: getCommentInclude(viewerId),
      }),
    ]);

    return {
      items: replies.map(formatComment),
      total,
      page,
      limit,
      hasMore: skip + replies.length < total,
    };
  }

  async createComment(
    userId: string,
    postId: string,
    input: CreateCommentInput
  ) {
    await assertPublishedPostInteractable(postId, userId);

    if (input.parentId) {
      const parent = await prisma.comment.findFirst({
        where: {
          id: input.parentId,
          postId,
          isDeleted: false,
          author: { isDeleted: false },
        },
        select: { id: true, parentId: true, authorId: true },
      });

      if (!parent) {
        throw new NotFoundError({
          code: "COMMENT_NOT_FOUND",
          message: "Parent comment not found.",
        });
      }

      if (parent.parentId !== null) {
        throw new BadRequestError({
          code: "MAX_COMMENT_DEPTH",
          message: "Replies can only be added to top-level comments.",
        });
      }

      if (await hasBlockBetween(userId, parent.authorId)) {
        throw new ForbiddenError({
          code: "INTERACTION_BLOCKED",
          message: "You cannot reply to this comment.",
        });
      }
    }

    const created = await prisma.comment.create({
      data: {
        postId,
        authorId: userId,
        parentId: input.parentId ?? null,
        body: input.body,
      },
      include: getCommentInclude(userId),
    });

    await postsService.computeAndSaveScore(postId);

    return formatComment(created);
  }

  async updateComment(
    userId: string,
    commentId: string,
    input: UpdateCommentInput
  ) {
    const existing = await prisma.comment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
        post: { isDeleted: false },
      },
      select: { id: true, authorId: true },
    });

    if (!existing) {
      throw new NotFoundError({
        code: "COMMENT_NOT_FOUND",
        message: "Comment not found.",
      });
    }

    if (existing.authorId !== userId) {
      throw new ForbiddenError({
        code: "FORBIDDEN",
        message: "You are not authorized to edit this comment.",
      });
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { body: input.body },
      include: getCommentInclude(userId),
    });

    return formatComment(updated);
  }

  async deleteComment(userId: string, commentId: string) {
    const existing = await prisma.comment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
      },
      select: { id: true, authorId: true, postId: true, parentId: true },
    });

    if (!existing) {
      throw new NotFoundError({
        code: "COMMENT_NOT_FOUND",
        message: "Comment not found.",
      });
    }

    if (existing.authorId !== userId) {
      throw new ForbiddenError({
        code: "FORBIDDEN",
        message: "You are not authorized to delete this comment.",
      });
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    const activeReplies = await prisma.comment.count({
      where: { parentId: commentId, isDeleted: false },
    });

    await postsService.computeAndSaveScore(existing.postId);

    return {
      id: commentId,
      postId: existing.postId,
      parentId: existing.parentId,
      hasActiveReplies: activeReplies > 0,
    };
  }

  async setCommentLike(userId: string, commentId: string, liked: boolean) {
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
        author: { isDeleted: false },
        post: {
          isDeleted: false,
          status: "PUBLISHED",
          author: { isDeleted: false },
        },
      },
      select: {
        id: true,
        authorId: true,
        post: { select: { authorId: true } },
      },
    });

    if (!comment) {
      throw new NotFoundError({
        code: "COMMENT_NOT_FOUND",
        message: "Comment not found.",
      });
    }

    if (
      (await hasBlockBetween(userId, comment.authorId)) ||
      (await hasBlockBetween(userId, comment.post.authorId))
    ) {
      throw new ForbiddenError({
        code: "INTERACTION_BLOCKED",
        message: "You cannot interact with this comment.",
      });
    }

    if (liked) {
      await prisma.commentLike.upsert({
        where: { userId_commentId: { userId, commentId } },
        create: { userId, commentId },
        update: {},
      });
    } else {
      await prisma.commentLike.deleteMany({
        where: { userId, commentId },
      });
    }

    const likesCount = await prisma.commentLike.count({
      where: {
        commentId,
        user: visibleUserWhere(userId),
      },
    });

    return {
      commentId,
      likesCount,
      likedByMe: liked,
    };
  }
}

export const commentsService = new CommentsService();
