import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { positionDocs, type NewPositionDoc, type PositionDoc } from '../db/schema';

export class PositionDocRepository {
  async findAll(): Promise<PositionDoc[]> {
    return db.query.positionDocs.findMany({
      orderBy: [desc(positionDocs.createdAt)],
      with: {
        position: true,
        doc: true,
        createdByUser: true,
      },
    });
  }

  async findByPositionId(positionId: string): Promise<PositionDoc[]> {
    return db.query.positionDocs.findMany({
      where: eq(positionDocs.positionId, positionId),
      orderBy: [asc(positionDocs.sortOrder), asc(positionDocs.createdAt)],
      with: {
        doc: true,
        createdByUser: true,
      },
    });
  }

  async findById(id: string): Promise<PositionDoc | null> {
    const result = await db.query.positionDocs.findFirst({
      where: eq(positionDocs.id, id),
      with: {
        doc: true,
        createdByUser: true,
      },
    });
    return result || null;
  }

  async findByPositionAndDocId(positionId: string, docId: string): Promise<PositionDoc | null> {
    const result = await db.query.positionDocs.findFirst({
      where: and(eq(positionDocs.positionId, positionId), eq(positionDocs.docId, docId)),
      with: {
        doc: true,
        createdByUser: true,
      },
    });
    return result || null;
  }

  async create(data: NewPositionDoc): Promise<PositionDoc> {
    const [positionDoc] = await db.insert(positionDocs).values(data).returning();
    return positionDoc;
  }

  async update(id: string, data: Partial<NewPositionDoc>): Promise<PositionDoc | null> {
    const [positionDoc] = await db
      .update(positionDocs)
      .set(data)
      .where(eq(positionDocs.id, id))
      .returning();
    return positionDoc || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(positionDocs).where(eq(positionDocs.id, id)).returning();
    return result.length > 0;
  }
}

export const positionDocRepository = new PositionDocRepository();
