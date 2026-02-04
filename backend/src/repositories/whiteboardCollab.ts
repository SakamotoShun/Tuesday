import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { db } from '../db/client';
import { whiteboardCollabSnapshots, whiteboardCollabUpdates } from '../db/schema';

export class WhiteboardCollabRepository {
  async getLatestSnapshot(whiteboardId: string) {
    return db.query.whiteboardCollabSnapshots.findFirst({
      where: eq(whiteboardCollabSnapshots.whiteboardId, whiteboardId),
      orderBy: [desc(whiteboardCollabSnapshots.seq)],
    });
  }

  async getUpdatesSince(whiteboardId: string, seq: number) {
    return db.query.whiteboardCollabUpdates.findMany({
      where: and(eq(whiteboardCollabUpdates.whiteboardId, whiteboardId), gt(whiteboardCollabUpdates.seq, seq)),
      orderBy: [asc(whiteboardCollabUpdates.seq)],
    });
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
}

export const whiteboardCollabRepository = new WhiteboardCollabRepository();
