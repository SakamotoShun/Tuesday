import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { interviewNotes, type InterviewNote, type NewInterviewNote } from '../db/schema';

export class InterviewNoteRepository {
  async findByApplicationId(applicationId: string): Promise<InterviewNote[]> {
    return db.query.interviewNotes.findMany({
      where: eq(interviewNotes.applicationId, applicationId),
      orderBy: [desc(interviewNotes.createdAt)],
      with: {
        createdByUser: true,
        doc: {
          columns: {
            id: true,
            title: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async findByInterviewId(interviewId: string): Promise<InterviewNote[]> {
    return db.query.interviewNotes.findMany({
      where: eq(interviewNotes.interviewId, interviewId),
      orderBy: [desc(interviewNotes.createdAt)],
      with: {
        createdByUser: true,
        doc: {
          columns: {
            id: true,
            title: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<InterviewNote | null> {
    const result = await db.query.interviewNotes.findFirst({
      where: eq(interviewNotes.id, id),
      with: {
        createdByUser: true,
        doc: {
          columns: {
            id: true,
            title: true,
            updatedAt: true,
          },
        },
      },
    });
    return result || null;
  }

  async create(data: NewInterviewNote): Promise<InterviewNote> {
    const [note] = await db.insert(interviewNotes).values(data).returning();
    return note;
  }

  async update(id: string, data: Partial<NewInterviewNote>): Promise<InterviewNote | null> {
    const [note] = await db
      .update(interviewNotes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(interviewNotes.id, id))
      .returning();
    return note || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(interviewNotes).where(eq(interviewNotes.id, id)).returning();
    return result.length > 0;
  }
}

export const interviewNoteRepository = new InterviewNoteRepository();
