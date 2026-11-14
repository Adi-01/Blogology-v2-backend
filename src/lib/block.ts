import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";

/**
 * Prisma User filter enforcing soft-delete exclusion plus two-way block visibility
 * (neither the viewer blocked the user nor the user blocked the viewer).
 */
export function visibleUserWhere(viewerId?: string): Prisma.UserWhereInput {
  if (!viewerId) {
    return { isDeleted: false };
  }

  return {
    isDeleted: false,
    blockedBy: { none: { blockerId: viewerId } },
    blockedUsers: { none: { blockedId: viewerId } },
  };
}

/**
 * Raw SQL predicate for post queries aliased as `p` enforcing two-way block exclusion.
 */
export function twoWayBlockAuthorSql(viewerId: string): Prisma.Sql {
  return twoWayBlockColumnSql(viewerId, Prisma.raw('p."authorId"'));
}

/**
 * Raw SQL predicate enforcing two-way block exclusion against a trusted SQL column reference.
 */
export function twoWayBlockColumnSql(
  viewerId: string,
  columnRef: Prisma.Sql
): Prisma.Sql {
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "Block" b
    WHERE (b."blockerId" = ${viewerId} AND b."blockedId" = ${columnRef})
       OR (b."blockerId" = ${columnRef} AND b."blockedId" = ${viewerId})
  )`;
}

/**
 * Raw SQL `AND NOT EXISTS (...)` predicate for optional viewer IDs.
 */
export function twoWayBlockAndSql(
  viewerId: string | undefined,
  columnRef: Prisma.Sql
): Prisma.Sql {
  if (!viewerId) return Prisma.empty;
  return Prisma.sql`AND ${twoWayBlockColumnSql(viewerId, columnRef)}`;
}

/**
 * Returns true if either user has blocked the other.
 */
export async function hasBlockBetween(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false;

  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { blockerId: true },
  });

  return block !== null;
}
