import { prisma } from "@/lib/prisma.js";
import { deleteCache } from "@/lib/redis.js";
import { REDIS_KEYS } from "@/lib/constants.js";
import { hasBlockBetween, visibleUserWhere } from "@/lib/block.js";
import {
  formatPost,
  extractExcerpt,
  getPostInclude,
} from "@/services/posts.service.js";
import { NotFoundError } from "@/errors/NotFoundError.js";
import { BadRequestError } from "@/errors/BadRequestError.js";
import { ForbiddenError } from "@/errors/ForbiddenError.js";
import type {
  UpdateProfileBodyInput,
  UserPaginationQueryInput,
  UserPostsQueryInput,
} from "@/validators/user.validator.js";

export class UserService {
  private async purgeUserSessionCache(userId: string): Promise<void> {
    const sessions = await prisma.session.findMany({
      where: { userId },
      select: { tokenHash: true },
    });

    if (sessions.length > 0) {
      await Promise.all(
        sessions.map((s) => deleteCache(REDIS_KEYS.session(s.tokenHash)))
      );
    }
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User account not found.",
      });
    }

    // Purge all user sessions from Redis
    await this.purgeUserSessionCache(userId);

    // Soft-delete user and purge session records
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { isDeleted: true },
      }),
      prisma.session.deleteMany({
        where: { userId },
      }),
    ]);
  }

  /**
   * Updates authenticated user's profile details (name, bio, avatar).
   */
  async updateProfile(userId: string, input: UpdateProfileBodyInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User account not found.",
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.avatar !== undefined && {
          avatar: input.avatar === "" ? null : input.avatar,
        }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        bio: true,
        avatar: true,
        hasOnboarded: true,
        createdAt: true,
      },
    });

    await this.purgeUserSessionCache(userId);

    return updated;
  }

  /**
   * Fetches an author's public profile by unique username,
   * enforcing two-way block exclusion.
   */
  async getUserProfileByUsername(username: string, viewerId?: string) {
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: `Author @${username} not found.`,
      });
    }

    if (viewerId && (await hasBlockBetween(viewerId, user.id))) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: `Author @${username} not found.`,
      });
    }

    const userFilter = visibleUserWhere(viewerId);

    const [
      followersCount,
      followingCount,
      postsCount,
      isFollowingRow,
      isFollowedByRow,
      isBlockedRow,
      isBlockedByRow,
    ] = await Promise.all([
      prisma.follow.count({
        where: {
          followingId: user.id,
          follower: userFilter,
        },
      }),
      prisma.follow.count({
        where: {
          followerId: user.id,
          following: userFilter,
        },
      }),
      prisma.post.count({
        where: {
          authorId: user.id,
          status: "PUBLISHED",
          isDeleted: false,
        },
      }),
      viewerId
        ? prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: viewerId,
                followingId: user.id,
              },
            },
          })
        : Promise.resolve(null),
      viewerId
        ? prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: user.id,
                followingId: viewerId,
              },
            },
          })
        : Promise.resolve(null),
      viewerId
        ? prisma.block.findUnique({
            where: {
              blockerId_blockedId: {
                blockerId: viewerId,
                blockedId: user.id,
              },
            },
          })
        : Promise.resolve(null),
      viewerId
        ? prisma.block.findUnique({
            where: {
              blockerId_blockedId: {
                blockerId: user.id,
                blockedId: viewerId,
              },
            },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.createdAt,
      followersCount,
      followingCount,
      postsCount,
      isFollowing: isFollowingRow !== null,
      isFollowedBy: isFollowedByRow !== null,
      isBlocked: isBlockedRow !== null,
      isBlockedBy: isBlockedByRow !== null,
      isSelf: viewerId === user.id,
    };
  }

  /**
   * Fetches published posts for an author with cursor pagination.
   */
  async getUserPostsByUsername(
    username: string,
    query: UserPostsQueryInput,
    viewerId?: string
  ) {
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
        isDeleted: false,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: `Author @${username} not found.`,
      });
    }

    if (viewerId && (await hasBlockBetween(viewerId, user.id))) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: `Author @${username} not found.`,
      });
    }

    const limit = query.limit ?? 10;

    let cursorPost = null;
    if (query.cursor) {
      cursorPost = await prisma.post.findUnique({
        where: { id: query.cursor, authorId: user.id, isDeleted: false },
        select: { id: true, publishedAt: true, createdAt: true },
      });
    }

    const sortDateCondition = cursorPost
      ? {
          OR: [
            {
              publishedAt: {
                lt: cursorPost.publishedAt ?? cursorPost.createdAt,
              },
            },
            {
              publishedAt: cursorPost.publishedAt ?? cursorPost.createdAt,
              id: { lt: cursorPost.id },
            },
          ],
        }
      : {};

    const [posts, totalCount] = await Promise.all([
      prisma.post.findMany({
        where: {
          authorId: user.id,
          status: "PUBLISHED",
          isDeleted: false,
          ...sortDateCondition,
        },
        include: getPostInclude(viewerId),
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      }),
      prisma.post.count({
        where: {
          authorId: user.id,
          status: "PUBLISHED",
          isDeleted: false,
        },
      }),
    ]);

    const hasMore = posts.length > limit;
    const pageRows = hasMore ? posts.slice(0, limit) : posts;

    const items = pageRows.map((post) => {
      const formatted = formatPost(post);
      const excerpt = extractExcerpt(post.content, 200);
      const { content: _omittedContent, ...feedFields } = formatted;
      return {
        ...feedFields,
        excerpt,
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
      totalCount,
    };
  }

  /**
   * Retrieves all available topics/tags in the system.
   */
  async getAllTags() {
    return prisma.tag.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Retrieves chosen interest tags for the authenticated user.
   */
  async getUserInterests(userId: string) {
    const interests = await prisma.interest.findMany({
      where: { userId },
      include: {
        tag: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { tag: { name: "asc" } },
    });

    return interests.map((i) => i.tag);
  }

  /**
   * Saves user's chosen interests and marks onboarding as completed.
   * Requires at least 3 valid interest tags.
   */
  async saveUserInterests(userId: string, tagIds: string[]) {
    if (!tagIds || tagIds.length < 3) {
      throw new BadRequestError({
        code: "INSUFFICIENT_TOPICS",
        message: "Please select at least 3 topics to complete onboarding.",
      });
    }

    // Validate that all tagIds exist
    const validTags = await prisma.tag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true },
    });

    if (validTags.length < 3) {
      throw new BadRequestError({
        code: "INSUFFICIENT_VALID_TOPICS",
        message: "At least 3 valid topics must be selected.",
      });
    }

    const validTagIds = validTags.map((t) => t.id);

    await prisma.$transaction([
      prisma.interest.deleteMany({
        where: { userId },
      }),
      prisma.interest.createMany({
        data: validTagIds.map((tagId) => ({
          userId,
          tagId,
        })),
      }),
      prisma.user.update({
        where: { id: userId },
        data: { hasOnboarded: true },
      }),
    ]);

    await this.purgeUserSessionCache(userId);

    return {
      success: true,
      hasOnboarded: true,
      count: validTagIds.length,
    };
  }

  /**
   * Follows or unfollows a target user.
   * If explicitFollow is undefined, toggles the current state.
   */
  async toggleFollow(
    followerId: string,
    targetUserId: string,
    explicitFollow?: boolean
  ) {
    if (followerId === targetUserId) {
      throw new BadRequestError({
        code: "CANNOT_FOLLOW_SELF",
        message: "You cannot follow yourself.",
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId, isDeleted: false },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    if (await hasBlockBetween(followerId, targetUserId)) {
      throw new ForbiddenError({
        code: "INTERACTION_BLOCKED",
        message: "You cannot follow this user.",
      });
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUserId,
        },
      },
    });

    const shouldFollow =
      explicitFollow !== undefined ? explicitFollow : !existing;

    if (shouldFollow) {
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId,
            followingId: targetUserId,
          },
        },
        create: {
          followerId,
          followingId: targetUserId,
        },
        update: {},
      });
    } else {
      await prisma.follow.deleteMany({
        where: {
          followerId,
          followingId: targetUserId,
        },
      });
    }

    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({
        where: {
          followingId: targetUserId,
          follower: visibleUserWhere(followerId),
        },
      }),
      prisma.follow.count({
        where: {
          followerId: targetUserId,
          following: visibleUserWhere(followerId),
        },
      }),
    ]);

    return {
      targetUserId,
      isFollowing: shouldFollow,
      followersCount,
      followingCount,
    };
  }

  /**
   * Fetches paginated followers for a target user with cursor pagination
   * and mutual-connection annotations ("Followed by you").
   */
  async getFollowers(
    targetUserId: string,
    query: UserPaginationQueryInput,
    viewerId?: string
  ) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId, isDeleted: false },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    if (viewerId && (await hasBlockBetween(viewerId, targetUserId))) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    const limit = query.limit ?? 20;
    const userFilter = visibleUserWhere(viewerId);

    let cursorFollow = null;
    if (query.cursor) {
      cursorFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: query.cursor,
            followingId: targetUserId,
          },
        },
        select: { followerId: true, createdAt: true },
      });

      if (!cursorFollow) {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
          totalCount: 0,
        };
      }
    }

    const [followers, totalCount] = await Promise.all([
      prisma.follow.findMany({
        where: {
          followingId: targetUserId,
          follower: userFilter,
          ...(cursorFollow
            ? {
                OR: [
                  { createdAt: { lt: cursorFollow.createdAt } },
                  {
                    createdAt: cursorFollow.createdAt,
                    followerId: { lt: cursorFollow.followerId },
                  },
                ],
              }
            : {}),
        },
        include: {
          follower: {
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
                    following: {
                      where: { followingId: viewerId },
                      select: { followingId: true },
                    },
                  }
                : {}),
              _count: {
                select: {
                  followers: { where: { follower: userFilter } },
                  posts: {
                    where: { status: "PUBLISHED", isDeleted: false },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { followerId: "desc" }],
        take: limit + 1,
      }),
      prisma.follow.count({
        where: {
          followingId: targetUserId,
          follower: userFilter,
        },
      }),
    ]);

    const hasMore = followers.length > limit;
    const pageRows = hasMore ? followers.slice(0, limit) : followers;

    const items = pageRows.map((f) => {
      const u = f.follower;
      const isFollowing =
        Array.isArray(u.followers) && u.followers.length > 0;
      const isFollowedBy =
        Array.isArray(u.following) && u.following.length > 0;
      const isMutual =
        viewerId !== undefined &&
        viewerId !== targetUserId &&
        isFollowing;

      return {
        id: u.id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        bio: u.bio,
        followersCount: u._count.followers,
        postsCount: u._count.posts,
        isFollowing,
        isFollowedBy,
        isMutual,
        isSelf: viewerId ? viewerId === u.id : false,
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
      totalCount,
    };
  }

  /**
   * Fetches paginated following for a target user with cursor pagination.
   */
  async getFollowing(
    targetUserId: string,
    query: UserPaginationQueryInput,
    viewerId?: string
  ) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId, isDeleted: false },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    if (viewerId && (await hasBlockBetween(viewerId, targetUserId))) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    const limit = query.limit ?? 20;
    const userFilter = visibleUserWhere(viewerId);

    let cursorFollow = null;
    if (query.cursor) {
      cursorFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: targetUserId,
            followingId: query.cursor,
          },
        },
        select: { followingId: true, createdAt: true },
      });

      if (!cursorFollow) {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
          totalCount: 0,
        };
      }
    }

    const [following, totalCount] = await Promise.all([
      prisma.follow.findMany({
        where: {
          followerId: targetUserId,
          following: userFilter,
          ...(cursorFollow
            ? {
                OR: [
                  { createdAt: { lt: cursorFollow.createdAt } },
                  {
                    createdAt: cursorFollow.createdAt,
                    followingId: { lt: cursorFollow.followingId },
                  },
                ],
              }
            : {}),
        },
        include: {
          following: {
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
                    following: {
                      where: { followingId: viewerId },
                      select: { followingId: true },
                    },
                  }
                : {}),
              _count: {
                select: {
                  followers: { where: { follower: userFilter } },
                  posts: {
                    where: { status: "PUBLISHED", isDeleted: false },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { followingId: "desc" }],
        take: limit + 1,
      }),
      prisma.follow.count({
        where: {
          followerId: targetUserId,
          following: userFilter,
        },
      }),
    ]);

    const hasMore = following.length > limit;
    const pageRows = hasMore ? following.slice(0, limit) : following;

    const items = pageRows.map((f) => {
      const u = f.following;
      const isFollowing =
        Array.isArray(u.followers) && u.followers.length > 0;
      const isFollowedBy =
        Array.isArray(u.following) && u.following.length > 0;
      const isMutual =
        viewerId !== undefined &&
        viewerId !== targetUserId &&
        isFollowing;

      return {
        id: u.id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        bio: u.bio,
        followersCount: u._count.followers,
        postsCount: u._count.posts,
        isFollowing,
        isFollowedBy,
        isMutual,
        isSelf: viewerId ? viewerId === u.id : false,
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
      totalCount,
    };
  }

  /**
   * Retrieves full relationship status between viewer and target user.
   */
  async getRelationship(viewerId: string, targetUserId: string) {
    if (viewerId === targetUserId) {
      const [followersCount, followingCount] = await Promise.all([
        prisma.follow.count({
          where: {
            followingId: viewerId,
            follower: visibleUserWhere(viewerId),
          },
        }),
        prisma.follow.count({
          where: {
            followerId: viewerId,
            following: visibleUserWhere(viewerId),
          },
        }),
      ]);

      return {
        userId: targetUserId,
        isFollowing: false,
        isFollowedBy: false,
        isBlocked: false,
        isBlockedBy: false,
        followersCount,
        followingCount,
      };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId, isDeleted: false },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    const [
      followingRow,
      followedByRow,
      blockedRow,
      blockedByRow,
      followersCount,
      followingCount,
    ] = await Promise.all([
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: targetUserId,
          },
        },
      }),
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: targetUserId,
            followingId: viewerId,
          },
        },
      }),
      prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: viewerId,
            blockedId: targetUserId,
          },
        },
      }),
      prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: targetUserId,
            blockedId: viewerId,
          },
        },
      }),
      prisma.follow.count({
        where: {
          followingId: targetUserId,
          follower: visibleUserWhere(viewerId),
        },
      }),
      prisma.follow.count({
        where: {
          followerId: targetUserId,
          following: visibleUserWhere(viewerId),
        },
      }),
    ]);

    return {
      userId: targetUserId,
      isFollowing: followingRow !== null,
      isFollowedBy: followedByRow !== null,
      isBlocked: blockedRow !== null,
      isBlockedBy: blockedByRow !== null,
      followersCount,
      followingCount,
    };
  }

  /**
   * Blocks or unblocks a target user.
   * If explicitBlock is undefined, toggles the state.
   * When blocking, automatically deletes all follow relations in both directions.
   */
  async toggleBlock(
    blockerId: string,
    targetUserId: string,
    explicitBlock?: boolean
  ) {
    if (blockerId === targetUserId) {
      throw new BadRequestError({
        code: "CANNOT_BLOCK_SELF",
        message: "You cannot block yourself.",
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId, isDeleted: false },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundError({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }

    const existing = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId: targetUserId,
        },
      },
    });

    const shouldBlock =
      explicitBlock !== undefined ? explicitBlock : !existing;

    if (shouldBlock) {
      await prisma.$transaction([
        prisma.block.upsert({
          where: {
            blockerId_blockedId: {
              blockerId,
              blockedId: targetUserId,
            },
          },
          create: {
            blockerId,
            blockedId: targetUserId,
          },
          update: {},
        }),
        // Sever all follow connections between the two users
        prisma.follow.deleteMany({
          where: {
            OR: [
              { followerId: blockerId, followingId: targetUserId },
              { followerId: targetUserId, followingId: blockerId },
            ],
          },
        }),
      ]);
    } else {
      await prisma.block.deleteMany({
        where: {
          blockerId,
          blockedId: targetUserId,
        },
      });
    }

    return {
      targetUserId,
      isBlocked: shouldBlock,
    };
  }

  /**
   * Retrieves all users blocked by the blocker.
   */
  async getBlockedUsers(blockerId: string) {
    const blocks = await prisma.block.findMany({
      where: {
        blockerId,
        blocked: { isDeleted: false },
      },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return blocks.map((b) => ({
      ...b.blocked,
      blockedAt: b.createdAt,
    }));
  }
}

export const userService = new UserService();
