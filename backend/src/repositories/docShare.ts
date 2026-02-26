import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { docShares } from '../db/schema';

export interface DocShareWithUser {
  docId: string;
  userId: string;
  permission: string;
  sharedBy: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export class DocShareRepository {
  async hasUserAccess(docId: string, userId: string): Promise<boolean> {
    const share = await db.query.docShares.findFirst({
      where: and(eq(docShares.docId, docId), eq(docShares.userId, userId)),
    });

    return Boolean(share);
  }

  async findByDocId(docId: string): Promise<DocShareWithUser[]> {
    return db.query.docShares.findMany({
      where: eq(docShares.docId, docId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    }) as Promise<DocShareWithUser[]>;
  }

  async replaceShares(docId: string, userIds: string[], sharedBy: string): Promise<DocShareWithUser[]> {
    const uniqueUserIds = Array.from(new Set(userIds));

    await db.transaction(async (tx) => {
      await tx.delete(docShares).where(eq(docShares.docId, docId));

      if (uniqueUserIds.length === 0) {
        return;
      }

      await tx.insert(docShares).values(
        uniqueUserIds.map((userId) => ({
          docId,
          userId,
          permission: 'edit',
          sharedBy,
        }))
      );
    });

    return this.findByDocId(docId);
  }
}

export const docShareRepository = new DocShareRepository();
