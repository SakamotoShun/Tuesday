import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { docs, type Doc, type NewDoc } from '../db/schema';

export class PolicyRepository {
  async findDatabases(): Promise<Doc[]> {
    return db.query.docs.findMany({
      where: and(
        eq(docs.isPolicy, true),
        eq(docs.isDatabase, true),
        isNull(docs.parentId)
      ),
      orderBy: [desc(docs.updatedAt)],
    });
  }

  async findDatabaseById(id: string): Promise<Doc | null> {
    const result = await db.query.docs.findFirst({
      where: and(
        eq(docs.id, id),
        eq(docs.isPolicy, true),
        eq(docs.isDatabase, true),
        isNull(docs.parentId)
      ),
    });
    return result || null;
  }

  async findChildren(databaseId: string): Promise<Doc[]> {
    return db.query.docs.findMany({
      where: and(
        eq(docs.parentId, databaseId),
        eq(docs.isPolicy, true)
      ),
      orderBy: [desc(docs.updatedAt)],
    });
  }

  async findRowByIdWithParent(id: string): Promise<(Doc & { parent?: Doc | null }) | null> {
    const result = await db.query.docs.findFirst({
      where: and(
        eq(docs.id, id),
        eq(docs.isPolicy, true),
        isNotNull(docs.parentId)
      ),
      with: {
        parent: {
          columns: {
            id: true,
            projectId: true,
            parentId: true,
            title: true,
            content: true,
            searchText: true,
            properties: true,
            isDatabase: true,
            isPolicy: true,
            schema: true,
            createdBy: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    return result || null;
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

  async deleteByParentId(parentId: string): Promise<number> {
    const result = await db
      .delete(docs)
      .where(
        and(
          eq(docs.parentId, parentId),
          eq(docs.isPolicy, true)
        )
      )
      .returning({ id: docs.id });

    return result.length;
  }
}

export const policyRepository = new PolicyRepository();
