import { asc, desc, eq } from 'drizzle-orm';
import { db, type DbExecutor } from '../db/client';
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
  async findAll(executor: DbExecutor = db): Promise<NoticeBoardItemWithUsers[]> {
    return executor.query.noticeBoardItems.findMany({
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

  async findById(id: string, executor: DbExecutor = db): Promise<NoticeBoardItemWithUsers | null> {
    const item = await executor.query.noticeBoardItems.findFirst({
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

  async create(data: NewNoticeBoardItem, executor: DbExecutor = db): Promise<NoticeBoardItem> {
    const [item] = await executor.insert(noticeBoardItems).values(data).returning();
    return item;
  }

  async update(id: string, data: Partial<NewNoticeBoardItem>, executor: DbExecutor = db): Promise<NoticeBoardItem | null> {
    const [item] = await executor
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
