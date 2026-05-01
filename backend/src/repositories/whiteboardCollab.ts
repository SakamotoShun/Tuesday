import { and, asc, count, desc, eq, gt, inArray, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { whiteboardCollabSnapshots, whiteboardCollabUpdates } from '../db/schema';

const SNAPSHOTS_TO_KEEP = 3;

export class WhiteboardCollabRepository {
  async getLatestSnapshot(whiteboardId: string) {
    return db.query.whiteboardCollabSnapshots.findFirst({
      where: eq(whiteboardCollabSnapshots.whiteboardId, whiteboardId),
      orderBy: [desc(whiteboardCollabSnapshots.seq)],
    });
  }

  async getUpdatesInRange(whiteboardId: string, minSeqExclusive: number, maxSeqInclusive: number, limit?: number) {
    return db.query.whiteboardCollabUpdates.findMany({
      where: and(
        eq(whiteboardCollabUpdates.whiteboardId, whiteboardId),
        gt(whiteboardCollabUpdates.seq, minSeqExclusive),
        lte(whiteboardCollabUpdates.seq, maxSeqInclusive)
      ),
      orderBy: [asc(whiteboardCollabUpdates.seq)],
      ...(typeof limit === 'number' ? { limit } : {}),
    });
  }

  async getUpdatesSince(whiteboardId: string, seq: number, limit?: number) {
    const latestSeq = await this.getLatestSeq(whiteboardId);
    return this.getUpdatesInRange(whiteboardId, seq, latestSeq, limit);
  }

  async countUpdatesInRange(whiteboardId: string, minSeqExclusive: number, maxSeqInclusive: number) {
    const [result] = await db
      .select({ count: count() })
      .from(whiteboardCollabUpdates)
      .where(and(
        eq(whiteboardCollabUpdates.whiteboardId, whiteboardId),
        gt(whiteboardCollabUpdates.seq, minSeqExclusive),
        lte(whiteboardCollabUpdates.seq, maxSeqInclusive)
      ));

    return result?.count ?? 0;
  }

  async getLatestSeq(whiteboardId: string) {
    const latest = await db.query.whiteboardCollabUpdates.findFirst({
      where: eq(whiteboardCollabUpdates.whiteboardId, whiteboardId),
      orderBy: [desc(whiteboardCollabUpdates.seq)],
      columns: { seq: true },
    });

    return latest?.seq ?? 0;
  }

  async appendUpdate(whiteboardId: string, update: Record<string, unknown>, actorId: string) {
    const [result] = await db
      .insert(whiteboardCollabUpdates)
      .values({
        whiteboardId,
        update,
        actorId,
      })
      .returning({ seq: whiteboardCollabUpdates.seq });

    return result?.seq ?? 0;
  }

  async createSnapshot(whiteboardId: string, snapshot: Record<string, unknown>, seq: number) {
    const [result] = await db
      .insert(whiteboardCollabSnapshots)
      .values({
        whiteboardId,
        snapshot,
        seq,
      })
      .returning();

    return result;
  }

  async compactHistory(whiteboardId: string, snapshotSeq: number) {
    await db.delete(whiteboardCollabUpdates).where(
      and(eq(whiteboardCollabUpdates.whiteboardId, whiteboardId), lte(whiteboardCollabUpdates.seq, snapshotSeq))
    );

    const staleSnapshots = await db.query.whiteboardCollabSnapshots.findMany({
      where: eq(whiteboardCollabSnapshots.whiteboardId, whiteboardId),
      columns: { id: true },
      orderBy: [desc(whiteboardCollabSnapshots.seq)],
      offset: SNAPSHOTS_TO_KEEP,
    });

    if (staleSnapshots.length === 0) {
      return;
    }

    await db.delete(whiteboardCollabSnapshots).where(
      inArray(whiteboardCollabSnapshots.id, staleSnapshots.map((snapshot) => snapshot.id))
    );
  }
}

export const whiteboardCollabRepository = new WhiteboardCollabRepository();
