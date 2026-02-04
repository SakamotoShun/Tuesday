import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { db } from '../db/client';
import { docCollabSnapshots, docCollabUpdates } from '../db/schema';

export class DocCollabRepository {
  async getLatestSnapshot(docId: string) {
    return db.query.docCollabSnapshots.findFirst({
      where: eq(docCollabSnapshots.docId, docId),
      orderBy: [desc(docCollabSnapshots.seq)],
    });
  }

  async getUpdatesSince(docId: string, seq: number) {
    return db.query.docCollabUpdates.findMany({
      where: and(eq(docCollabUpdates.docId, docId), gt(docCollabUpdates.seq, seq)),
      orderBy: [asc(docCollabUpdates.seq)],
    });
  }

  async getLatestSeq(docId: string) {
    const latest = await db.query.docCollabUpdates.findFirst({
      where: eq(docCollabUpdates.docId, docId),
      orderBy: [desc(docCollabUpdates.seq)],
      columns: { seq: true },
    });

    return latest?.seq ?? 0;
  }

  async appendUpdate(docId: string, update: Uint8Array, actorId: string) {
    const [result] = await db
      .insert(docCollabUpdates)
      .values({
        docId,
        update: Buffer.from(update),
        actorId,
      })
      .returning({ seq: docCollabUpdates.seq });

    return result?.seq ?? 0;
  }

  async createSnapshot(docId: string, snapshot: Uint8Array, seq: number) {
    const [result] = await db
      .insert(docCollabSnapshots)
      .values({
        docId,
        snapshot: Buffer.from(snapshot),
        seq,
      })
      .returning();

    return result;
  }
}

export const docCollabRepository = new DocCollabRepository();
