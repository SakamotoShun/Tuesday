import { eq, desc, ilike, or, and } from 'drizzle-orm';
import { db } from '../db/client';
import { candidates, type Candidate, type NewCandidate } from '../db/schema';

export class CandidateRepository {
  async findAll(filters?: { search?: string }): Promise<Candidate[]> {
    const conditions = [];
    if (filters?.search) {
      conditions.push(
        or(
          ilike(candidates.name, `%${filters.search}%`),
          ilike(candidates.email, `%${filters.search}%`)
        )!
      );
    }

    return db.query.candidates.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(candidates.createdAt)],
      with: {
        createdByUser: true,
        applications: {
          with: {
            position: true,
            stage: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<Candidate | null> {
    const result = await db.query.candidates.findFirst({
      where: eq(candidates.id, id),
      with: {
        createdByUser: true,
        applications: {
          with: {
            position: true,
            stage: true,
          },
        },
      },
    });
    return result || null;
  }

  async create(data: NewCandidate): Promise<Candidate> {
    const [candidate] = await db.insert(candidates).values(data).returning();
    return candidate;
  }

  async update(id: string, data: Partial<NewCandidate>): Promise<Candidate | null> {
    const [candidate] = await db
      .update(candidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning();
    return candidate || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(candidates).where(eq(candidates.id, id)).returning();
    return result.length > 0;
  }
}

export const candidateRepository = new CandidateRepository();
