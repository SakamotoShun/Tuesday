import { desc, eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { teams, teamMembers, type Team, type NewTeam } from '../db/schema';

export class TeamRepository {
  async findAll(): Promise<Team[]> {
    return db.query.teams.findMany({
      orderBy: [desc(teams.updatedAt)],
    });
  }

  async findById(teamId: string): Promise<Team | null> {
    const result = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    return result || null;
  }

  async findByUserId(userId: string): Promise<Team[]> {
    return db.query.teams.findMany({
      where: (teams, { exists }) => exists(
        db.select().from(teamMembers)
          .where(and(
            eq(teamMembers.teamId, teams.id),
            eq(teamMembers.userId, userId)
          ))
      ),
      orderBy: [desc(teams.updatedAt)],
    });
  }

  async create(data: NewTeam): Promise<Team> {
    const [team] = await db.insert(teams).values(data).returning();
    return team;
  }

  async update(teamId: string, data: Partial<NewTeam>): Promise<Team | null> {
    const [team] = await db
      .update(teams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    return team || null;
  }

  async delete(teamId: string): Promise<boolean> {
    const result = await db.delete(teams).where(eq(teams.id, teamId)).returning();
    return result.length > 0;
  }
}

export const teamRepository = new TeamRepository();
