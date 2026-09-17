# Live-editing verification

**Current: simplified current-state spans, 17 September 2026.** Public MCP tools
are registered; the production editor uses ordinary Yjs updates and server-owned
saves. There is no retained-evidence opt-in or packet budget. See
[revision 22](../../plan/live-agent-doc-editing.md#current-implementation--revision-22-17-september-2026)
for exact semantics and supported scope. Historical experiments are retained below.

Run from `frontend` with installed dependencies and Chromium:

```bash
bun run e2e/schema-parity.ts
bun run e2e/doc-reconnect.ts
```

Run these sequentially; concurrent browser runners can collide on Vite's port.
The browser runner defaults to `/usr/bin/chromium`. Set `CHROMIUM_PATH` to use
another installed Chromium executable. No dependency installation occurs in these
runners. The combined workflow below additionally needs an isolated database.

## Combined authenticated live workflow

Run from `frontend` against a disposable PostgreSQL database:

```bash
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=postgresql://postgres@127.0.0.1:55440/tuesday_review bun run e2e/doc-live-workflow.ts
```

This runner uses two production editors, the real authenticated collaboration
route, public MCP JSON-RPC discovery/calls and PostgreSQL together. A real scoped
PAT authenticates search/get/patch. The runner creates and removes its users,
sessions, project, document and token, and closes browser, Vite and backend processes.

Both desktop 1280×800 and mobile 390×844 passed on 17 September 2026. It checks:

1. An original search reference patches a passage **after a human replaces it**.
   Outside edits survive 110 individual typing transactions, formatting, grouped
   undo and a concurrent agent patch.
2. Both people continue typing without repositioning their carets. Editor and
   UndoManager identities remain unchanged, with zero view destructions or errors.
3. An idempotent retry creates no second patch receipt. Public discovery exposes
   all three tools; unauthenticated requests fail. Browser and durable binary state
   converge exactly, without evidence rows or browser snapshot requests.
4. A checkpoint and socket reconnect preserve an already-issued reference and
   allow continued typing/patching without reload or editor remount.
5. Deleting/recreating the target with the same block ID rejects the original
   reference as `TARGET_GONE` and does not insert the requested replacement.

The suite uses an isolated local PostgreSQL 18.4 database. The operator separately
built and started the PostgreSQL 16 Docker image on 17 September 2026; supplied
logs confirm fresh migrations through 0057 and HTTP 200 readiness with all checks
true. The two-editor workflow was not repeated inside that container. No deployed
Tuesday workspace is used. Full backend/frontend tests, types and builds are run
separately; integration tests must not run concurrently with this runner because
the recovery tests inspect all documents in their disposable database.

## Production-editor reconnect regression

Run `bun run e2e/doc-reconnect.ts` from `frontend`. It mounts the production editor
and collaboration hook, using a controlled loopback relay and a temporary Chromium
profile. The runner closes its browser, Vite server and relay on completion/failure.

1. Preserve the mounted view, native undo/redo history and mid-paragraph caret
   across reconnect; resume typing without a click. Respect intentional outside focus.
2. Dismiss an already-open table menu during reconnect and fatal sync errors.
   After recovery, a new hover/menu must delete the correct row; undo restores it.
3. Replay both undelivered and persisted-but-unacknowledged updates while merging
   remote edits; require exact GC-normalised binary convergence and no duplicate text.
   Negotiate operation-ID ACKs and retain the same receipt identity on replay.
    Drop an ACK without closing the socket while newer operations receive ACKs:
    the oldest operation's ten-second deadline must still trigger recovery,
    without a duplicate durable operation or remounting the editor.
4. Gate snapshots on pending ACKs and requested unseen content. Ignore a stale
   snapshot raced by another writer and continue editing. Ordinary rerenders must
   preserve the snapshot debounce.
5. Keep editing locked after fatal errors while allowing local recovery download.
    A generation change with an undelivered edit must preserve that edit in the
    downloaded blocks and binary state, gate Reload until download is initiated,
    and leave replacement server history untouched. Static read-only documents
    must allow selection, clipboard copy, accessible links and link activation
    while blocking keyboard/menu mutations.

The desktop runner passed on 17 September 2026 with eleven connections, seventeen
accepted snapshots and zero view destructions. It does not use the authenticated
production WebSocket route or PostgreSQL; those have separate route/repository tests.
The relay models generation-scoped durable operation receipts. This runner does
not prove remote-only silent delivery recovery. Its legacy snapshot negotiation
also verifies compatibility with servers that do not advertise server-owned saves.
See [the correctness and recovery record](../../plan/live-agent-doc-editing.md#correctness-and-local-recovery-follow-up),
[the operation replay record](../../plan/live-agent-doc-editing.md#generation-scoped-operation-replay-follow-up)
and [the original reconnect record](../../plan/live-agent-doc-editing.md#reconnect-review-follow-up).

## Full regression results — 17 September 2026

From `backend`:

```bash
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=postgresql://postgres@127.0.0.1:55440/tuesday_review bun run test
bun run typecheck
bun run build
```

703 non-integration tests and 68 PostgreSQL integration tests passed, with no
unexpected failures. The 703 include eight explicitly expected failures of the
historical rejected witness resolver. After final receipt cleanup and a fixture
type correction, all 41 affected repository/MCP integration tests, type checking
and the compiled backend build passed again.

From `frontend`:

```bash
bun run test
bun run build
```

91 tests passed; TypeScript and the Vite production build passed. Vite reports
large bundle chunks. The desktop/mobile combined workflow, controlled reconnect
runner and schema-parity runner passed as described above. `git diff --check`
also passed. The operator subsequently verified the Docker build and PostgreSQL 16
startup using image `tuesday:live-editing-test` on loopback port 3001 with fresh
storage. This packaging smoke test is separate from the two-editor acceptance run.

## Historical experiments — not production requirements

The remaining sections record the superseded evidence-journal approach. Their
flags, limits and next-work recommendations do not apply to the production path.
The eight rejected witness counterexamples use `it.failing` to preserve their
known failures; production spans have their own positive/negative regression suite.
Experimental browser entry points remain `live-agent-doc-editing.ts` (optional
`--capture` or `--continuity`). The bridge and sync modules live beside them in
`e2e/`, outside the frontend production source/build.

### Authenticated evidence-sync contract regression

Run `bun run e2e/live-agent-doc-editing.ts --continuity --evidence-sync` from
`frontend`. This selects the two-native-undo scenario at desktop and mobile sizes;
it cannot be combined with `--capacity`.

1. Mount both real editors before initialising the retained journal, then reconcile
   its versioned baseline, generation/epoch and causal frontier in place.
2. Hold the second local edit and its ACK. Reconcile the older durable checkpoint
   while preserving that pending packet's original parents and native undo source.
3. Deliver the pending edit, reload the checkpoint, reconcile again and undo both
   edits. The original reference must remain safe and patch correctly; outside
   identities and continued typing in both mounted editors must survive.

Both viewport scenarios passed on 16 September 2026. The isolated bridge suite
also passes 14 tests / 238 assertions, covering pre-initialisation undo without an
invented source, invalid identity/ancestry, missing sources, sticky coverage loss,
combined retention overflow without eviction, and remote deletions with pending
local content. Run it with
`TUESDAY_CONTINUITY_BRIDGE_TEST_CHILD=1 bun test e2e/doc-continuity-bridge.test.ts`.

The browser runner uses the controlled relay and backend reference-model
subprocess. Authentication and durable endpoint reads are tested separately in
route and PostgreSQL suites. Production capture, actual reconnect orchestration
and the combined authenticated two-editor/MCP/database workflow remain next work.
The full checkpoint stays bounded at 8 MiB; its separate sync envelope is capped
at 12 MiB. Near-limit transfer/reconciliation load has not been measured.
See [the evidence-sync record](../../plan/live-agent-doc-editing.md#authenticated-evidence-sync-follow-up).

## Bounded capacity measurements

Run the isolated persistent worker from `backend`, one process at a time:

```bash
bun run src/collab/docContinuityCapacity.ts 32 0
bun run src/collab/docContinuityCapacity.ts 64 0
bun run src/collab/docContinuityCapacity.ts 32 150000
bun run src/collab/docContinuityCapacity.ts 64 150000
```

Run the corresponding small-fixture browser checks sequentially from `frontend`.
Allow five minutes per command for browser startup and checkpoint subprocesses:

```bash
bun run e2e/live-agent-doc-editing.ts --continuity --capacity=32
bun run e2e/live-agent-doc-editing.ts --continuity --capacity=64
bun test e2e/doc-continuity-bridge.test.ts
```

`--capacity` selects only the sustained scenario at both viewport sizes. Omitting
it runs the complete default-32 continuity matrix. The 64 browser fixture uses
twenty patch cycles, two certified no-op packets and a final edit/undo pair, so
the next safe patch must refuse exactly at capacity. Both original and post-source
fresh references, outside work, native undo, reload and post-cap convergence pass.

The worker emits JSON containing packet/checkpoint/preimage sizes, operation
p95/max latency, sampled heap/RSS growth, Linux process RSS high-water mark and
`breaches`. Exit success means correctness assertions passed; a nonempty
`breaches` array means the operating envelope failed. The worker requires Linux
`/proc`; module startup is excluded from timings, but correctness copies and
reload allocations contribute to memory. Three reload samples are diagnostic,
not a stable percentile. Browser `CAPACITY` lines report bridge hook duration,
per-page sampled heap and aggregate renderer RSS; these are not whole-task
latency or per-renderer peak attribution. Browser and backend byte accounting
cover different retained objects.

The journal now reserves complete checkpoint bytes plus 28 KiB of bounded
coverage-control capacity within 8 MiB. Packet capacity is independent of the
32-head causal frontier. Defaults remain 32; limit/refusal tests cover 128, but
the 128 workload was not run because the large-document gate failed at 32/64.
The 64/150k run retained 40 packets, reached 100.5 ms original-resolution p95 and
251.7 MiB sampled RSS growth. Its next undo evidence was refused at the byte cap.
Repeated profiling confirms that even its warm segment exceeds the memory gate.
See [the measured results and limitations](../../plan/live-agent-doc-editing.md#bounded-retention-capacity-results).

Profile that control from `backend`, sequentially in fresh processes:

```bash
bun run src/collab/docContinuityCapacity.ts 32 150000 --profile-memory=observe
bun run src/collab/docContinuityCapacity.ts 32 150000 --profile-memory=gc
```

`memoryProfile` adds per-phase numeric events and summaries for journal work,
oracle copies, convergence verification, checkpoint serialization and reload.
Segment deltas share the initial baseline; the warm segment includes oracle work.
Before/after samples are not allocation totals or exact phase peaks. Linux
high-water increments mark new process-wide records. Forced-GC mode collects
outside timing and returns `breaches: null`; use observation mode for gate checks.
`maxPostGcHeapDeltaBytes` compares collected endpoints. Bun may refresh heap
accounting during GC, so an intermediate `maxReportedHeapDropBytes` can be negative
without implying GC allocated the retained copies.

Four observational controls report 203.3–213.5 MiB total sampled RSS growth and
143.4–161.3 MiB before final checkpoint/reload. Four GC diagnostics distinguish
large temporary resolution/replay work from live verification/checkpoint copies.
All eight preserve correctness. The subsequent reuse experiment removes duplicate
per-event document materialisation during resolution while retaining full evidence.
See [the phase results and remaining attribution limits](../../plan/live-agent-doc-editing.md#allocation-profiling-follow-up).

The reuse change passes 148 focused backend tests and all 22 continuity browser
scenarios. Four new observational workers reduce original-resolution p95 to
68–78 ms from 85–89 ms. Sampled RSS growth is 213–222 MiB: this is a latency gain,
not a memory fix, and 128 remains blocked. See [the comparison and next memory
experiment](../../plan/live-agent-doc-editing.md#disposable-document-reuse-follow-up).

## Normal browser assertions

1. Two independent browser contexts/pages mount real `BlockNoteView` instances
   with the shared frontend schema and their own stable Y.Doc/Awareness. One
   binary baseline is imported once and reused; browser mounting must not change
   its canonical content.
2. Both pages type through Chromium keyboard events outside the targets. The
   backend adapter uses references inspected before those human edits and emits
   one delta containing phrase and typed-body replacements.
3. Immediately after delivery, both editors retain their focus, exact PM/DOM
   selection, nonzero window scroll, and editor scroll. Subsequent typing uses
   the retained selection, without clicking, refocusing, or resetting cursors.
4. Both clients and the relay converge in BlockNote JSON, XML, and Yjs state
   vectors. The patch, outside text, marks, links, Unicode, nested child, table,
   and code block survive. Views/documents stay attached; no remount, reload,
   reconnect, duplicate initial sync, unacknowledged update, or browser/relay
   error is allowed.
5. The complete scenario runs at desktop 1280x800 and narrow mobile 390x844.

Vite and the in-memory WebSocket relay bind only loopback interfaces.
Temporary Vite cache and Chromium profiles are removed on completion/failure;
browser contexts, browser, relay, and Vite are closed in `finally` blocks. The
adapter runs in an independent backend Bun subprocess, avoiding duplicate
Yjs/ProseMirror module graphs. Its unsigned experimental references are never
used as credentials or sent to application endpoints.

## Structural-capture assertions

`--capture` enables `capture=1` in the harness only. It records accepted local
ProseMirror root/appended batches inside ySync's Yjs transaction. Records contain
steps, an encoded prechange snapshot and structural counts, not a passage identity
or complete historical content. `safeSpanSupport` is always `false`.

1. Real Enter, Backspace and Delete exercise target splitting, new/existing
   neighbour merges and hard-break removal. Whole-target replacement and appended
   UniqueID normalisation are captured. Each ordinary received update carries
   content and its capture together, with a matching full prechange snapshot.
2. Two isolated replicas edit concurrently while a reference remains known only
   to the backend. Reversed, duplicate delivery converges without generating new
   local captures. Concurrent snapshots match each sender's causal state.
3. No-op undo adds no capture. Effective undo and redo each change content without
   a capture record. These are asserted coverage gaps, not safe undo support.
4. Binary reload with default GC preserves records and snapshot bytes. The
   snapshot reconstruction API rejects `gc:true`; this assertion does not show
   which historical content was collected. Historical reconstruction is unproven.
5. Capture stops at its 32-record budget and marks coverage incomplete, while
   human editing continues. Shared-record admission also has a 64 KiB bound;
   batches and local diagnostics are bounded. Concurrent admission is not a
   distributed quota and may overshoot before peers receive each other's records.

No resolver consumes these older capture records. The approved permanent-invalidation
policy and separate continuity mode below do not repair this mode's missing causal
content or undo capture. Net-zero PM batches, enclosing Yjs transactions and distributed quota
enforcement are not certified by the maintained runner. Missing evidence must not
be treated as proof that a span is safe.

## Continuity assertions

`--continuity` and `--capture` are mutually exclusive. Continuity mode uses
`doc-continuity-bridge.ts` and the backend `ContinuityJournal` in an isolated
subprocess. It sends complete preimages, ordered accepted steps and content as
one harness transport packet. It does not change native undo or claim that undo
outcome evidence shares the content's Yjs transaction.

1. The original reference survives both adjacent-space deletions, replacement,
    certified undo/redo and checkpoint reload. Its patch produces `beforeagentafter`.
    Target splits, boundary imports and structural undo effects invalidate affected
    references permanently; unaffected inner spans remain editable. Safe decisions
    assert exact UTF-16 endpoints. Structural positive cases also patch disposable
    checkpoint forks and check exact text, outside character/container identities,
     marks (including the same text container's prefix/suffix) and properties.
     Rejected decisions attempt a patch and verify unchanged
    binary state and retained evidence in the same fork.
2. Offline writers need no reference registration. Ordered causal evidence,
   reversed/duplicate delivery and a net-zero split/rejoin followed by immediate
    typing preserve the required decisions. Unsupported grouped/selective undo
     remains explicitly `unknown`, including its uncertified redo. A separate browser
     scenario and real-binding regression cover two separately captured outside text
     insertions followed by two native undos. The original reference remains safe
     through both undos and checkpoint reload, then patches successfully while both
     editors stay attached and continue typing. Certification requires retained serial
     source evidence and exact native Yjs cancellation, not matching visible text.
     Arbitrary multilevel undo, intervening replacements/deletions, concurrent or
     missing sources are not covered by this narrow extension.
3. Default-GC checkpoints retain preimages, causal evidence and expiry. A checkpoint
   is not compaction. Neither expiry nor reload reclaims the default 32-packet/8 MiB
   budget; capacity overrides do not reclaim evidence either.
4. Missing evidence persists as sticky incomplete coverage, even for unchanged
   binary content. New issuance and patches stop; human editing continues. Prior
   certified breaks remain decisive. Speculative/filtered transactions do not
   create false loss signals.
5. Failure regressions cover step and preimage overflow, enclosing transactions,
   child-before-parent delivery across loss, concurrent packet overflow and retry,
   and byte-budget overflow. Valid human content is preserved and acknowledged;
   malformed evidence remains rejected. Buffered content is delivered without
   inventing trusted causal ancestry.

The relay's scratch overflow validator has a separate 12 MiB one-packet budget
and an 8 MiB candidate-input cap. Real journal admission stays at 8 MiB. These
are local limits, not a distributed quota or production capacity recommendation.
References expire after 15 minutes. Relevant concurrent issuance, broad enclosing
replacement, incompatible location lineage, unsupported transforms and uncertified
undo can return `unknown`. The supported classifier is limited to direct paragraph
segments and recognised split/join/hard-break operations. Production security,
capacity and complete rich-content coverage remain gates. Evidence pruning is parked;
the bounded workflow uses full retained evidence.

The concurrent outside-edit scenarios start with `abcdef` and a reference to `bc`.
One editor deletes `a` while the other independently prepends `X`, or types `X`
then `Y` as two separate causal packets. Both delivery orders, including duplicates,
preserve the exact interval through checkpoint reload and produce `Xagentdef` or
`XYagentdef`. Outside identities and bold `def` survive; both editors keep typing.
The fallback verifies every outside-only insertion/deletion step against the mapped
passage, with original item liveness and contiguity checked in every pre/postimage
and the merged state. Backend fixtures also cover batched steps, additional branches,
successive deletions, later issuance and child-before-parent delivery. Recreated
target items, later inside/boundary steps, unsupported ancestry and structural breaks
still refuse. General concurrent inside-target editing is not established here.

The default sustained scenario alternates human writers through ten inspect/edit/native-undo/
agent-patch cycles. After one further edit and undo, 32 packets and 11 certified undos
occupy 247,111 serialized checkpoint bytes in the recorded desktop/mobile runs.
The original reference and a fresh reference issued after the final undo source
remain safe, including after GC reload. At capacity, an actual patch attempt refuses
without state/evidence mutation. Further human edits converge but make coverage
incomplete; patches and fresh issuance then refuse. This is measured availability
loss, not a successful indefinite-editing test. Byte counts can vary with Yjs IDs.

Admitted evidence stays intact. Reference age alone does not establish that native
undo no longer needs a source. Packet count limits this small fixture; the capacity
follow-up above shows that a large outside paragraph instead reaches the byte cap
and fails the memory gate. The compact-journal implementation remains parked.

The target adapter rejects multi-paragraph table cells (including headers) before
projection: BlockNote 0.49 can lose paragraph separators between differently styled
cell paragraphs. Single-paragraph cells remain supported. Unsupported embedded
`Y.XmlText` values anywhere in the document also reject inspection and patching,
including when they arrive outside an already-issued target. These refusals preserve
the supplied history; they do not repair or flatten the content.

## Backend-only rolling retention experiment

Parked. Its recorded measurements and conservative undo-source divergence are
retained below; extending this representation is not the next workflow prerequisite.

Run from `backend`:

```bash
bun test --isolate src/collab/docCompactContinuityExperiment.test.ts
```

The 31 real-library cases pass with 1,340 assertions. `CompactContinuityJournal`
stores a binary floor plus serial deltas and step evidence, then reconstructs the
existing reference model for validation. No browser mode uses this representation.

The 24-packet fixture uses about 206 KB versus 5.02 MB of serialized evidence.
A 96-edit fixture reclaims 79 old records, retains at most 17, and matches 184
live-reference decisions across GC reloads. These measure retained storage and a
bounded serial fixture, not peak memory, latency budgets or indefinite capacity.

One deliberate divergence is asserted: after an old native-undo source is
reclaimed, a newer reference becomes `unknown` where the full-history model is
`safe`. Patching refuses without mutation; fresh issuance works. Concurrent or
stale admission is rejected. The 32-event/8 MiB limits can still be reached before
TTL permits reclamation. Coverage loss is sticky, clocks must share a trusted
monotonic authority, and production integration remains blocked.

The post-fix follow-up also reran the continuity browser mode with same-container
outside-mark assertions: all ten desktop/mobile scenarios passed. The full backend
suite reported 614 passes and the same eight rejected-witness failures; its chained
database phase was not reached. Earlier frontend build/full-suite, normal/capture
and schema-parity results below were not rerun in this follow-up.

## Browser and reference-model evidence

Verified locally with Bun 1.4.0, Puppeteer Core 24.22.0 and Chromium
152.0.7977.82: schema parity passed (23 PM nodes, 11 marks, JavaScript code
default). All three browser modes passed at desktop 1280x800 and mobile 390x844:

| Mode | Observed per viewport |
| --- | --- |
| Normal | 34 human updates and one 89-byte agent delta; continued typing and editor/selection continuity |
| Capture | 35 updates applied once; 32 atomic records; 28 sequential and four concurrent pre-snapshot checks; eight reversed/duplicate frames |
| Capture limitations reproduced | One no-op undo; two effective undo/redo changes without capture; one successful post-cap edit without capture |
| Continuity main | 31 decision checks, zero mismatches; 32 packets (31 human, one agent); four duplicates across eight reversed frames; post-cap edit preserved |
| Continuity two-undos | Original reference survives two outside insertions/two native undos and GC reload; exact patch and continued typing in both editors |
| Continuity outside-ab/outside-ba | Concurrent prefix deletion/insertion in both delivery orders, duplicate packets, exact original interval/patch, GC reload, outside identities/formatting and continued typing |
| Continuity outside-keys-ab/outside-keys-ba | Separate `X` and `Y` packets concurrent with prefix deletion; exact `[2,4]` and `XYagentdef` in both delivery orders; outside identities/formatting preserved |
| Continuity sustained | Ten successful agent-patch cycles, 11 certified native undos; safe references at 32 packets, atomic capacity refusal, then preserved human editing and sticky coverage loss |
| Continuity failure scenarios | Net-zero step overflow, enclosing transaction, concurrent cap/retry and byte overflow; **22 total scenario runs** across both viewports |

Delta byte counts are observations, not assertions. Capture success means its
diagnostic assertions passed, including the known gaps; it is not span acceptance.

Run from `backend` to reproduce the current gate:

```bash
bun test --isolate src/collab/docTargetExperiment.test.ts
bun test --isolate src/collab/docTargetDiscriminator.test.ts
bun test --isolate src/collab/docContinuityExperiment.test.ts
bun test --isolate src/collab/docUndoContinuityExperiment.test.ts
```

The first reports **50 passed, eight failed** using ordinary assertions, not
`it.failing` or skipped acceptance. The second reports **eight passed, 996
assertions** proving four paired histories under GC enabled/disabled, combined
and separate reconciliation, and binary reload. Passing the counterexamples
proves the missing distinction, not a working target resolver.
The continuity suite reports **95 passed, 723 assertions** for its retained-history
scope. It does not convert the rejected candidate's eight failures into passes.

The cancellation suite adds **ten passed, 13 assertions**. The latest full
backend configured run reports **646 passed and eight failed**, 4,566 assertions.
Its chained integration phase was not reached. This run completed without the
Bun crash recorded in the earlier two-undo follow-up.
Database integration was not rerun for this local concurrency change; the separate
[2A PostgreSQL evidence](../../plan/live-agent-doc-editing.md#milestone-2a-persistence-evidence)
records 35 passing integration tests.
Backend typechecking, explicit strict harness TypeScript and the bridge wrapper
passed again in the capacity follow-up. Targeted lint now passes, including the
revised coverage-reason sanitisation. The earlier full frontend suite (78 passed,
340 assertions), build, normal/capture modes and schema parity were not rerun.
The bridge wrapper launches ten isolated real-library regressions, including the
two-undo case. Run those cases directly from `frontend`:

```bash
TUESDAY_CONTINUITY_BRIDGE_TEST_CHILD=1 bun test e2e/doc-continuity-bridge.test.ts
```

The frontend build excludes E2E files. Reproduce the strict harness check from
`frontend`; the runner imports the client types and both experiment modules:

```bash
bunx --no-install tsc --noEmit --strict --noUncheckedIndexedAccess --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler --jsx react-jsx --allowImportingTsExtensions ../backend/node_modules/bun-types/index.d.ts e2e/live-agent-doc-editing.ts e2e/doc-continuity-bridge.test.ts
```

This does not prove production MCP, database
durability, the application's collaboration hook, reconnect/acknowledgement
repair, authentication, generation fencing, or mobile IME behaviour. The
schema check compares declarative specs and function presence, not parser or
renderer function behaviour. The browser test exercises the real renderers.
