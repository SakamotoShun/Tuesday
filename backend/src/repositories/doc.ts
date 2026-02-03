import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { docs, type Doc, type NewDoc } from '../db/schema';

export class DocRepository {
  async findById(id: string): Promise<Doc | null> {
    const result = await db.query.docs.findFirst({
      where: eq(docs.id, id),
      with: {
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    return result || null;
  }

  async findByProjectId(projectId: string): Promise<Doc[]> {
    return db.query.docs.findMany({
      where: eq(docs.projectId, projectId),
      with: {
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(docs.updatedAt)],
    });
  }

  async findPersonalDocs(userId: string): Promise<Doc[]> {
    return db.query.docs.findMany({
      where: and(
        eq(docs.createdBy, userId),
        isNull(docs.projectId)
      ),
      orderBy: [desc(docs.updatedAt)],
    });
  }

  async findChildren(parentId: string): Promise<Doc[]> {
    return db.query.docs.findMany({
      where: eq(docs.parentId, parentId),
      with: {
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(docs.updatedAt)],
    });
  }

  async create(data: NewDoc): Promise<Doc> {
    const [doc] = await db.insert(docs).values(data).returning();
    return doc;
  }

  async update(id: string, data: Partial<NewDoc>): Promise<Doc | null> {
    const [doc] = await db
      .update(docs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(docs.id, id))
      .returning();
    return doc || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(docs).where(eq(docs.id, id)).returning();
    return result.length > 0;
  }

  async findByProjectAndId(projectId: string | null, docId: string): Promise<Doc | null> {
    if (projectId) {
      const result = await db.query.docs.findFirst({
        where: and(
          eq(docs.id, docId),
          eq(docs.projectId, projectId)
        ),
      });
      return result || null;
    } else {
      const result = await db.query.docs.findFirst({
        where: and(
          eq(docs.id, docId),
          isNull(docs.projectId)
        ),
      });
      return result || null;
    }
  }
}

export const docRepository = new DocRepository();
