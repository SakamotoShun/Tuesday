import { and, asc, eq, max } from 'drizzle-orm';
import { db } from '../db/client';
import { favorites, type Favorite, type NewFavorite } from '../db/schema';

export class FavoriteRepository {
  async listByUserId(userId: string): Promise<Favorite[]> {
    return db.query.favorites.findMany({
      where: eq(favorites.userId, userId),
      orderBy: [asc(favorites.sortOrder), asc(favorites.createdAt)],
    });
  }

  async findByUserEntity(userId: string, entityType: string, entityId: string): Promise<Favorite | null> {
    const found = await db.query.favorites.findFirst({
      where: and(eq(favorites.userId, userId), eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)),
    });
    return found || null;
  }

  async getNextSortOrder(userId: string): Promise<number> {
    const [result] = await db
      .select({ value: max(favorites.sortOrder) })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    return (result?.value ?? -1) + 1;
  }

  async create(data: NewFavorite): Promise<Favorite> {
    const [created] = await db.insert(favorites).values(data).returning();
    return created;
  }

  async deleteByUserEntity(userId: string, entityType: string, entityId: string): Promise<boolean> {
    const result = await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)))
      .returning();
    return result.length > 0;
  }

  async reorder(userId: string, items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(favorites)
          .set({ sortOrder: item.sortOrder })
          .where(and(eq(favorites.id, item.id), eq(favorites.userId, userId)));
      }
    });
  }
}

export const favoriteRepository = new FavoriteRepository();
