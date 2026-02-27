import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { sharedLinks, type SharedLink } from '../db/schema';

export class SharedLinkRepository {
  async findDocLink(docId: string): Promise<SharedLink | null> {
    const link = await db.query.sharedLinks.findFirst({
      where: eq(sharedLinks.docId, docId),
    });
    return link || null;
  }

  async findByToken(token: string): Promise<SharedLink | null> {
    const link = await db.query.sharedLinks.findFirst({
      where: eq(sharedLinks.token, token),
    });
    return link || null;
  }

  async upsertDocViewLink(docId: string, token: string, createdBy: string): Promise<SharedLink> {
    const [link] = await db
      .insert(sharedLinks)
      .values({
        token,
        docId,
        permission: 'view',
        createdBy,
      })
      .onConflictDoUpdate({
        target: sharedLinks.docId,
        set: {
          token,
          permission: 'view',
          createdBy,
          createdAt: new Date(),
        },
      })
      .returning();

    return link;
  }

  async deleteDocLink(docId: string): Promise<number> {
    const deleted = await db
      .delete(sharedLinks)
      .where(eq(sharedLinks.docId, docId))
      .returning({ id: sharedLinks.id });

    return deleted.length;
  }
}

export const sharedLinkRepository = new SharedLinkRepository();
