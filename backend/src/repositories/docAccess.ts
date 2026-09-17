import { and, eq } from 'drizzle-orm';
import type { DbTransaction } from '../db/client';
import { docShares, projectMembers, users, type Doc } from '../db/schema';

/** Recheck after the document lock wait, on the caller's transaction connection. */
export async function assertCurrentDocAccess(tx: DbTransaction, doc: Pick<Doc, 'id' | 'projectId' | 'createdBy'>,
  userId: string, edit = false): Promise<void> {
  const [user] = await tx.select({ role: users.role, isDisabled: users.isDisabled }).from(users).where(eq(users.id, userId));
  if (!user || user.isDisabled) throw new Error('Access denied to this doc');
  if (edit && user.role === 'freelancer') throw new Error('Freelancers cannot edit docs');
  if (user.role === 'admin') return;
  if (doc.projectId) {
    const [member] = await tx.select({ userId: projectMembers.userId }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, doc.projectId), eq(projectMembers.userId, userId)));
    if (member) return;
  } else {
    if (doc.createdBy === userId) return;
    const [share] = await tx.select({ userId: docShares.userId }).from(docShares)
      .where(and(eq(docShares.docId, doc.id), eq(docShares.userId, userId)));
    if (share) return;
  }
  throw new Error('Access denied to this doc');
}
