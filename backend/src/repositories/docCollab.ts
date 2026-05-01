import { and, asc, count, desc, eq, gt, inArray, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { docCollabSnapshots, docCollabUpdates } from '../db/schema';

const SNAPSHOTS_TO_KEEP = 3;

export class DocCollabRepository {
  async getLatestSnapshot(docId: string) {
    return db.query.docCollabSnapshots.findFirst({
      where: eq(docCollabSnapshots.docId, docId),
      orderBy: [desc(docCollabSnapshots.seq)],
    });
  }

  async getUpdatesInRange(docId: string, minSeqExclusive: number, maxSeqInclusive: number, limit?: number) {
    return db.query.docCollabUpdates.findMany({
      where: and(
        eq(docCollabUpdates.docId, docId),
        gt(docCollabUpdates.seq, minSeqExclusive),
        lte(docCollabUpdates.seq, maxSeqInclusive)
      ),
      orderBy: [asc(docCollabUpdates.seq)],
      ...(typeof limit === 'number' ? { limit } : {}),
    });
  }

  async getUpdatesSince(docId: string, seq: number, limit?: number) {
    const latestSeq = await this.getLatestSeq(docId);
    return this.getUpdatesInRange(docId, seq, latestSeq, limit);
  }

  async countUpdatesInRange(docId: string, minSeqExclusive: number, maxSeqInclusive: number) {
    const [result] = await db
      .select({ count: count() })
      .from(docCollabUpdates)
      .where(and(
        eq(docCollabUpdates.docId, docId),
        gt(docCollabUpdates.seq, minSeqExclusive),
        lte(docCollabUpdates.seq, maxSeqInclusive)
      ));

    return result?.count ?? 0;
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

  async compactHistory(docId: string, snapshotSeq: number) {
    await db.delete(docCollabUpdates).where(
      and(eq(docCollabUpdates.docId, docId), lte(docCollabUpdates.seq, snapshotSeq))
    );

    const staleSnapshots = await db.query.docCollabSnapshots.findMany({
      where: eq(docCollabSnapshots.docId, docId),
      columns: { id: true },
      orderBy: [desc(docCollabSnapshots.seq)],
      offset: SNAPSHOTS_TO_KEEP,
    });

    if (staleSnapshots.length === 0) {
      return;
    }

    await db.delete(docCollabSnapshots).where(inArray(docCollabSnapshots.id, staleSnapshots.map((snapshot) => snapshot.id)));
  }
}

export const docCollabRepository = new DocCollabRepository();
