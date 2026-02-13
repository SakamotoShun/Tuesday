import 'dotenv/config';
import * as Y from 'yjs';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { db, client } from '../db/client';
import { docCollabSnapshots, docCollabUpdates, docs } from '../db/schema';
import {
  extractSearchTextFromCollabXml,
  extractSearchTextFromDocContent,
  mergeSearchText,
} from '../utils/doc-search';

function parseArgs() {
  const args = Bun.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const docIdArg = args.find((arg) => arg.startsWith('--doc-id='));
  const docId = docIdArg ? docIdArg.slice('--doc-id='.length) : null;
  return { dryRun, docId };
}

async function getCollabSearchText(docId: string): Promise<string> {
  const snapshot = await db.query.docCollabSnapshots.findFirst({
    where: eq(docCollabSnapshots.docId, docId),
    orderBy: [desc(docCollabSnapshots.seq)],
    columns: {
      seq: true,
      snapshot: true,
    },
  });

  const updates = await db.query.docCollabUpdates.findMany({
    where: snapshot
      ? and(eq(docCollabUpdates.docId, docId), gt(docCollabUpdates.seq, snapshot.seq))
      : eq(docCollabUpdates.docId, docId),
    orderBy: [asc(docCollabUpdates.seq)],
    columns: {
      update: true,
    },
  });

  if (!snapshot && updates.length === 0) {
    return '';
  }

  const ydoc = new Y.Doc();

  if (snapshot?.snapshot) {
    Y.applyUpdate(ydoc, new Uint8Array(snapshot.snapshot));
  }

  for (const update of updates) {
    Y.applyUpdate(ydoc, new Uint8Array(update.update));
  }

  const xml = ydoc.getXmlFragment('prosemirror').toString();
  ydoc.destroy();
  return extractSearchTextFromCollabXml(xml);
}

async function run() {
  const { dryRun, docId } = parseArgs();

  console.log(`Backfilling docs.search_text${dryRun ? ' (dry run)' : ''}...`);

  const allDocs = await db.query.docs.findMany({
    where: docId ? eq(docs.id, docId) : undefined,
    columns: {
      id: true,
      title: true,
      content: true,
      searchText: true,
    },
    orderBy: [asc(docs.createdAt)],
  });

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const doc of allDocs) {
    try {
      const contentText = extractSearchTextFromDocContent(doc.content);
      const collabText = await getCollabSearchText(doc.id);
      const nextSearchText = mergeSearchText(contentText, collabText);

      if (nextSearchText === doc.searchText) {
        skippedCount += 1;
        continue;
      }

      if (!dryRun) {
        await db
          .update(docs)
          .set({ searchText: nextSearchText })
          .where(eq(docs.id, doc.id));
      }

      updatedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(`Failed to backfill doc ${doc.id} (${doc.title}):`, error);
    }
  }

  console.log(`Done. total=${allDocs.length} updated=${updatedCount} skipped=${skippedCount} failed=${failedCount}`);
}

run()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
