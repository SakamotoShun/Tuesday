import 'dotenv/config';
import { and, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import { db, client } from '../db/client';
import { docs, positionDocs, users } from '../db/schema';

type CleanupArgs = {
  apply: boolean;
  includeLegacyJd: boolean;
};

function parseArgs(): CleanupArgs {
  const args = Bun.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    includeLegacyJd: args.includes('--include-legacy-jd'),
  };
}

async function findTaggedOrphans() {
  return db
    .select({
      id: docs.id,
      title: docs.title,
      updatedAt: docs.updatedAt,
    })
    .from(docs)
    .leftJoin(positionDocs, eq(positionDocs.docId, docs.id))
    .where(
      and(
        isNull(positionDocs.docId),
        sql`COALESCE(${docs.properties}->>'source', '') = 'hiring'`
      )
    )
    .orderBy(desc(docs.updatedAt));
}

async function findLegacyJdCandidates() {
  return db
    .select({
      id: docs.id,
      title: docs.title,
      updatedAt: docs.updatedAt,
    })
    .from(docs)
    .leftJoin(positionDocs, eq(positionDocs.docId, docs.id))
    .leftJoin(users, eq(users.id, docs.createdBy))
    .where(
      and(
        isNull(positionDocs.docId),
        isNull(docs.projectId),
        isNull(docs.parentId),
        like(docs.title, '% - Job Description'),
        eq(users.role, 'admin'),
        sql`COALESCE(${docs.properties}->>'source', '') <> 'hiring'`
      )
    )
    .orderBy(desc(docs.updatedAt));
}

function printRows(label: string, rows: Array<{ id: string; title: string; updatedAt: Date }>) {
  console.log(`\n${label}: ${rows.length}`);
  for (const row of rows) {
    console.log(`  - ${row.id} | ${row.updatedAt.toISOString()} | ${row.title}`);
  }
}

async function run() {
  const { apply, includeLegacyJd } = parseArgs();

  console.log('Scanning for orphaned hiring docs...');

  const taggedOrphans = await findTaggedOrphans();
  printRows('Tagged hiring doc orphans', taggedOrphans);

  const legacyCandidates = includeLegacyJd ? await findLegacyJdCandidates() : [];
  if (includeLegacyJd) {
    printRows('Legacy JD-pattern candidates (review carefully)', legacyCandidates);
  }

  const ids = Array.from(
    new Set([...taggedOrphans.map((doc) => doc.id), ...legacyCandidates.map((doc) => doc.id)])
  );

  if (!apply) {
    console.log(`\nDry run complete. ${ids.length} docs would be deleted.`);
    console.log('Re-run with --apply to delete these docs.');
    if (!includeLegacyJd) {
      console.log('Use --include-legacy-jd to include older untagged JD-pattern docs.');
    }
    return;
  }

  if (ids.length === 0) {
    console.log('\nNo orphaned hiring docs found.');
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(docs).where(inArray(docs.id, ids));
  });

  console.log(`\nDeleted ${ids.length} orphaned hiring docs.`);
}

run()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
