import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users, type User, type NewUser } from '../db/schema';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const result = await db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return result || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    return result || null;
  }

  async create(data: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | null> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async count(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    return result[0].count;
  }

  async findAll(): Promise<Array<{ id: string; name: string; email: string; avatarUrl: string | null }>> {
    return db.query.users.findMany({
      columns: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
      orderBy: [asc(users.name)],
    });
  }

  async findAllDetailed(): Promise<Array<{ id: string; name: string; email: string; avatarUrl: string | null; role: string; isDisabled: boolean; createdAt: Date; updatedAt: Date }>> {
    return db.query.users.findMany({
      columns: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        isDisabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [asc(users.name)],
    });
  }
}

export const userRepository = new UserRepository();
