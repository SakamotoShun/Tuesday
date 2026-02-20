import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { noticeBoardItems, type NoticeBoardItem, type NewNoticeBoardItem } from '../db/schema';

export interface NoticeBoardItemWithUsers extends NoticeBoardItem {
  createdByUser?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
  assignee?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
  completedByUser?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
}

export class NoticeBoardRepository {
  async findAll(): Promise<NoticeBoardItemWithUsers[]> {
    return db.query.noticeBoardItems.findMany({
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        assignee: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        completedByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [asc(noticeBoardItems.sortOrder), desc(noticeBoardItems.createdAt)],
    }) as Promise<NoticeBoardItemWithUsers[]>;
  }

  async findById(id: string): Promise<NoticeBoardItemWithUsers | null> {
    const item = await db.query.noticeBoardItems.findFirst({
      where: eq(noticeBoardItems.id, id),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        assignee: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        completedByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    return (item ?? null) as NoticeBoardItemWithUsers | null;
  }

  async create(data: NewNoticeBoardItem): Promise<NoticeBoardItem> {
    const [item] = await db.insert(noticeBoardItems).values(data).returning();
    return item;
  }

  async update(id: string, data: Partial<NewNoticeBoardItem>): Promise<NoticeBoardItem | null> {
    const [item] = await db
      .update(noticeBoardItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(noticeBoardItems.id, id))
      .returning();

    return item ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(noticeBoardItems).where(eq(noticeBoardItems.id, id)).returning();
    return result.length > 0;
  }
}

export const noticeBoardRepository = new NoticeBoardRepository();
