import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { meetings, type Meeting, type NewMeeting, meetingAttendees } from '../db/schema';

export class MeetingRepository {
  async findById(id: string): Promise<Meeting | null> {
    const result = await db.query.meetings.findFirst({
      where: eq(meetings.id, id),
      with: {
        project: true,
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        attendees: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
    return result || null;
  }

  async findByProjectId(projectId: string): Promise<Meeting[]> {
    return db.query.meetings.findMany({
      where: eq(meetings.projectId, projectId),
      with: {
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        attendees: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: [desc(meetings.startTime)],
    });
  }

  async findByAttendee(userId: string): Promise<Meeting[]> {
    return db.query.meetings.findMany({
      where: (meetings, { exists }) => exists(
        db.select().from(meetingAttendees)
          .where(and(
            eq(meetingAttendees.meetingId, meetings.id),
            eq(meetingAttendees.userId, userId)
          ))
      ),
      with: {
        project: true,
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        attendees: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: [desc(meetings.startTime)],
    });
  }

  async create(data: NewMeeting): Promise<Meeting> {
    const [meeting] = await db.insert(meetings).values(data).returning();
    return meeting;
  }

  async update(id: string, data: Partial<NewMeeting>): Promise<Meeting | null> {
    const [meeting] = await db
      .update(meetings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(meetings.id, id))
      .returning();
    return meeting || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(meetings).where(eq(meetings.id, id)).returning();
    return result.length > 0;
  }
}

export const meetingRepository = new MeetingRepository();
