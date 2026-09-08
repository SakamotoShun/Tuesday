import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { settings, type Setting } from '../db/schema';

export class SettingsRepository {
  async get<T>(key: string): Promise<T | null> {
    const result = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    });
    return result ? (result.value as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await db
      .insert(settings)
      .values({
        key,
        value: value as any,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: value as any,
          updatedAt: new Date(),
        },
      });
  }

  async setMany(values: Record<string, unknown | null>): Promise<void> {
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === null) {
          await tx.delete(settings).where(eq(settings.key, key));
          continue;
        }
        await tx
          .insert(settings)
          .values({ key, value: value as any, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: value as any, updatedAt: new Date() },
          });
      }
    });
  }

  async getAll(): Promise<Record<string, unknown>> {
    const allSettings = await db.select().from(settings);
    return allSettings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, unknown>);
  }

  async delete(key: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.key, key)).returning();
    return result.length > 0;
  }
}

export const settingsRepository = new SettingsRepository();
