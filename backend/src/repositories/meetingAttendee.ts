import { and, eq } from 'drizzle-orm';
import { db, type DbExecutor, type DbTransaction } from '../db/client';
import { meetingAttendees, type MeetingAttendee, type NewMeetingAttendee } from '../db/schema';

export class MeetingAttendeeRepository {
  async findByMeetingId(meetingId: string, executor: DbExecutor = db): Promise<(MeetingAttendee & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[]> {
    const result = await executor.query.meetingAttendees.findMany({
      where: eq(meetingAttendees.meetingId, meetingId),
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
    });
    return result as (MeetingAttendee & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[];
  }

  async addAttendee(meetingId: string, userId: string): Promise<MeetingAttendee> {
    const [attendee] = await db.insert(meetingAttendees)
      .values({
        meetingId,
        userId,
      })
      .returning();
    return attendee;
  }

  async removeAttendee(meetingId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(meetingAttendees)
      .where(and(
        eq(meetingAttendees.meetingId, meetingId),
        eq(meetingAttendees.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async setAttendees(meetingId: string, userIds: string[], executor: DbExecutor = db): Promise<void> {
    const replace = async (tx: DbTransaction) => {
      await tx.delete(meetingAttendees).where(eq(meetingAttendees.meetingId, meetingId));

      if (userIds.length > 0) {
        await tx.insert(meetingAttendees).values(
          userIds.map((userId) => ({
            meetingId,
            userId,
          })) as NewMeetingAttendee[]
        );
      }
    };
    if (executor === db) await db.transaction(replace);
    else await replace(executor as DbTransaction);
  }

  async isAttendee(meetingId: string, userId: string): Promise<boolean> {
    const attendee = await db.query.meetingAttendees.findFirst({
      where: and(
        eq(meetingAttendees.meetingId, meetingId),
        eq(meetingAttendees.userId, userId)
      ),
      columns: {
        meetingId: true,
      },
    });

    return attendee !== null;
  }
}

export const meetingAttendeeRepository = new MeetingAttendeeRepository();
