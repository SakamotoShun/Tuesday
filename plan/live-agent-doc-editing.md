# Live agent document editing

## Current implementation — revision 22, 17 September 2026

**Status: implemented and locally verified.** The maintainer chose the simpler
current-state contract during the repository review. This section supersedes the
historical plan below, including its permanent split/undo invalidation rule,
retained-evidence requirement, opt-in flags and proposed broader operation set.
The historical experiments remain as evidence, not outstanding release requirements.

### Supported workflow

1. Discover the document, then call public MCP `search_doc` with a case-sensitive
   literal query, or `get_doc` with `includeTargets: true`.
2. Pass one returned `targetRef` to `patch_doc`, with a unique `idempotencyKey` and
   `operations: [{ type: "replace_text", targetRef, text }]`. No document version
   or saved-text precondition is required.
3. The server locks the document, rechecks access and resolves the reference in
   the current durable Yjs history. It edits that history, commits the delta and
   canonical projection atomically, then broadcasts to the existing editors.

References bind the original block and text-container identities, outward range
boundaries, document generation and MCP principal. They expire after 15 minutes.
An intervening human replacement inside the surviving range becomes the current
target. Outside edits survive; repeated text never triggers a search fallback.
Deleted/recreated containers, even with the same block ID, return `TARGET_GONE`.
A currently collapsed interval also returns `TARGET_GONE`; incompatible structure
or formatting returns `TARGET_UNAVAILABLE` without changing content.

**Deliberate semantic boundary:** this checks current identity and boundaries,
not the history of every editing gesture. Delete/reinsert inside the same live
text container can be indistinguishable from an intended human replacement. A
split followed by undo is not permanently disqualified if the reference resolves
safely now. The server never reconstructs a missing target from saved text.

The live API supports one homogeneous-format span in a paragraph containing one
direct text container. Search reports unsupported matches without references.
Replacement is plain text (empty text deletes), at most 16,384 UTF-16 units, with
no structural line breaks. Search queries are at most 512 UTF-16 units; pages
default to 10 results, maximum 20, with offsets through 1,000. Signed references
are capped at 4 KiB and tool responses at 1 MiB. Body replacement, block structure
changes, cross-format spans and multi-operation batches are outside this release.

### Runtime and persistence

- `backend/src/collab/docSpan.ts` is the production resolver. It has no dependency
  on the experimental witness resolver or continuity journal.
- Public `get_doc`, `search_doc` and `patch_doc` use the existing MCP authentication,
  scopes, transaction/idempotency and audit infrastructure. Existing overwrite
  tools retain their collaborator guards and version contracts.
- Human editing uses ordinary Yjs updates. There are no production preimage
  packets, undo certificates, evidence-sync requests or 32-packet targeting limit.
  Normal trailing paragraphs are restored. Historical capture code is in `e2e`.
- The server owns durable checkpoints and canonical projection. `doc.sync`
  advertises `persistence: "server"`; updated clients stop sending snapshots.
  Legacy-server snapshot compatibility remains, and a mismatched legacy snapshot
  no longer forces a reload. Generation-scoped operation IDs and ACK replay remain.
- Mounted editor, focus and undo continuity survive reconnect. Keyboard-only
  reconnect now avoids calling BlockNote's side-menu dismissal before that menu
  has initialised. Empty-document projection preserves the existing binary history.

### Completion evidence and limits

The authenticated two-editor runner now calls the **public MCP JSON-RPC route**,
not a staged adapter. Desktop 1280×800 and mobile 390×844 both pass: search, human
replacement of the target, 110 individual outside typing transactions, outside
formatting and grouped undo, concurrent patch and continued typing, idempotent
retry, durable binary equality, checkpoint/reconnect and reuse of an older
reference, then deletion/recreation with the same block ID and refusal of the old
reference. Both editors retain their original view and UndoManager, with zero
view destructions or browser errors. No evidence row or browser snapshot is used.

All 68 PostgreSQL integration tests pass, including access revocation while
waiting for the document lock, replay, transaction rollback and generation reset.
The controlled reconnect regression and backend/frontend schema parity also pass.
Commands and current full-suite results are recorded in `frontend/e2e/README.md`.
Tests used an isolated local PostgreSQL 18.4 database. On 17 September 2026, the
operator also built `tuesday:live-editing-test` and started its PostgreSQL 16
container with fresh storage. Supplied logs confirm migrations through 0057 and
`GET /ready` returning HTTP 200 with all checks true. The combined two-editor
workflow was not repeated inside that container. No production migration or
deployment was performed.

Existing pending migrations 0056/0057 still supply generation/projection fields
and durable operation receipts. The experimental evidence table is unused by the
runtime; removing it is unnecessary for this change. Operation receipts remain
generation-scoped. This does not add crash-proof browser storage, remote-only
silent-loss detection or multi-process broadcast. Exceptional generation changes
retain the existing recovery export instead of replaying into replacement history.

## Historical plan and experiment record — superseded

Everything below records earlier decisions and measurements. References to
"current", "next", flags, ordinary failing experiments and release requirements
below describe those historical revisions, not revision 22.

The supported single-span workflow now passes end to end: two production editors keep typing while a staged MCP handler patches a passage through the authenticated collaboration route and PostgreSQL. Both editors preserve outside edits, caret position and mounted view, converge with durable state, and continue typing after the patch. Desktop and mobile checks pass. See [the combined workflow evidence](#combined-production-editor-workflow). Capture and atomic content/evidence delivery are opt-in; targeted MCP tools remain unregistered in the public server.

**Status:** Implementation plan, revision 21, 16 September 2026. Persistence, staged signed-reference handlers, durable operation replay, local recovery, evidence sync and the opt-in production-editor single-span workflow are implemented. Broad writer/undo coverage, sustained availability, remote-only lost-delivery recovery, whole-body references, multi-operation patches and public activation remain incomplete. The full-evidence journal default remains 32 packets/8 MiB; operation receipts are separate records retained for the collaboration generation. Current focused checks pass; previous full-suite results remain 659 backend passes with eight rejected-witness failures and 84 frontend passes. No deployment or production migration has been performed.

**Owner:** Tuesday maintainer, including corrections 1 to 7 before milestone 1. No personal maintainer name was supplied or established from repository metadata. Record the maintainer's name, implementing engineer, and independent human technical reviewer before release; agent review does not substitute for that approval.

**Readers:** Backend and frontend engineers implementing the change, and the maintainer deciding whether to release it. Assumes familiarity with TypeScript, PostgreSQL transactions, and the existing document editor. This is not an executable production migration runbook.

**Consequence:** Data-integrity and availability change. Incorrect target resolution or resetting collaboration history can discard human work. Production enablement requires the integration evidence and recovery rehearsal below.

## Agreed outcome

An agent finds a passage, receives a reference to that passage, and patches it while people keep the document open and continue typing. The normal path is **search, inspect, patch**, not fetch and rewrite the whole document.

1. Apply a patch to the current surviving target. Do not reject it merely because the document version or target text changed after the agent read it.
2. The agent may overwrite intervening human edits inside its chosen target. Changes outside that target must survive.
3. Humans stay connected. No routine exit, edit lease, approval dialogue, or forced reload is needed for an agent patch.
4. A missing target is not permission to restore old content, recreate a deleted block, widen the edit, or guess another occurrence.
5. Human edits arriving later or from an offline client merge normally through Yjs. This is not strict server-arrival last-write-wins for every keystroke.

Here, **current** means the server's durable Yjs state at the patch transaction's locked read. It cannot include browser-only edits that have not arrived. Two agent patches against the same surviving body target apply in database lock order; a later human Yjs update may still change the result.

Example: an agent targets a paragraph about a deadline. A human corrects that paragraph before the patch commits. The agent's paragraph-body replacement replaces the current body, including that correction. A human edit to the following paragraph survives. If the targeted paragraph was deleted, the agent receives `TARGET_GONE` and changes nothing.

## Scope and boundaries

The release covers live document inspection, document-scoped text search, targeted text/body edits, explicit block insertion/deletion, durable persistence, and delivery to authenticated collaborative editors. Existing project access, personal-document shares, admin access, and freelancer read-only rules remain authoritative.

The following work is deliberately excluded:

1. Strict human/agent last-write-wins ordering, mandatory suggestions, edit approvals, and per-block locks. These contradict the agreed interaction model.
2. A new editor, collaboration server, queue service, or multi-instance broadcast system. Tuesday currently has one serving collaboration process; revisit if deployment topology changes.
3. Live public-link viewers, metadata push notifications, whiteboards, and database-document schema editing. They use different contracts and are not necessary for live body patches.
4. A universal offline outbox or revision-history UI. Preserve pending browser work during catch-up and expose recoverable exceptional reset failures, but do not claim crash-proof browser-local storage or permanent undo history.
5. Arbitrary cross-block text spans, moves, table restructuring, and type conversion through the initial patch API. Extend only when identity and rich-content tests prove the intended behaviour.

This plan supersedes the whole-document optimistic-concurrency rule in [mcp-server.md](mcp-server.md) **only for the new live patch tool**. Task mutations, document title edits, and existing explicit overwrite tools keep their published contracts unless separately migrated.

## Why the current path cannot be relaxed

| Inspected code | Current behaviour and implication |
| --- | --- |
| [Document service](../backend/src/services/doc.ts), `getDoc`, `appendDocBlocks`, `editDocBlocks`, `writeDocBlocks` | Reads canonical JSON. Body mutations operate on that JSON under an exclusive reservation, rather than editing the shared Yjs state. |
| [Collaboration hub](../backend/src/collab/hub.ts), `reserveContentMutation`, `beginCollabWrite` | Any connected client blocks external body changes. The collaboration-write counter is not a serial execution queue. |
| [Document repository](../backend/src/repositories/doc.ts), `updateContentIfVersionAndResetCollab`, `updateContentAndResetCollab` | Both lock the document, check pending history, write JSON, increment version, and delete collaboration snapshots and updates. Only the first checks `expectedVersion`; hiring and policy body writes use the second. |
| [Collaboration repository](../backend/src/repositories/docCollab.ts), `appendUpdate`, `persistCanonicalSnapshot` | Human updates are durable before broadcast, but canonical JSON/version currently advance separately through verified browser snapshots. |
| [History utilities](../backend/src/collab/docHistory.ts) and [sync](../backend/src/collab/sync.ts) | Already reconstruct and compact the original binary Yjs history with bounded replay. Reuse these mechanisms. |
| [Editor](../frontend/src/components/docs/block-note-editor.tsx) and [collaboration hook](../frontend/src/hooks/use-doc-collaboration.ts) | A mounted editor uses one Y.Doc. REST refetch does not replace that body. Remote `doc.update` messages already merge in place. |
| [Collaboration route](../backend/src/routes/collab.ts), snapshot handler | Repeated snapshot staleness or state mismatch can currently force reload. More live writers would exercise these races. |
| [Search repository](../backend/src/repositories/search.ts) | Workspace search uses persisted `searchText`; discovery snippets are not edit anchors. |

The direct baseline, removing the active-client guard, fails because it leaves browsers editing a history that the agent has just deleted. Replacing `expectedVersion` with a looser check does not fix this. The chosen change is to apply agent operations to the **same binary Yjs history** and broadcast the resulting delta.

## Agent-facing contract

Tool names and fields below are proposed additions, not claims about the currently available MCP tools. Keep the surface to two new tools; extend the existing `get_doc` read rather than adding a second full-document read tool.

| Tool | Input and result |
| --- | --- |
| `get_doc` | Keep the existing `docId` input and canonical block response. Materialise pending durable history before returning. Add `collabSeq`, `readAt`, and a separate bounded target-reference map, without putting transport references into persisted blocks. |
| `search_doc` | Accept `docId`, a nonempty literal `query`, optional case sensitivity, and bounded pagination. Return occurrences with excerpt, block context, explicit target scope, and references from one current durable state. |
| `patch_doc` | Accept `docId`, required `idempotencyKey`, and an ordered array of typed operations using issued references. No `expectedVersion`, expected-text hash, or automatic fuzzy replacement. Return a compact operation receipt with committed `collabSeq`/`version`, affected IDs, and operation outcomes, without document excerpts. Use a fresh read/search to inspect resulting text. |

Workspace search remains document discovery. An agent must inspect/search the selected live document before patching. Repeated text yields separate matches and separate references; there is no implicit replace-all. Pagination is advisory over a changing document, not a frozen global search snapshot. Every page reports its observation point and can contain moved or repeated results after intervening edits.

Initial proposed limits: 100 search matches per page, 100 operations per patch, 4 KiB per encoded reference, and 15 minutes reference validity. Use existing block/depth/body-byte and Yjs limits as stricter outer bounds. Confirm these defaults with fixtures and load tests before freezing the schema. Large `get_doc` responses must state when references are truncated; use scoped search rather than silently omitting access to later content. Search literal text only initially; avoid unbounded regular-expression execution.

Example request shape, with explanatory placeholders rather than usable references:

```json
{
  "docId": "<discovered document UUID>",
  "idempotencyKey": "deadline-correction-2026-09-11-01",
  "operations": [
    {
      "type": "replace_text",
      "targetRef": "<span reference returned by search_doc>",
      "text": "18 September"
    }
  ]
}
```

### Target scope is explicit

| Operation | Scope and preserved content |
| --- | --- |
| `replace_text` | Replace the current resolved interval inside one supported inline container. Preserve all text outside it. An empty replacement deletes the interval. |
| `replace_body` | Replace the inline body of the same surviving block instance, even if all its original text was replaced. Preserve block type, properties, children, and outside blocks. Use typed inline content, not a whole-block replacement. |
| `set_props` | Change only named, schema-supported block properties. No implicit body or subtree replacement; no generic document-metadata editing. |
| `insert_blocks` | Insert validated blocks before/after a surviving block anchor, or at an explicitly issued document start/end anchor. Distinct from replacing a collapsed text span. |
| `delete_block` | Explicitly delete the current block and its descendants. The destructive scope is visible in the tool description and search/read target metadata. |

Do not return a paragraph-body reference disguised as a precise search-match reference. Search results may offer both, labelled separately. An agent correcting one phrase should use the span; rewriting the paragraph requires selecting its body reference.

Plain-text replacement must not flatten surrounding marks, links, code, tables, or embedded content. Define deterministic insertion marks in the adapter: inherit the marks at the start of a nonempty target, do not extend a link outside its existing boundary, and preserve all outside marks. Reject spans crossing incompatible inline nodes or mark boundaries until supported with explicit fixtures; never silently widen them. `replace_body` can carry explicit typed inline content for intentional formatting changes.

Resolve and validate all operations against one locked starting state. Reject overlapping ranges, duplicate destructive targets, ancestor/descendant conflicts, and insertion anchors deleted by the same batch. Apply disjoint text edits right to left or explicitly map their positions. Do not support referencing blocks newly created earlier in the same request initially; return their IDs and obtain references through a fresh read. The entire batch commits or none of it does.

### What a reference guarantees

1. Encode the block container and, for spans, its inline container using public Yjs relative-position APIs. Milestone 1 must fix and test the exact encoding before token fields are frozen.
2. Bind these encoded identities to document, generation, MCP principal, target kind, and logical block ID in a signed bounded token. Span references also carry start/end anchors; document boundary references grant insertion only.
3. Resolve against the locked current Y.Doc without following local undo recreation. Check the actual resolved types, block ID, and live ancestry from `prosemirror` before applying the operation.
4. For spans, use outward association: start associates left and end associates right. Apply to the resulting interval, including replacement text and boundary insertions, rather than saved text.

**Revision-2 identity candidate:** `Y.createRelativePositionFromTypeIndex(container, 0, -1)` anchors to the beginning of the integrated container itself. In the inspected implementation it encodes the nested type identity without anchoring to one of its children. Use public encode/decode APIs and `Y.createAbsolutePositionFromRelativePosition(ref, doc, false)`; validate reachability through live XML traversal. This avoids application access to private `_item` IDs and the risk of a parent-position anchor sliding onto a neighbouring element. The local fixtures now cover the block `Y.XmlElement` and inline `Y.XmlText`, including empty containers, binary reload, compaction, and garbage collection; see [the evidence](#milestone-1-local-evidence). Container identity passed those fixtures, but span semantics after splits/merges did not. Do not substitute logical IDs or treat container identity alone as milestone acceptance.

**Constraints:** Relative positions track locations, not semantic intent. Non-null resolution alone is not proof of liveness. A recreated block with the same logical ID is a different target. Ordinary snapshots, compaction, versions, and unrelated edits must preserve references to surviving targets. A moved block follows only when its container identity survives; BlockNote moves can delete/reinsert it.

An empty former nonempty interval, missing container, crossed endpoints, incompatible ancestry, or an unresolvable allowed interval returns `TARGET_GONE` or `TARGET_UNRESOLVABLE`. It does not authorise insertion. Milestone 1 must verify these boundaries with actual BlockNote XML text, not only a standalone Y.Text probe.

**Known limit:** deleting a phrase and inserting new text into the same surviving gap can be indistinguishable from replacing the phrase. This design treats a nonempty outward-anchored interval in the same surviving container as the current target. It does not promise to recognise the user's semantic intent. If that boundary rule cannot pass the acceptance fixtures, do not ship span replacement by silently falling back to paragraph replacement. Return the unresolved case to the maintainer; editor-maintained semantic passage identity would be a separate design change.

Use a versioned token format with fixed algorithm/purpose, strict decoding, bounded fields, expiry, and constant-time signature verification. Derive a domain-separated signing key from a securely configured installation secret; never use the known development `SESSION_SECRET` fallback. Disable reference issuance with an actionable configuration error if no safe signing key is available. Reuse PAT token identity and OAuth user-plus-client identity from existing idempotency code. Do not bind to the rotating OAuth access-token string.

**Approved continuity extension, revision 5:** Preserve originating edit evidence before Yjs reconciliation, independently of issued references. Transport the selected interval through certified causal edits in its original surviving container. A proven passage-breaking split or import permanently invalidates an already-issued reference, even after undo restores the text. A fresh reference is assessed from its own issuance state; undo can itself break that newer passage. Ordinary replacement, boundary insertion, outside deletion and certified ordinary undo must not become structural breaks. Missing or unsupported evidence returns `unknown` in the experiment and never authorises a patch. This policy is approved; general concurrent lineage and bounded production retention are not yet proven.

References are not credentials. Every read, search, write, and receipt replay still requires current token scopes and resource access. Do not log reference tokens or document excerpts. Key rotation invalidates outstanding references, not document history or committed idempotency receipts. No reference table is needed.

## Persistence and editor design

### One durable edit transaction

Build on [docCollab.ts](../backend/src/repositories/docCollab.ts), accepting an existing Drizzle transaction when called from [MCP idempotency](../backend/src/mcp/idempotency.ts). Do not nest public repository functions that start independent transactions while the outer transaction holds the document row lock.

1. Authenticate, check scope/access, validate bounded input, and obtain the transaction-scoped idempotency advisory lock. A matching committed request returns its receipt after current authorisation; a changed payload with the same key is rejected.
2. Lock the document row. Recheck its current access context and generation. Ensure a persisted baseline exists, load complete bounded durable history, and materialise a disposable Y.Doc from those binary bytes. If compaction is necessary, prepare/reload safely; never treat a bounded prefix as the current document.
3. Resolve every target against that state. Mutate text at the exact resolved Yjs interval; use mapped ProseMirror transactions for supported structural operations. Derive/validate the result. Do not read current content outside the lock and append a precomputed patch later.
4. Atomically persist the Yjs delta, canonical JSON, search text, canonical sequence, version change, mutation audit record, and idempotency receipt. A validation or target error rolls back the entire operation, including preparation performed inside this transaction.
5. Commit before broadcasting the ordinary `doc.update` envelope with authenticated `actorId`. Broadcast failure cannot turn a committed mutation into a second execution; catch-up supplies missed data.

Use one lock order everywhere: idempotency lock when applicable, then document row. Keep authorisation consistent with existing project/personal-share rules; test access revocation and project deletion while a request waits. Do not introduce a second uncoordinated document mutex or use room occupancy to decide correctness. The existing collaboration-write reservation can still exclude legacy resets without excluding human clients.

Require an idempotency key on every new patch, including deletes and replacements. Store the exact compact response with the mutation using the existing idempotency table and its transaction-scoped advisory lock. Check committed receipts before reference expiry validation so a timed-out successful request remains recoverable after its reference expires. A receipt is the original committed result, not a claim about current content. Fresh reads provide fresh references.

**First-release retention decision:** Accept the existing absence of time-based expiry or pruning. The table has `createdAt`, no expiry column, and no application cleanup job. Receipt count and storage can grow without bound for surviving principals. Token/user foreign-key cascades can remove records, and database restoration can rewind them; deduplication lasts only while the receipt exists. Keep new patch receipts free of excerpts, full bodies, and reference tokens. Bound their size by the operation limits and measure table growth during rollout. The maintainer must record an acceptable storage budget before release; exceeding it triggers a separately reviewed retention policy with an explicit retry window, not silent pruning. Indefinite retention of document excerpts is not part of this decision.

### Canonical state belongs to the server

Require locked projection on `get_doc`, document-scoped search, and agent mutation. Read-time repair covers both pre-upgrade and ordinary canonical lag, so current reads never depend on a writable browser. Agent writes persist their result, search text, and canonical sequence atomically with the patch and receipt. Human updates remain durable before acknowledgement regardless of when their JSON projection is written.

**Preferred baseline for milestone 2:** Project on reads and agent writes; refresh workspace discovery search through bounded server-owned debounced or checkpoint-time projection. This avoids an extra SQL body/search-index write on every human update. Workspace search may lag, and is discovery rather than an edit reference; scoped reads/search remain current. Benchmark the refresh bound, including a final edit with no later browser or checkpoint activity, and record it before release. Backfill existing lag in bounded batches.

**Alternative retained for measurement:** Project on every accepted human update, reusing the Y.Doc already materialised for validation. This keeps workspace search current after each commit but increases row-lock time, JSON writes, and search-index work. It is not rejected or selected in advance. Milestone 2 compares both schedules on the same workloads and records the chosen schedule, search-freshness bound, and operational cost. Prefer read/agent-time projection if it meets those budgets; choose per-update projection only with evidence for its added cost.

For either schedule, derive content from a complete durable state under the document lock. Persist projection with its exact `canonicalCollabSeq`, never marking newer updates as projected. Increment `docs.version` only when projected content changes, or according to an existing explicit legacy mutation contract. A duplicate update or ordinary compaction must not manufacture a body change. Server-owned checkpoints and projection replace browser snapshots as the save coordinator.

Retain server-generated same-history checkpoints and bounded compaction independently of whether JSON changed. Preserve the existing 1 MiB update, 2 MiB sync payload, and 200-update replay limits unless measured evidence justifies a separately reviewed change. Do not disable Yjs garbage collection globally. Checkpoints are replay optimisation, not permanent user recovery history.

Benchmark both schedules for lock waits/hold time, human acknowledgement latency, read/patch latency, SQL/search-index writes, and memory. Include 20-client reconnect and anomaly-repair bursts contending with typing, repeated scoped searches, and near-limit history requiring compaction. A failed budget requires a recorded scheduling decision, not browser-dependent canonical saves or stale scoped reads.

### Targeted Yjs adapter

**Pre-experiment dependency baseline (revision 2):** BlockNote 0.49.0; backend Yjs 13.6.29 and frontend Yjs 13.6.31, despite both manifests declaring `^13.6.29`; y-prosemirror 1.3.7 was then only transitive in the backend. The backend lacked `@blocknote/code-block`: core supplies a default code block, but the browser configures it using that separate package's options. Default code-block support is not evidence of schema parity. These dependency gaps were addressed locally as recorded in [the evidence](#milestone-1-local-evidence).

**Milestone-1 prerequisite (completed locally):** Both manifests and lockfiles now use exact Yjs 13.6.31, with schema-affecting BlockNote packages pinned consistently at 0.49.0. Backend y-prosemirror 1.3.7 is declared directly and the matching `@blocknote/code-block` dependency supplies browser-equivalent options to the experiment. The resolved graph and declarative schema parity were checked before adapter work; remaining transitive differences and test limits are recorded below. The production backend projector was not migrated.

Use operation-aware mutations. For `replace_text`, resolve the exact interval in its original `Y.XmlText` and delete/insert there with explicit mark attributes inside a Yjs transaction. Preserve untouched character identities, including repeated characters. For disjoint operations in the same container, resolve them against the starting state and apply from right to left, or map positions explicitly without rebuilding intervening text. Validate the resulting ProseMirror/BlockNote structure before persisting.

For supported structural edits, use `initProseMirrorDoc(fragment, schema)` to retain Yjs-to-ProseMirror mappings, targeted transactions, and `updateYFragment` only where fixtures prove outside-target identity preservation. Reuse BlockNote's exported transaction helpers where their semantics fit. A headless BlockNote editor can supply a schema; merely enabling its collaboration option does not prove it is bound to Yjs without an EditorView lifecycle.

Do not rely on `updateYFragment`'s final-string diff for exact text targeting. Its installed text reconciler can turn deleting the first `a` from `aaa` into deleting the last `a`, or delete/reinsert unchanged text between two disjoint replacements. Equal final text is not sufficient: later human edits must refer to the correct surviving characters. If a structural operation would invoke such a diff outside its declared target, implement the specific mutation or reject that unsupported operation.

`updateYFragment` is exported but marked private/unstable. Isolate this dependency in one adapter. Test untouched CRDT identities, not merely equal output JSON. Initial conversion can normalise malformed nodes; compare the disposable state before/after initialisation and reject unexpected mutations before making the requested patch.

Never rebuild the edited document with `yDocFromBlocks`, `blocksToYDoc`, or the initial-import `blocksToYXmlFragment` shortcut. Their fresh identities or missing mappings do not establish preservation of unrelated collaborative edits. Compatible in-place edits must preserve original nodes; explicit deletion may remove its target.

Match the browser's code-block schema and validate tables, nested blocks, links, and other supported content. BlockNote helper quirks such as empty content/children not clearing are test cases, not assumed semantics. Preserve supported opaque fields using [docContent.ts](../backend/src/collab/docContent.ts). On intentional replacement, merge metadata against the operation's intended result, not the old target, so explicitly removed fields do not reappear. Do not claim arbitrary unknown inline metadata is supported.

### Delivery and snapshot races

1. Broadcast committed agent deltas through the existing WebSocket to every room client, including other clients of the same user. Apply them to the mounted Y.Doc, preserving focus, selection, scroll, and pending local work.
2. Fix the verified acknowledgement defect: give local updates stable generation-scoped IDs and retire only the acknowledged entry. Keep IDs across retries and preserve dependency order with ordered per-socket writes/replay. Duplicate or delayed acknowledgements cannot discard a different pending update.
3. Repair in place on reconnect or a detected anomaly, not on a fixed per-client polling timer. Candidate anomalies are a reported delivery failure, unresolved sync dependencies, or acknowledgement timeout. Return a bounded state-vector delta including deletions and preserve unacknowledged local edits.
4. Replace browser-owned canonical saves with the server projection/checkpoint schedule selected in milestone 2. Stale or locally ahead snapshot hints must not cause routine reload; only durable server history supplies canonical content.

**Provisional delivery design:** Finalise anomaly signals, timeout/rate limits, hint compatibility, and save-state UI after milestone 1; benchmark repair load in milestone 2. The default has no 30-second catch-up cadence. Twenty clients on that cadence would add 40 requests per minute per document, potentially clustered. `loadSyncState` locks the document and reads bounded history; ordinary sync returns stored bytes, while compaction reconstructs state. State-vector delta generation would add reconstruction unless state is reused. This competes with `appendUpdate` on the same row; it is a source-supported contention risk, not measured overload.

If event-triggered repair cannot meet measured latency or reliability needs, evaluate a hub-held materialised state before introducing periodic work. Any future cadence must be justified by the benchmark, coalesced per document, and avoid one locked reconstruction per client tick. Do not add a cache or timer merely to complete the design before the identity experiment.

**Delivery constraints:** A detected send or post-commit broadcast failure must request repair or close the affected sockets to force reconnect; merely logging it is not recovery. A process crash already closes sockets. A silent missed delivery with no detectable signal has no bounded repair time under the event-only baseline; it repairs on the next reconnect/anomaly. Record that limit and test failure signalling before release. No durable broadcast queue is proposed for the current single process.

State vectors do not express deletion coverage: include delete information even when vectors match. SQL sequences are table-wide and messages can be reordered, so gaps or `max(seq)` alone neither detect missing state nor prove completeness. The hook must not advance observed state because a snapshot/checkpoint request names a sequence. Keep actual update validation, sizes, dependency checks, permissions, and generation fencing strict. Soft repair must not clear pending work; an exceptional malformed local update needs an explicit recovery path. Per-socket ordering protects dependencies, not global human/agent last-write-wins.

## Existing tools and history resets

Ship the new contract alongside existing tools. Do not silently remove `expectedVersion` from shipped append/edit/write tools. Advertise `patch_doc` as the normal edit path and explicitly label legacy full-body replacement as a deliberate overwrite requiring its current safeguards. Existing clients remain supported, not reinterpreted.

While legacy reset writers remain, add a server-owned `collab_generation` UUID to `docs`. This changes only when binary collaboration history is destroyed/reseeded or rewound through recovery, never on normal updates, projection, or compaction. Set it for existing documents through a Drizzle migration without rebuilding their content/history. No index or reference store is needed for reads already keyed by document ID.

Rotate the generation in every destructive reset transaction, including [document repository](../backend/src/repositories/doc.ts) writers and [legacy reconciliation](../backend/src/db/reconcileDocCollab.ts). Inventory REST document bodies, [hiring](../backend/src/services/hiring.ts), [policy](../backend/src/services/policy.ts), and any direct repository callers. Keep their active-client and pending-history guards until each writer is migrated or retired.

Carry the generation in browser sync, update, snapshot-hint, and catch-up messages. Reject old-generation writes before applying bytes. On reconnect after an exceptional reset, do not replay an old Y.Doc into the new generation; show a recovery state preserving/exporting pending local content before loading the replacement. Never auto-apply recovered content. This exceptional history-change rejection is not a routine stale-version conflict.

Roll out protocol-capable browsers before enabling live patches or generation-enforced reset behaviour. Drain old sessions at the controlled deployment boundary; block legacy body writes from clients that cannot supply the generation rather than guessing it for reconnecting clients. A planned upgrade refresh is distinct from asking people to exit documents for normal agent edits.

Migrating old append/edit tools to same-history operations is follow-up work once their complete block-replacement contracts are supported. Full-body overwrite stays explicitly destructive; it must never be used as an automatic fallback when a targeted patch fails.

## Failure behaviour

The new errors below are proposed stable MCP codes. Use the existing error envelope and avoid disclosing private document existence before authorisation.

| Condition | Required behaviour |
| --- | --- |
| Human edit elsewhere or inside a surviving supported target | Apply to the current target; no version/text-CAS rejection. |
| Deleted block/container or empty former nonempty span | `TARGET_GONE`; no mutation or resurrection. |
| Unsupported split/merge, incompatible move, crossed or ambiguous span | `TARGET_UNRESOLVABLE`; inspect again and choose a current target, never fuzzy-retarget. |
| Malformed/tampered reference, wrong principal/document, expired reference | Reject with a bounded validation/reference error. A new mutation needs a fresh authorised read. |
| Generation changed | `DOC_HISTORY_CHANGED`; no mutation. Browser recovery must not replay the old history. |
| Duplicate key and same payload | Reauthorise and return the committed receipt without rerunning. |
| Duplicate key and different payload | Existing `IDEMPOTENCY_KEY_REUSED`; no mutation. |
| Validation, payload, or batch-overlap failure | Whole transaction rolls back; report the operation index where safe. |
| History needs compaction or lock timeout | Bounded retryable busy result. Retry the identical request/key, not a rewritten whole document. |
| Commit succeeds but response/broadcast fails | Receipt retry proves commit; state-vector catch-up repairs delivery. No duplicate edit. |
| Scope/access revoked, disabled user, freelancer write | Existing access denial, including on replay. No saved receipt or reference bypasses it. |

## Implementation milestones

Complete these in order except for the approved 2A persistence groundwork, which may proceed alongside the remaining milestone-1 continuity work. Each milestone produces evidence before the next expands the affected surface. No production data or tool changes are part of writing this plan.

Milestones 3 and 4 are provisional implementation sketches pending milestone-1 identity evidence and the milestone-2 benchmark. Tool limits, reference layout, repair triggers/cadence, snapshot-hint compatibility, and UI details may change with that evidence. Generation fencing is required for data integrity, and exact acknowledgement matching fixes a verified defect; neither depends on a speculative performance benefit. Preserve the approved interaction and safety constraints while revising the sketches.

### 1. Prove live target identity

**Objective:** Establish the principal technical risk before repository or protocol changes.

**Files:** Both `package.json` files and Bun lockfiles for dependency alignment; a focused adapter and real-dependency tests under `backend/src/collab/`; the schema in `frontend/src/components/docs/block-note-editor.tsx` as the parity reference. Add a browser integration harness if existing tests cannot mount real BlockNote instances.

1. Align and pin dependencies as specified above. Verify the resolved graph and browser/backend schema parity before writing the adapter.
2. Pin the public-API container-identity encoding. Prove block and inline-container references survive binary reload, compaction, and GC while deleted/recreated containers cannot retarget to neighbours or the same logical ID. Include a deleted but not yet garbage-collected container whose relative position still resolves non-null: live-ancestry traversal must reject it without mutation, alongside the recreate-same-ID rejection fixture.
3. Materialise an existing binary Y.Doc and apply phrase/body edits without resetting history. Cover actual BlockNote replacement/deletion boundaries, first-character deletion in `aaa`, two disjoint edits, delayed outside-target edits, rich content, empty bodies, and unexpected normalisation.
4. Connect two actual editors, type outside the target, inject the agent delta, and continue typing. Verify convergence, preserved selection/focus outside the target, and no remount.
5. Record the tested identity encoding, versions, schema, and adapter results. Revise provisional milestones 3/4 from this evidence; block expansion if target semantics or outside-content preservation fail rather than widening the edit scope.

**Exit:** Real-library and browser evidence, not mocked editor tests, proves the agreed normal path. This experiment is local and reversible.

**Current gate:** Blocked for production expansion. The normal path and scoped continuity prototype pass their maintained checks. The rejected witness candidate retains five false rejections and three false acceptances as ordinary failures. The new prototype does not yet cover the complete target, retention, concurrency or production integration contract.

### 1A. Assess span continuity without weakening the contract

**Authority and scope:** Authorised by the user's "Implement" instruction following the focused follow-up plan. Local adapter tests, a bounded editor-capture prototype, the existing browser harness and this evidence record only. No repository, MCP, production collaboration protocol or guard changes.

1. Correct the witness-candidate fixtures before judging it. Require both permitted edits to succeed and prohibited structural changes to fail without mutation; do not use expected failures, skips or either-outcome assertions.
2. Bound the initial public-Yjs discriminator investigation to two engineering hours. Compare common issuance states and references across permitted/prohibited histories, including binary replay and GC. Require a decision rule, not merely different text or bytes.
3. If current-state evidence is insufficient, prototype accepted ProseMirror batch capture before final-string reconciliation. Test same-update content/evidence delivery, span-local interpretability, offline unknown references, replay and boundedness. Do not add private-ID access, text/version CAS, reference registration, disabled GC or an unbounded event log.
4. Exercise real keyboard structural edits, undo/redo, concurrent and duplicate delivery in both viewports. Preserve the mounted editor and normal harness path. Undo that recreates a container cannot retarget; the policy for structural undo retaining the container requires an explicit decision.
5. Stop resolver integration if capture cannot satisfy the contract. Record failures without rejecting all unrelated changes, silently trusting missing evidence or widening the target to a body. Obtain independent technical assessment of the evidence.

**Result:** The stop condition was reached. Four byte-identical history pairs rule out a contract-complete current-state-only discriminator. Ordinary local capture is demonstrated, but undo coverage, durable causal prechange evidence and span-local interpretation remain unresolved. This is completed experimental work, not milestone-1 acceptance; see [results](#milestone-1a-local-evidence).

### 1B. Build and verify retained-evidence continuity

**Authority and scope:** The user's "approve. Plan and build" approves the policy above and this local follow-up. Work is limited to `docContinuityExperiment.ts` and its tests, the opt-in E2E bridge/client/runner and regression tests, and this plan/README. Production repositories, collaboration hooks/routes, MCP tools and guards remain unchanged by this follow-up.

1. Retain complete prechange binary images and ordered accepted PM steps in a causal sidecar journal. Use this deliberately larger reference model to establish correctness before designing compact lineage. Do not embed preimages recursively in the Y.Doc or register individual references with writers.
2. Evaluate span-local split/import effects in each event's causal preimage. Carry locations through certified edits, require the original live container and refuse ambiguous PM/Yjs boundary disagreement. Preserve permanent break evidence and distinguish `safe`, `broken`, `gone`, `unknown` and `expired`.
3. Keep native undo unchanged. Associate source evidence using its public history metadata and certify the actual inverse only where source, preimage and resulting content agree. Send content and evidence in one harness transport packet; do not wrap undo in another Yjs transaction or claim same-Y-transaction outcome capture.
4. Bound the experiment to 32 packets, 8 MiB retained evidence and 15-minute references. Check causal dependencies, duplicate IDs, preimages and content/evidence agreement. Persist coverage loss even for content-neutral batches; preserve human updates when evidence admission fails.
5. Verify original-reference replacement, permanent invalidation, fresh-reference undo, offline/reordered/duplicate delivery, default-GC checkpoint reload and resource-failure paths. Obtain separate technical review; retain any unsupported cases and the production gate explicitly.

**Exit and next gate:** The scoped reference model must pass without weakening required outcomes. Use retained evidence to prove the ordinary edit/undo/patch workflow first. Evidence pruning is parked under the later user direction; it is not a prerequisite for this bounded work. Relevant causal concurrency, supported undo/writers and sustained availability still need evidence before production activation. Expiry and a hard cap alone do not prove sustained availability. Milestone 2A may proceed independently under its approval.

### 1C. Compare rolling delta retention with the reference model

**Current disposition:** Parked after the user's simplification request. The experiment and its counterexample are retained as evidence. Do not extend it to unblock the bounded real-editor workflow. Existing production Yjs checkpointing is a separate, pre-existing mechanism.

**Authority and objective:** The user's “Ok do that” authorises the post-fix review and next local retention experiment. Test whether the existing editor-produced evidence can be stored without repeated full preimages and reclaimed without registering references. This is a reversible storage experiment, not approval for milestone 2 or a new passage-identity policy.

**Direct baseline and decision:** Milestone 1B stores a complete preimage per packet and stops permanently at its cap. First test the smaller change: one same-history binary checkpoint plus a serial window of deltas and accepted step evidence. Reconstruct the original reference model on demand rather than introduce a second classifier. This trades retained storage for bounded replay work; it does not yet provide compact semantic lineage or prove browser-side memory improvement.

1. Add an isolated backend experiment and real-library tests. Keep the reference model and production callers unchanged. References carry an absolute issuance cursor so checkpoint advancement does not require rewriting or registering them.
2. Reclaim a prefix only when its admission times are older than the reference lifetime. Preserve the original Yjs history, the checkpoint cursor/head and all evidence needed since any unexpired issuance. Keep the 32-packet and 8 MiB retained bounds; overflow must refuse admission rather than evict live evidence.
3. Compare exact decisions, resulting edits and outside identities with the reference model across replacement, structural invalidation, fresh issuance, GC/reload and repeated reclamation. Measure serialized retention separately from reconstructed evidence and runtime.
4. Test stale/concurrent packets, clock rollback, coverage loss, malformed checkpoints and undo whose source has been reclaimed. Record any conservative divergence from the reference model rather than treating it as full acceptance.

**Exit:** A recorded pass or rejection of this serial storage candidate, with reproducible measurements and remaining limits. Relevant concurrent lineage, general undo, rich editor writers and production durability still require separate evidence. Recovery is removal of the isolated experiment; no database or protocol changes are involved.

**Result:** The serialized-storage and rolling-window experiment passes its scoped fixtures. It is rejected as a contract-complete replacement: reclaiming an undo source can turn the full-history model's `safe` into `unknown`. No production gate is satisfied by this result; see [measurements and limits](#milestone-1c-local-evidence).

### 2A. Persistence foundations

**Authority and objective:** The earlier "implement" following the 2A/2B proposal approved that split. Build on the existing row lock and durable Yjs tables without selecting a production continuity representation. The first bounded task is transaction-scoped history helpers, current-read/projection groundwork and real PostgreSQL evidence.

**Files:** `backend/src/repositories/docCollab.ts`, new `docCollabHistory.ts` and `docCollab.integration.test.ts` in the same directory, and this plan. Existing schema and collaboration protocol suffice for this task.

1. Extract transaction-owned locking, bounded history, baseline and checkpoint primitives. Reuse them in the existing append/sync path. Expose an append primitive that composes with an outer transaction.
2. Add internal complete-current-read and server-generated same-history compaction entry points. Reject incomplete or unresolved history rather than returning a prefix or falling back to stale JSON. Return the exact durable sequence separately from the stored JSON version/marker; preserve supported opaque metadata.
3. Verify acknowledged writes, deletion coverage, character/container identity, concurrent transaction ordering, rollback and unchanged canonical versions with real PostgreSQL. Include count/byte limits and corrupt or dependency-incomplete history.

**Exit for this task:** Repository current reads include all acknowledged updates without a browser; compaction preserves the same history; failed composed transactions leave no partial changes. This is internal groundwork, not activation of current MCP reads, scheduled projection or live patches. The current production projector remains a separate schema/fidelity migration requirement before those consumers are enabled.

**Result:** This bounded task meets its repository-level exit checks; see the PostgreSQL evidence below. Full milestone-2 acceptance still requires 2B.

**Recovery:** Revert the repository extraction and new internal entry points. This task introduces no schema migration or history reset. Disposable test databases can be discarded after verification.

### 2B. Continuity integration and current-read activation

**Objective:** Make accepted human/agent state immediately readable without browser snapshot coordination.

**Implementation state:** The persistence/current-read slice is implemented and verified below. The continuity entry gate remains open; authorisation to build this infrastructure does not establish support for every production writer or enable live targeted tools.

**Files:** `backend/src/repositories/docCollab.ts`, `backend/src/collab/docHistory.ts`, `backend/src/collab/sync.ts`, `backend/src/collab/docContent.ts`, `backend/src/services/doc.ts`, `backend/src/db/schema.ts`, a generated Drizzle migration, reset/reconciliation callers, and repository integration tests.

**Entry gate:** Resolve required undo lineage, relevant causal concurrency, supported writer coverage and sustained retention availability against the reference model. Database commit order alone does not establish causal lineage. Keep these gates distinct from the PostgreSQL work completed in 2A.

1. Add/backfill generation identity and rotate it in reset writers without changing existing Yjs history. Build on the 2A helpers; reuse one materialised state for validation, patching, and projection. Persist content and continuity evidence in the same transaction and prove restart/retry preserves decisions.
2. Implement locked read/agent-time projection and bounded server-owned discovery-search refresh as the baseline. Compare per-human-update projection in the benchmark; preserve current scoped reads with either schedule.
3. Add atomic patch persistence, audit, and receipt composition; use the existing idempotency transaction rather than a second connection.
4. Test row-lock interleavings, compaction, rollback, no-op versions, metadata preservation, and database failures with real PostgreSQL.
5. Benchmark both projection schedules against the current implementation. Include 20 clients typing during reconnect/anomaly-repair bursts, scoped searches, and compaction. Measure lock waits/hold time, acknowledgement/read/patch latency, SQL/index writes, memory, and discovery-search lag after the final edit. Record budgets before judging results, then select the projection schedule and repair policy.

**Exit:** Committed edits appear in `get_doc` and scoped search with no browser present. All-or-nothing patch/receipt persistence is proven. The measured projection schedule, discovery freshness bound, and repair-load budget are recorded before later protocol details are fixed.

### Milestone 2B implementation evidence

**Implemented, 15 September 2026:**

1. **Generation and durable evidence.** Migration `0056_doc_continuity_2b.sql` backfills a UUID collaboration generation without changing existing history, adds the projection queue marker/index, and creates a document-owned continuity checkpoint table with an 8 MiB database bound. Destructive reset/reconciliation writers rotate generation and clear evidence; same-history compaction preserves both. Content and evidence admission share the document row lock and transaction. Exact retained packet retries do not append another update; contradictory packet-ID reuse refuses. A writer without supported evidence marks coverage incomplete while its valid human edit still commits.
2. **Server-current reads and projection.** Authorised `docService.getDoc` now projects the complete durable state under the shared lock. It reuses the existing project/personal/share access checks and compares locked document ownership with the authorised record. The creator relation previously shadowed the personal document's creator UUID; removing that join restores the declared identity shape. The production projector now uses the frontend-compatible code-block schema and preserves opaque metadata. Version/time change only when content changes; search text is written only when it changes. Legacy histories beyond one replay window are repaired through at most three bounded prefix checkpoints in the same transaction: only the complete state is published, and any later refusal rolls all preparation back.
3. **Bounded discovery refresh.** A non-overlapping one-second server job processes at most 20 dirty documents per tick, each under its own `FOR UPDATE SKIP LOCKED` transaction. A failed document rolls back its projection savepoint and is deferred for 30 seconds so it does not monopolise the queue. Current reads and internal patches do not wait for this job. The selected schedule is locked read/patch-time projection plus queued discovery refresh; per-human-update projection remains a benchmark comparison.
4. **Atomic internal patch and minimal protocol fence.** `issueCurrentSpan` and `applyCurrentSpan` are transaction-level repository primitives. The latter persists the patch update, continuity checkpoint, canonical/search projection and metadata-only audit inside the caller's transaction; the existing idempotency wrapper writes its receipt in that same transaction after taking its advisory lock first. These primitives require caller authorisation and are not new public APIs. Sync, updates, ACKs and snapshots carry generation. The server rejects old-generation writes; the browser rejects a changed generation before applying its sync or replaying pending edits. The mounted editor's terminal reload path handles that refusal.

#### PostgreSQL and regression evidence

The isolated PostgreSQL 16.14 run passed **30 tests / 156 assertions**: 12 new 2B cases, 16 earlier shared-history cases and two reconnect/checkpoint cases. It proves current authenticated reads without client snapshots; no-op projection stability; outside formatting and opaque metadata preservation; code/table projection fidelity without binary mutation; evidence deduplication; compaction without generation loss; concurrent idempotent patch replay with one audit/receipt; rollback after a receipt foreign-key failure; unsupported-writer coverage loss; stale generation refusal; actual row-lock skipping; and failed issuance rolling back preparation. A 201-update legacy fixture proves bounded prefix repair and rollback. A rolled-back isolated-schema migration fixture proves generation backfill and dirty-marker selection without changing content versions or update/snapshot bytes.

```bash
# Run from backend against an isolated PostgreSQL database, after setting DATABASE_URL.
RUN_DB_INTEGRATION_TESTS=true bun test --isolate src/repositories/docCollab.continuity.integration.test.ts src/repositories/docCollab.integration.test.ts src/repositories/docCollab.reconnect.integration.test.ts
```

Additional executed checks: **90 focused backend tests**, **22 focused frontend editor/hook tests**, and the production-editor reconnect browser runner pass. The full backend unit command (`bun test --isolate "--path-ignore-patterns=**/*.integration.test.ts"`) reports **659 passed / eight failed / 4,658 assertions**; all eight are the previously rejected witness candidate. The full frontend suite reports **84 passed / 422 assertions**. Backend/frontend TypeScript and targeted ESLint pass. The final legacy-repair and selective-projection changes were followed by the 30-test PostgreSQL run and backend type/lint checks. Full application suites were not repeated after those final focused changes. The generation-specific cases run in hook, real-route and PostgreSQL tests; the existing browser relay regression is not a complete authenticated-browser-to-database reset test.

#### Projection schedule comparison

`backend/src/collab/docProjectionLoad.ts` runs 20 real Bun WebSocket clients against the real collaboration route and isolated PostgreSQL. Only session lookup is replaced by a seeded identity. Each run performs 200 human updates, concurrent current reads and authorised discovery searches, five compactions, one client reconnect and five internal patches on a separate bounded-journal document. Browser snapshots are deliberately absent. All 20 clients converge to the exact durable binary state. A further final-edit probe measures discovery without a current read forcing projection.

Budgets declared before measurement: ACK/current-read/search p95 at most 500 ms; patch/repair p95 at most 1,000 ms; final-edit discovery at most 1,500 ms; sampled process RSS growth at most 256 MiB. These are diagnostic acceptance budgets for this fixture, not production SLOs.

| Metric | Locked reads + queue | Projection per human update |
| --- | --- | --- |
| ACK p95 | 82.1 ms | 103.2 ms |
| Current read p95 | 25.1 ms | 26.5 ms |
| Discovery search p95 | 4.5 ms | 4.2 ms |
| Internal patch p95 | 27.9 ms | 38.6 ms |
| Persistence p95 | 6.0 ms | 8.3 ms |
| Repair p95 | 4.2 ms | 2.0 ms |
| Content projection writes during 200-update workload | 10 | 200 |
| Final-edit discovery probe | 1,023.2 ms | 1.5 ms |
| Sampled process RSS growth | 54.2 MiB | 47.5 MiB |
| Maximum sampled database lock waiters | 8 | 8 |

Both runs have no budget breaches. Keep the queue baseline: it coalesces projection writes while providing immediate locked current reads, with the expected discovery delay. In the final probe, a refresh tick starts one second after ACK to test the worst tick phase for an otherwise empty queue. This establishes observed freshness for this fixture, not a bound under an arbitrary dirty-document backlog.

```bash
# Run sequentially from backend with DATABASE_URL pointing to an isolated database.
RUN_DB_INTEGRATION_TESTS=true bun run src/collab/docProjectionLoad.ts queue
RUN_DB_INTEGRATION_TESTS=true bun run src/collab/docProjectionLoad.ts per-update
```

**Measurement limits:** These are single completed small-document load samples. ACK/persistence samples include the extra discovery edit; projection-write counts exclude it and use content-version increments as a proxy, not exact SQL or index-write instrumentation. Lock waiters are sampled counts, not lock hold/wait durations. The process includes clients, server and measurement work; PostgreSQL process memory is excluded. Five patch samples use a separate document, so they do not establish patch contention on the document with 20 active writers. Round-by-round refresh is invoked by the runner; the final probe separately exercises the one-second tick policy. Long queue/backoff saturation, anomaly storms, production writer evidence capture and large-document contention remain unmeasured.

**Remaining activation gates:** Normal editor updates still do not carry the experimental PM/undo evidence envelope. When such a writer edits a document with an active journal, coverage becomes incomplete and subsequent targeted operations refuse. Grouped undo, unsupported concurrency/formatting shapes and sustained evidence availability remain unresolved. Signed references, literal scoped `search_doc`, public typed `patch_doc`, stable operation-ID ACK/receipt protocol and complete post-commit delivery/reset coordination belong to subsequent implementation. Existing public whole-document writes retain their live-collaborator guard. This work does not claim the full 2B release exit or approve live targeting.

**Review and recovery:** Implementing-agent self-review checked transaction/lock ordering, authorisation before current-read side effects, no-op metadata, generation reset callers, fail-closed coverage and migration backfill. Tests use disposable records and the temporary PostgreSQL server was stopped afterward. This is not independent release approval. The migration is additive, but client/server rollout must be coordinated because a new server rejects generation-less writes. Preserve the new columns and evidence when rolling application code back; do not reset Yjs history or truncate checkpoints as a rollback shortcut. No production migration, deployment or commit was performed.

### 3. Add references and MCP tools

**Objective:** Deliver the search/inspect/patch interaction without routine content conflicts.

**Files:** `backend/src/mcp/tool-definitions.ts`, `backend/src/mcp/validation.ts`, `backend/src/mcp/errors.ts`, `backend/src/mcp/idempotency.ts`, document service, and a single reference codec near the collaboration adapter.

1. Implement bounded signed references, current read targets, literal `search_doc`, and typed atomic `patch_doc` operations.
2. Require idempotency keys; return compact receipts without excerpts, bodies, or reference tokens. Document indefinite time-based retention, cascade/restore exceptions, and the maintainer's storage budget.
3. Enforce current scopes/access, principal binding, target reachability, generation, expiry, payload limits, and conflict rules for overlapping operations.
4. Test changed target text succeeds, unrelated edits succeed, deleted targets fail without writes, and repeated text never causes implicit global replacement.
5. Test timeout/retry, payload/key mismatch, expiry after commit, token tampering, wrong document/container/principal, and access revocation.

**Exit:** Published tool schemas match runtime validation and behaviour. The normal call requires no `expectedVersion` and cannot silently become a whole-body overwrite.

### 2B review and signed span-reference follow-up

**Review finding and correction:** Activating current reads moved materialisation into `docService.getDoc`, before the initial-sync builder's error handler. A typed oversized-state failure there was closed as generic `1011`, leaving a browser able to retry an unrecoverable oversized document indefinitely. The route now classifies failures from both initial reads and sync construction in the outer handler: oversized state `1009`, bounded busy `1013`, missing document `1008`, and unexpected errors `1011`. Three real-WebSocket route regressions verify close codes/reasons and absence of room admission or writes. The existing sync-builder and unexpected-error tests remain passing.

**Implemented continuation:**

1. `backend/src/collab/docReference.ts` signs one supported text-span reference using fixed HMAC-SHA-256 and a purpose-derived installation key. The strict envelope binds version/purpose, document UUID, collaboration generation, credential principal, block/container identity and the complete continuity reference. Maximum encoded token size is 4 KiB; maximum lifetime is 15 minutes. Verification bounds work before decoding, requires canonical base64url/UTF-8/JSON and strict field schemas, compares signatures in constant time, and checks binding and time before returning the reference. Oversized evidence is refused, never truncated.
2. `backend/src/mcp/principal.ts` shares the existing receipt principal identity with the codec. PAT references bind to the credential ID. OAuth references bind to user plus client, so token rotation within that principal preserves the reference while another user/client refuses. The installation key uses configured `SESSION_SECRET` only when it is at least 32 bytes after trimming and is not the known fallback, including whitespace-padded forms. Reference issuance fails with an actionable configuration error otherwise. Secret rotation invalidates outstanding references.
3. `backend/src/repositories/docSpanReference.ts` adapts signed issuance and patching to the existing transaction primitives. Callers must provide a server-authorised document record; its document/owner/project identity is compared under the row lock before preparation or patching. A signature does not grant access or replace current scope, membership/share or account checks. Reference verification belongs inside the idempotent operation callback, so an existing committed receipt is looked up before expiry is evaluated. Replay still runs the existing current-access callback.

**Verification:** The focused codec/route/idempotency command passed **52 tests / 122 assertions**. Coverage includes unsafe signing configuration, tampering, noncanonical encoding, fixed-purpose/schema rejection, cross-document/generation/PAT binding, OAuth rotation and principal changes, expiry/future issuance/lifetime bounds, and oversized tokens. Backend TypeScript and targeted ESLint pass.

The repeated isolated PostgreSQL run passed **33 tests / 175 assertions**. New signed-adapter cases prove a reference still patches exactly after a human outside edit and compaction; a committed receipt replays after expiry and OAuth token rotation; a new idempotency key with that expired reference refuses; replay access denial remains effective; cross-document/principal/reset-generation attempts leave state unchanged; ownership changes between authorisation and lock refuse both issuance and patching; and an injected encoding-limit failure rolls back canonical/journal preparation. Receipts contain neither replacement text nor reference tokens. The prior 2A/2B/reconnect tests also remain passing.

```bash
# From backend:
bun test --isolate src/collab/docReference.test.ts src/routes/collab.test.ts src/mcp/idempotency.test.ts
# With DATABASE_URL pointing to isolated PostgreSQL:
RUN_DB_INTEGRATION_TESTS=true bun test --isolate src/repositories/docCollab.continuity.integration.test.ts src/repositories/docCollab.integration.test.ts src/repositories/docCollab.reconnect.integration.test.ts
```

**Boundary and next work:** This is an internal single-span codec/adapter, not a published MCP schema, literal search endpoint, body-target or batch-patch implementation. A large valid causal reference may exceed 4 KiB and refuse issuance; capacity is not silently increased. Public tool wiring must supply current authorisation and scopes, map reference errors, preserve receipt-first retries and integrate post-commit delivery. Next implement current read/search reference issuance and typed patch dispatch under those contracts; live activation still requires the outstanding writer-evidence, continuity and retention gates.

**Review and recovery:** Implementing-agent self-review covered signature input bounds/canonical encoding, fixed key purpose, principal reuse, locked ownership binding and receipt-before-expiry ordering. This is not independent release approval. Full application/browser/load suites were not repeated for this backend codec/route-only follow-up; their recorded results above remain historical. The temporary PostgreSQL server was stopped after verification. This slice adds no migration or deployment; its internal reference entry points can be withdrawn without changing stored document history or existing receipts.

### Scoped read, search and patch dispatch follow-up

**Implemented, 15 September 2026:** `backend/src/mcp/doc-target-tools.ts` exports a factory for staged `get_doc`, `search_doc` and `patch_doc` definitions. The production registry does not import/register these definitions; a regression test verifies that the existing `get_doc` schema and public tool set remain unchanged. This allows real handler, validation, transaction and delivery testing without silently enabling unsupported live writes.

1. **Current reads and literal search.** Target-bearing reads authorise without projection, then lock/project/select/issue/sign inside one database transaction. All references in a page come from the same current state. `get_doc` without targets uses the current document service. `search_doc` performs exact, case-sensitive literal matching with UTF-16 offsets, including overlapping occurrences. It joins formatting/link runs within one inline container for matching but never joins blocks or table cells. A no-match page does not initialise a continuity journal.
2. **Explicit target eligibility.** The retained-history oracle currently certifies direct paragraph text within a single formatting run. Read targets enumerate those runs rather than claiming whole-body identity. A cross-format match or a match in a table/code/other block is returned with `targetStatus: unavailable`, `reasonCode: TARGET_UNAVAILABLE` and no token. The implementation does not split one literal match into several independently patchable targets or weaken oracle checks. A global coverage gap still refuses target issuance; ordinary current reads remain available.
3. **Typed atomic dispatch.** The staged patch handler accepts exactly one `replace_text` operation with a signed reference, replacement text and idempotency key. It checks scope, identity and current edit access before entering the existing idempotency transaction. Inside that transaction, locked ownership/generation and the signature are checked before applying the target operation. Content, evidence, projection, audit and receipt commit together. Receipt lookup precedes signature expiry checks, and replay rechecks edit access. A fresh commit broadcasts its Yjs delta, sequence and generation through the real collaboration hub; a receipt replay does not broadcast again.
4. **Bounded input and output.** Pages default to 10 and allow at most 20 targets; offsets are limited to 1,000. Literal queries are 1–512 UTF-16 units; replacement text is at most 16,384 units and may be empty. Queries/replacements reject unpaired surrogates. References are at most 4 KiB, idempotency keys at most 200 characters and read/search response JSON at most 1 MiB. Unknown fields, `expectedVersion`, extra operations and malformed input refuse. A page beyond the paging ceiling reports truncation explicitly. Pagination is evaluated against each request's current state, not a pinned cross-request snapshot.

**Verification:** The focused literal-search, signature, continuity, document-service, registry and idempotency suites passed **142 tests / 832 assertions**. The PostgreSQL run passed **38 tests / 217 assertions**, comprising five new staged-handler cases and the previous 33 persistence/reconnect cases. Backend TypeScript and targeted ESLint pass.

The new PostgreSQL cases call the real handler definitions with the MCP input validator. They prove search → signed reference → accepted outside human edit → compaction → concurrent identical patch retry; exact durable/client Yjs convergence through the real hub; preservation of outside formatting and opaque metadata; one audit, receipt and broadcast; expired receipt replay after OAuth credential rotation; changed-payload and expired-new-key refusal; scope/identity/freelancer/shape rejection; no-match behaviour; signing-failure rollback; coverage-gap refusal with current plain reads still working; mixed-format/table hit reporting; and paging truncation. The hub subscriber is a test socket applying the delivered binary update, not a full browser or public MCP HTTP client.

```bash
# From backend; set DATABASE_URL to an isolated PostgreSQL database for the second command.
bun test --isolate src/collab/docLiteralSearch.test.ts src/collab/docReference.test.ts src/collab/docContinuityExperiment.test.ts src/services/doc.test.ts src/mcp/doc-target-tools.test.ts src/mcp/idempotency.test.ts
RUN_DB_INTEGRATION_TESTS=true bun test --isolate src/mcp/doc-target-tools.integration.test.ts src/repositories/docCollab.continuity.integration.test.ts src/repositories/docCollab.integration.test.ts src/repositories/docCollab.reconnect.integration.test.ts
```

**Remaining work:** Production PM/undo evidence transport and generation-scoped operation IDs are the next delivery integration step. They must preserve evidence across reconnect/retry, handle committed updates whose delivery was lost, and keep human edits working when evidence capacity is exhausted. A one-time post-commit broadcast is not durable delivery recovery. Whole-body targets, multi-operation atomic patches, unsupported formatting/block/undo/concurrency cases and sustainable evidence availability remain open. Registering the factory alone does not satisfy those gates.

**Review and recovery:** Implementing-agent self-review checked the scope/identity boundary, locked ownership check, exact-container search, target eligibility, bounded paging, transaction rollback, receipt-first replay and post-commit-only broadcast. Tests exposed the oracle's paragraph/format-run restriction; it is now represented in responses rather than bypassed. This is staged integration evidence, not independent release approval. No frontend code, schema or dependency changed in this slice; browser, load and full application suites were not rerun. The isolated PostgreSQL server was stopped after verification. The factory can remain unregistered or be removed without a data migration; existing durable evidence and history must be preserved.

### 4. Complete browser delivery and reset fencing

**Objective:** Keep ordinary concurrent editing connected and protect exceptional history changes.

**Files:** `backend/src/routes/collab.ts`, `backend/src/collab/hub.ts`, `frontend/src/hooks/use-doc-collaboration.ts`, editor/save UI tests, and integration coverage for the generation/reset support introduced in milestone 2.

1. Enforce the persisted generation across browser sync/update/catch-up and reset boundaries. Cover all reset callers and reject incompatible old clients.
2. Broadcast committed agent deltas to all room clients. Replace browser-owned canonical saves with server projection/checkpointing.
3. Implement the measured event-triggered repair policy, exact update-ID acknowledgements, and ordered per-socket writes/replay. Preserve pending local updates; test duplicate/reordered acknowledgements, deletion-only deltas, and detected failures forcing repair/reconnect. Do not introduce an unmeasured per-client polling cadence.
4. Treat snapshot contention as nonfatal. Make actual generation changes explicit and recoverable without automatic old-history replay.
5. Run two-browser plus MCP plus PostgreSQL tests, including reconnect, reset, post-commit send failure, and a server restart.

**Exit:** No exit/reload for normal patches or snapshot timing. Exceptional generation changes cannot corrupt the new history.

### Generation-scoped operation replay follow-up

**Implemented, 16 September 2026:** This slice completes stable local-operation identity and durable retry handling before production evidence transport. It does not attach the experimental capture bridge to the production editor.

1. **Durable operation receipts.** Migration `0057_doc_collab_operations.sql` adds a receipt keyed by document, generation and operation UUID. The document-locked append transaction checks actor and a SHA-256 digest of the update/evidence payload. An identical retry returns its original sequence before replay/materialisation; contradictory ID reuse refuses. New content, continuity changes and the receipt commit or roll back together. Same-history compaction retains receipts, and destructive generation resets clear them. No TTL-based eviction is implemented: receipts grow with accepted operations during a generation, independently of the bounded continuity checkpoint.
2. **Exact acknowledgements.** Sync advertises `acknowledgement: operation_id`; updates, broadcasts and ACKs carry operation identity alongside generation. The browser creates one UUID per local update and retains the same payload/ID across reconnect. ACKs remove only their matching pending operation. Duplicate, unknown and missing-ID ACKs do not remove another operation or advance the received-content sequence. Snapshot sending still waits for every pending local operation. A reconnect may not downgrade a previously negotiated operation-ID contract; refusal occurs before applying its sync or replaying pending writes. The client retains legacy FIFO compatibility only when that contract has not been negotiated; the new generation-aware server requires operation IDs.
3. **Lost local-ACK recovery.** A pending operation starts a ten-second acknowledgement deadline. Further typing does not extend that first deadline. If an ACK is lost while the socket stays open, the browser closes and reconnects through its existing recovery path, receives durable state and replays stable IDs. This initial slice restarted the deadline on a matching ACK; the correctness follow-up below replaces that behaviour with the oldest pending operation's original send deadline. Close, terminal failure and unmount cancel the timer. The mounted ProseMirror view and UndoManager survive recovery; pending updates are still memory-resident and are not persisted across a page reload.

**Verification:** All 57 migrations applied successfully to a fresh isolated PostgreSQL 16.14 database. The four-file repository/staged-tool integration run passed **40 tests / 235 assertions**. Added cases prove concurrent identical submission creates one receipt, replay after compaction and a later operation returns the original sequence, changed payload/actor refuses, outer transaction failure rolls back both content and receipt, retry after rollback succeeds, and a reset clears receipts and rejects the old generation.

Focused route/history checks passed **50 tests / 122 assertions**. Focused frontend editor/hook checks passed **24 tests / 242 assertions**, including out-of-order matching, duplicate/unknown ACKs, snapshot gating and contract downgrade refusal. Backend/frontend TypeScript and targeted lint passed. The desktop production-editor reconnect runner passed with operation-ID negotiation and an explicit open-socket lost-ACK case: ten connections, seventeen accepted snapshots, zero view destructions and unchanged durable sequence on replay. Its relay models durable receipts; actual PostgreSQL durability is covered separately.

The real-route/PostgreSQL 20-client queue workload was rerun with operation IDs: 200 burst updates plus one discovery edit, one reconnect, exact convergence, ACK p95 92.6 ms, current-read p95 22.0 ms, patch p95 27.0 ms, discovery lag 1,019.8 ms and sampled RSS growth 53.6 MiB. It reported no declared budget breaches and ten content-projection writes. This is a protocol compatibility/load check, not a new paired schedule comparison; the earlier measurement limits still apply.

```bash
# From backend with DATABASE_URL pointing to an isolated PostgreSQL database.
RUN_DB_INTEGRATION_TESTS=true bun test --isolate src/repositories/docCollab.reconnect.integration.test.ts src/repositories/docCollab.continuity.integration.test.ts src/repositories/docCollab.integration.test.ts src/mcp/doc-target-tools.integration.test.ts
RUN_DB_INTEGRATION_TESTS=true bun run src/collab/docProjectionLoad.ts queue
# From frontend.
bun run e2e/doc-reconnect.ts
```

**Next prerequisite for evidence capture:** Define and test a bounded authenticated sync envelope for the journal generation/epoch, baseline and causal frontier, plus recovery of retained native-undo sources. A database sequence or operation receipt is not causal evidence. The browser bridge must reconcile that envelope with pending local packets on reconnect, including a journal first initialised while the editor is already mounted. It must not silently invent parents, drop an older undo source or reset its coverage after exhaustion. Only then attach the supported PM/undo capture bridge and send content/evidence atomically through the operation-ID path. Production capture is deferred to that protocol step rather than being presented as completed here.

**Remaining delivery and storage limits:** The ACK deadline repairs local writes with missing acknowledgements. A silently missed remote/agent broadcast with no pending local operation has no such deadline; reconnect recovers it, but active remote-only catch-up is still required. One receipt per operation also needs an evidenced storage/retention policy before release; pruning merely because a browser disconnected would break durable retry guarantees. No full application suite or continuity-browser matrix was rerun for this transport slice; their earlier results remain historical.

**Review and recovery:** Implementing-agent self-review checked receipt lock/order/rollback, original-sequence replay after compaction, generation reset callers, exact ACK matching, timer cleanup and downgrade handling. This is not independent release approval. The migration is additive; keep receipts and generation data when rolling application code back. Client/server rollout must be coordinated because the new server refuses ID-less writes and a negotiated client refuses downgrade. The isolated PostgreSQL server is stopped after verification. No production migration, deployment or commit occurred.

### Correctness and local recovery follow-up

**Implemented, 16 September 2026:** The user's implementation instruction after review authorised these four bounded fixes.

1. **Current access after lock waits.** `docAccess.ts` checks current account status, workspace role and project membership or personal share through the same transaction after acquiring the document lock. Signed reads/search/patches and the ordinary projected `getDoc` path use this check before preparing or changing content. Existing document ownership/project comparisons remain. A request authorised before waiting cannot proceed on a grant revoked during that wait; a stale authenticated role cannot bypass current disabled-user or freelancer restrictions.
2. **Explicit local recovery.** A terminal sync error reports its pending operation count. The mounted editor offers a JSON download containing readable blocks, the old-generation binary Yjs snapshot and pending operation IDs/payloads. Its Reload action stays disabled while pending work exists until a download is initiated. The user must check that the file was saved; a download exception keeps Reload disabled. Recovery is manual and never replays old history into a replacement generation. This is an export route, not crash-proof local storage or an automatic import/merge feature.
3. **Usable read-only documents.** The editor container is inert only during transient transport locking of a writable editor. Static read-only views and terminal recovery views remain selectable and accessible while `editor.isEditable` prevents mutations. Existing menu dismissal, focus handling and mounted-view preservation remain in place.
4. **Oldest-operation ACK deadline.** Each successful send records a monotonic timestamp. The timeout uses the oldest sent pending operation's ten-second deadline; acknowledging a newer operation cannot postpone it. Removing the oldest operation preserves the next operation's original deadline. Reconnect replay starts a fresh send deadline while retaining operation identities and payloads.

**Verification:** All 57 existing migrations applied to a fresh isolated PostgreSQL 16.14 database. The four-file repository/staged-tool run passed **48 tests / 260 assertions**. Six new cases wait for a verified database lock block, revoke a project membership or personal share, then release the lock: patch, search and ordinary `getDoc` all deny without changing content, updates, snapshots, continuity evidence, operation receipts, audit or MCP receipts. Two further cases cover disabled accounts and freelancer role changes against stale authenticated contexts.

Focused backend service/staged-tool/route/hub checks passed **76 tests / 231 assertions**. Frontend hook/editor checks passed **28 tests / 268 assertions**, including both ACK deadline orderings, recovery snapshot round-trip, read-only interaction state and failed-download handling. Backend/frontend TypeScript and targeted lint passed.

The desktop production-editor runner passed with **eleven connections, seventeen accepted snapshots and zero view destructions**. It loses an ACK while later operations continue to receive ACKs and verifies timely reconnect with no duplicate durable operation. A read-only page proves selection, actual clipboard copy, accessible link exposure/focus/activation and blocked editing. After a generation change with an undelivered local edit, Chromium downloads a recovery file containing that edit in both readable blocks and binary state; replacement server history remains untouched. The runner uses a controlled relay, with PostgreSQL tested separately. It does not establish the combined authenticated two-editor/MCP/database workflow.

```bash
# From backend, with NODE_ENV=test and DATABASE_URL set to an isolated database.
RUN_DB_INTEGRATION_TESTS=true bun test --isolate src/mcp/doc-target-tools.integration.test.ts src/repositories/docCollab.continuity.integration.test.ts src/repositories/docCollab.integration.test.ts src/repositories/docCollab.reconnect.integration.test.ts
bun test --isolate src/services/doc.test.ts src/mcp/doc-target-tools.test.ts src/routes/collab.test.ts src/collab/hub.test.ts
# From frontend.
bun test --isolate --dom --preload ./src/test/setup.ts src/hooks/use-doc-collaboration.test.tsx src/components/docs/block-note-editor.test.tsx
bun run e2e/doc-reconnect.ts
```

**Next step recorded at this review:** Implement and test the bounded authenticated evidence-sync contract described above: journal generation/epoch, baseline, causal frontier and retained native-undo sources, including first journal initialisation with an already-mounted editor and reconnect with pending packets. The follow-up below implements that bounded contract. Remote-only lost delivery, snapshot-mismatch soft recovery and receipt storage budgets remain open; pruning experiments remain parked. Full application suites, the continuity-browser matrix and load benchmarks were not rerun for these fixes.

**Review and recovery:** Implementing-agent self-review and the checks above support this bounded change, not independent release approval. This slice adds no schema migration or wire-protocol requirement. Application rollback must preserve existing generation/receipt data and keep targeted tools unregistered; reverting these fixes would restore the reviewed defects. The disposable PostgreSQL server is stopped. No production migration, deployment or commit occurred.

### Authenticated evidence-sync follow-up

**Implemented, 16 September 2026:** The user's “continue” instruction authorised the next bounded integration prerequisite. This slice adds the authenticated read contract and experimental browser reconciliation; production editor capture is not attached yet.

1. **One durable observation.** `doc.evidence.request` carries version 1, a UUID request ID and the collaboration generation. The existing authenticated WebSocket revalidates the session; `readDocEvidenceSync` rechecks current document access after acquiring the document lock on the same transaction. The correlated `doc.evidence.sync` response includes document/generation, durable sequence, binary snapshot and either no journal or its complete retained checkpoint and causal frontier. The repository checks the journal's durable sequence and complete-coverage binary state against current history. Reading an inactive journal does not create one; incomplete coverage and its retained evidence are reported intact.
2. **Bounded full-evidence transport.** `docEvidenceSyncProtocol.ts` validates a strict, versioned envelope. The checkpoint retains its existing 8 MiB bound and 32-packet production default; experimental limits up to 128 remain representable. The separate response is capped at 12 MiB, including the base64-encoded current snapshot, whose binary limit remains 2 MiB. Ordinary update/sync limits are unchanged. Requests are explicit, with a one-second per-socket minimum interval and correlated busy response; no polling schedule is introduced. This is full checkpoint transfer, not a new compact lineage or pruning representation.
3. **Pending-packet reconciliation.** `doc-evidence-sync.ts` validates identity, immutable journal epoch/baseline, complete causal parent closure, frontier, durable binary state and every packet's causal preimage on disposable Y.Docs. It unions retained local packets with server packets without rebasing their parents or discarding pending work. Contradictory IDs, missing sources, backward observations, missing local coverage and combined retention overflow stop certification before changing the mounted document. Matching state vectors alone are insufficient: deletion coverage is checked through binary reconstruction. Sequence is only a stale-response check, never an ancestry certificate.
4. **Native undo retained.** The opt-in experimental bridge initialises a journal after mounting, preserves native UndoManager stack objects and their source associations, and merges the prepared snapshot into the same Y.Doc. A reconnect-style response can omit an uncommitted local packet while retaining the causal sources needed for its eventual undo. Coverage failure remains sticky across later responses. Edits made before journal initialisation keep normal native undo, but their missing historical source is not invented: those undo operations remain uncertified.

**Verification:** The four-file PostgreSQL repository/staged-tool run passed **51 tests / 272 assertions** against the isolated PostgreSQL 16.14 database. New cases cover inactive and first-initialised journals, exact checkpoint/frontier recovery after compaction, unauthorised and old-generation requests without preparation side effects, and incomplete evidence alongside the latest preserved human content. No new migration was required.

Route/hub checks passed **54 tests / 184 assertions**, including a read-only caller, request correlation, repeat-request throttling, session expiry, access revocation, generation mismatch and malformed requests. These exercise real WebSocket handlers with mocked repository dependencies. The isolated real-library bridge suite passed **14 tests / 238 assertions**, including pending/local-plus-remote deletion reconciliation, prior-source preservation, malformed ancestry, retention overflow without eviction, and sticky failure. Backend TypeScript, strict browser-harness TypeScript and targeted lint passed.

The new `--continuity --evidence-sync` Chromium mode passed at desktop 1280×800 and mobile 390×844. Both real editors mount before journal initialisation. One editor retains an unacknowledged second edit while reconciling the older durable frontier; after checkpoint reload, both native undos remain certified, the original reference patches correctly, outside identities survive, and both editors continue typing without remounting. This uses the controlled relay and backend reference-model subprocess. It tests the reconciliation operation needed on reconnect, not a full authenticated socket reconnect with production capture. PostgreSQL and authenticated route evidence are separate; the combined production workflow remains unproven.

```bash
# From backend with NODE_ENV=test and DATABASE_URL set to an isolated database.
RUN_DB_INTEGRATION_TESTS=true bun test --isolate src/mcp/doc-target-tools.integration.test.ts src/repositories/docCollab.continuity.integration.test.ts src/repositories/docCollab.integration.test.ts src/repositories/docCollab.reconnect.integration.test.ts
bun test --isolate src/routes/collab.test.ts src/collab/hub.test.ts
# From frontend.
TUESDAY_CONTINUITY_BRIDGE_TEST_CHILD=1 bun test e2e/doc-continuity-bridge.test.ts
bun run e2e/live-agent-doc-editing.ts --continuity --evidence-sync
```

**Integration proposed at this stage:** Attach the supported capture bridge to the production editor behind the activation gate, request evidence on initialisation/reconnect, and deliver content plus evidence atomically using stable operation IDs. The following combined workflow implements and proves the normal single-span path. Lost ACK/restart and retained-source undo remain separate evidence rather than a combined production-capture proof.

**Limits and recovery:** Full-checkpoint transfer and bounded per-packet reconstruction still need near-limit memory, latency and multi-client load evidence. General pre-baseline/grouped/selective/concurrent undo support, sustained retention availability and remote-only delivery repair remain open. No full application suite, full continuity-browser matrix or load benchmark was rerun. The protocol and bridge can be removed without rewriting document history or deleting retained evidence; keep public targeted tools unregistered. Implementing-agent self-review is not independent release approval. The isolated database is stopped; no production migration, deployment or commit occurred.

### Combined production-editor workflow

**Implemented, 16 September 2026:** Following the user's direction to return to the original goal, this slice connects the existing parts and proves one supported search/patch workflow with people still typing.

1. **Production capture and transport.** `frontend/src/lib/doc-continuity-bridge.ts` and `doc-evidence-sync.ts` are used by the actual editor and collaboration hook; the earlier experiment imports re-export these implementations. With backend `DOC_LIVE_EVIDENCE_ENABLED=true` and frontend build-time `VITE_LIVE_DOC_EVIDENCE=true`, sync negotiates `retained_v1`. The browser requests retained evidence before enabling editing, then sends each supported content delta and its evidence in the same stable-operation-ID payload. The route validates the envelope, revalidates the session and checks current write access inside the document transaction before admission or receipt replay. Both flags default off.
2. **Initialisation and agent delivery.** The first negotiated evidence request creates a missing journal from current durable history under the document lock. It never resets an existing incomplete journal. Agent patches broadcast their accepted evidence packet with the delta and authenticated actor, so other mounted editors retain its causal ancestry. A writer without supported evidence still preserves valid human content and closes evidence coverage; it cannot silently restart certification.
3. **Explicit editor constraint.** Opt-in editors disable BlockNote's automatic trailing blank paragraph. Its binding-time insertion occurs outside the supported local capture path and otherwise makes the journal incomplete during mounting. Explicit user-created blocks remain available; unsupported edits still fail closed for targeting. This is a bounded capture limitation, not a change to the agreed passage semantics.
4. **One combined real workflow.** `docLiveWorkflow.ts` starts the real authenticated collaboration route against an isolated PostgreSQL database and seeds two project members, sessions and a scoped PAT. Its loopback-only test endpoint authenticates that PAT and invokes the actual staged search/get/patch handlers. `doc-live-workflow.ts` mounts two production editors with distinct session cookies. It searches `TARGET`, types outside it in both editors, patches the original reference to `AGENT` while another outside edit is submitted, and continues typing without repositioning either caret. It verifies exact durable binary convergence, preserved outside text, complete evidence, stable editor/UndoManager instances, zero view destructions and zero browser errors. Repeating the identical patch returns the same receipt and leaves exactly one MCP receipt. An unauthenticated staged request returns 401. No route or repository dependency is mocked.

**Verification:** The combined workflow passed in Chromium at **1280×800 and 390×844**. This establishes the original normal workflow for the supported paragraph span through the real production components, authenticated route and PostgreSQL. The test endpoint is a local adapter around staged MCP handlers; it does not register the tools in public MCP discovery.

| Check rerun for this slice | Result |
| --- | --- |
| Four PostgreSQL repository/staged-tool suites | 51 tests / 272 assertions |
| Route/hub/staged-tool unit suites | 55 tests / 190 assertions |
| Frontend hook/editor suites | 28 tests / 268 assertions |
| Isolated real-library capture bridge | 14 tests / 238 assertions |
| Existing production-editor reconnect runner | Passed; 11 connections, 17 snapshots, zero view destructions |
| Backend TypeScript, strict harness TypeScript, targeted lint, frontend production build | Passed |

Reproduce the combined workflow from `frontend`, with `DATABASE_URL` pointing to a disposable PostgreSQL database:

```bash
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=postgresql://postgres@127.0.0.1:55440/tuesday_review bun run e2e/doc-live-workflow.ts
```

The runner supplies the isolated backend flags and signing secret, opts its editor instances into capture, and removes seeded rows and temporary browser/server resources afterwards. The backend harness refuses to run outside test/integration mode. All 57 existing migrations were present in the isolated PostgreSQL 16.14 database. The frontend Docker build stage now includes the two browser-safe shared helpers; the local frontend build passed, but Docker itself was not run.

**Scope and recovery:** This is a working bounded single-span path, not acceptance of the full release matrix. The 32-packet/8 MiB journal still stops certification at capacity; general undo/writer coverage, near-limit performance, combined restart/replay, remote-only missed delivery and public tool activation remain open. Full application suites and the complete continuity-browser matrix were not rerun. Disable the opt-in flags to return to ordinary collaboration, retaining generation/history/receipts; raw updates will make an active journal incomplete rather than erase it. Public targeted tools remain unregistered. No production migration, deployment or commit occurred; the disposable database is stopped after verification. Agent self-review does not replace independent release approval.

### 5. Verify and release

**Objective:** Enable the feature only after user-visible behaviour, recovery, and performance are demonstrated.

**Files:** `docs/mcp.md`, repository `skills/tuesday-mcp/SKILL.md` and document references, `plan/mcp-server.md` supersession note, release notes, integration fixtures, and this plan's review record.

1. Update agent guidance to prefer live search and targeted patches. Remove collaborator-exit advice only for the new path; retain accurate legacy-tool warnings.
2. Run the full matrix below and save commands/results, timings, tested versions, and skipped-test reasons. Have the independent reviewer inspect adapter identity, permissions, transactions, and reset fencing.
3. Rehearse migration and rollback on a disposable production-shaped database. Have a maintainer unfamiliar with the implementation locate the enable/disable and recovery instructions without coaching.
4. Deploy schema/protocol support with the live tools disabled, update clients, verify generation handling, and enable the new tools on a test workspace before wider use.
5. Record maintainer acceptance and the exact release/rollback build. Update this plan if any target semantics, dependencies, protocol, or projection strategy change.

**Exit:** Acceptance is supported by saved evidence, not an unexecuted checklist. Publishing this plan alone does not satisfy that gate.

## Acceptance matrix

| Area | Required proof |
| --- | --- |
| Main workflow | Two real open editors plus an MCP patch; both can keep typing, see the patch, and converge without navigation, remount, or reload. Include desktop and a narrow mobile viewport. |
| Current-target overwrite | A human change committed inside the selected span/body before the patch is replaced according to that target's semantics. A different paragraph and nonoverlapping text in the same paragraph survive. |
| Late human updates | Hold a browser update offline, patch, replay it, and verify documented Yjs convergence rather than asserting strict arrival-order overwrite. |
| Required target success | Whole-selection replacement inside the same supported surviving container must succeed, not return a target error. Boundary insertions and delete-then-insert into the same surviving gap use the documented outward interval. Deleting adjacent prefix/suffix characters or unrelated paragraphs must succeed, as must structural edits outside a span that preserve its supported identity and interval. Fixtures assert exact resolved intervals, identity and resulting text. |
| Required target rejection | A deleted block/container, deleted ancestry, deletion leaving an empty former nonempty span, or delete/recreate using the same logical ID must fail without mutation. Reject whole/interior target splits and widening imports from existing or newly created neighbours in either direction, including hard-break imports. Unsupported moves and undo-based identity changes have explicit fixture-specific error expectations, not an either-success-or-error assertion. |
| Exact edit identity | Deleting the first `a` from `aaa` preserves the second and third items. Two disjoint edits in one XML text container preserve intervening items. Delayed human edits outside the targets still affect the intended surviving characters. |
| Rich content | Marks, links, Unicode/surrogate pairs/combining characters, hard breaks, embeds, code blocks, nested blocks, table cells, and supported opaque metadata are preserved outside scope. Search offsets map to actual inline nodes, not flattened document offsets. |
| Batch semantics | Disjoint operations apply correctly after position mapping; overlap/ancestor conflicts and deleted anchors fail atomically. Invalid final IDs/schema/size leave no content, audit, or receipt mutation. |
| Durable reads | Fresh reads and scoped search include acknowledged human updates and agent patches without an active browser. Existing unsnapshotted history repairs safely. |
| Compaction | Surviving references work after binary checkpointing, bounded replay, restart, and garbage collection. No prefix-only projection or JSON reseeding. |
| Delivery and saves | Delayed/reordered/duplicate messages and acknowledgements, multiple outstanding local updates with one failed write, lost insert/deletion updates, lost response, snapshot races, and restart preserve pending work without duplicate mutation or routine reload. Inject a detected broadcast failure and prove it signals repair/reconnect. For silent missed delivery, prove convergence at the next reconnect and record the absence of a timed repair guarantee. |
| Reset boundary | Old references and offline old-generation browser updates cannot enter replacement or restored history. Rehearse backup restore with a browser holding post-backup updates. Pending local content has an explicit recovery route. |
| Permissions | Project membership, personal shares, admin access, freelancer denial, token scope/revocation, disabled users, cross-document references, and replay access checks retain existing boundaries. |
| Resource use | Compare both projection schedules with near-limit bodies/history, 100-operation batches, repeated searches, and 20-client typing plus reconnect/anomaly bursts. Record lock, latency, memory, SQL/index cost, and final-edit discovery freshness. Meet budgets or return bounded busy/limit errors. |
| Receipt retention | New receipts contain no document text or tokens; retry after reference expiry returns the original result. Measure byte growth and document no timed pruning, cascade deletion, and restore exceptions. Record the first-release storage budget. |

Use real PostgreSQL integration tests explicitly. Existing collaboration-route tests mock repository/hub dependencies, and editor tests mock BlockNote; passing them does not prove the main workflow.

Existing commands to run during implementation, each from the named directory:

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend` | `bun run test` | Configured isolated backend suites. Check reported skips. |
| `backend` | `NODE_ENV=test RUN_DB_INTEGRATION_TESTS=true bun test --isolate integration` | Real-DB integration suites, including `src/repositories/docCollab.integration.test.ts`; set `DATABASE_URL` to a disposable PostgreSQL database first. |
| `backend` | `bun run typecheck` | Backend TypeScript validation. |
| `frontend` | `bun run test` | Frontend suite with its required DOM preload. |
| `frontend` | `bun run build` | Frontend TypeScript and production build; no `typecheck` script is currently defined. |

Before any future commit, also run the repository-mandated `bun test` from both `backend` and `frontend`; where the frontend requires DOM setup, run its configured suite as above as well. Browser E2E and new integration commands must be recorded when their harness exists; do not invent a command or count a mocked test as that coverage.

## Rollout and recovery

Provide one server-side enable/disable control for new live MCP tools. Keep protocol generation checks and durable human-update persistence independent of that control. Disabling agent patches must not disable ordinary human editing or restore unsafe reset behaviour.

1. Before deployment, take a tested PostgreSQL backup including docs, binary updates/snapshots, and idempotency records. Rehearse the additive generation migration on a disposable copy and validate unchanged decoded document content. Do not reset/reseed history during migration.
2. Deploy the generation-aware, server-projection-capable build with live tools disabled. Establish a controlled old-client upgrade boundary and verify reconnect/recovery before enabling patches.
3. Enable a limited test workspace and monitor patch failures by code, acknowledgement/catch-up latency, lock waits, history size, and forced reloads. Do not log document text or tokens. The expected normal-patch forced-reload count is zero.
4. On a correctness or availability regression, disable new patches first. Preserve all committed history, receipts, and the generation column. Roll back only to a tested build that understands the new generation/protocol safety boundary; an arbitrary pre-feature binary is not a safe rollback.
5. If content corruption is suspected, stop affected document writes and preserve the current database before repair. Prefer targeted recovery from verified history; restore a whole backup only with maintainer approval of the lost-write window. Before reopening restored/rewound documents, fence affected sessions and rotate their restored generations so browsers cannot replay post-backup updates automatically. Preserve browser content for explicit recovery. Checkpoint retention is not guaranteed edit history, and an infrastructure rollback does not undo a legitimate committed agent replacement.

A database restore can also remove post-backup idempotency receipts. Old-generation references must fail rather than re-execute those uncertain operations against restored state. Reconcile affected receipts from preserved evidence where possible; do not promise exactly-once execution across an approved database rewind. Include this case in the recovery rehearsal.

The implementation must produce exact environment-specific migration, enable/disable, and recovery instructions with a named maintainer and a successful rehearsal. No production commands are authorised by this conceptual rollout section.

## Evidence and review record

**Authority and evidence:** The user's approved interaction model, repository `AGENTS.md`, the inspected source links above, installed BlockNote/Yjs/y-prosemirror implementations, and package test scripts. No additional contractual or regulatory requirements were supplied; existing project security and data-integrity rules remain mandatory.

**Observed:** Existing MCP JSON writes reset collaboration history; human writes use binary Yjs updates; canonical state can lag; the browser is already capable of merging remote deltas. A research-only in-memory Yjs probe showed inward anchors collapsing on replacement and outward anchors enclosing replacement text. That probe is not a real BlockNote/browser acceptance test.

**Chosen design:** Current-state anchored operations in the existing collaboration history, atomic agent-time projection/receipts, locked current reads, and ordinary Yjs merge. Read/agent-time projection plus bounded discovery refresh is the preferred benchmark baseline; per-human-update projection remains a measured alternative. Event-triggered repair replaces the proposed per-client timer. The decisive constraint is preserving outside-target work without asking humans to leave or rejecting normal intervening edits.

**Not yet proven:** Contract-complete span continuity and production capacity, sustainable bounded evidence retention, projection/repair performance, generation rollout/recovery, and the combined two-browser/MCP/PostgreSQL workflow. Local browser and repository checks supply separate evidence, not proof of that combined production path. The compact-journal pruning design remains optional and parked; the sustained-use availability problem is demonstrated below.

### Reconnect review follow-up

**Result, 15 September 2026:** The production editor now dismisses mutating floating controls during reconnect and terminal sync errors while retaining its ProseMirror view and native UndoManager. Imperative read-only state avoids BlockNote's editable-prop remount behaviour. Open table handles are unfrozen when controls close, so a later menu targets the newly hovered row. Recovery restores the mapped caret only if the editor held focus before the interruption and the user has not clicked, focused elsewhere or left the window during recovery.

**Browser evidence:** [The reconnect runner](../frontend/e2e/doc-reconnect.ts) mounts the production editor and collaboration hook against a controlled loopback relay. It passes pre-disconnect insertion/deletion undo, an existing redo stack, typing at the retained mid-paragraph caret without refocusing, intentional outside focus, an already-open table menu during reconnect and fatal failure, and deleting the correct row after recovery. Lost-before-admission and persisted-but-ACK-lost updates replay once in visible content while merging remote edits. Requested snapshots wait for replay ACKs and unseen sequence content; a snapshot raced by another writer is ignored as stale, and editing continues. All nine connections preserve the same view and UndoManager with zero view destructions. Binary comparisons use a disposable GC-normalised copy because the native UndoManager legitimately retains deleted items.

| Verification in this follow-up | Observed result |
| --- | --- |
| Frontend editor/hook tests | 20 passed, 143 assertions |
| Backend history, hub and route tests | 49 passed, 173 assertions |
| PostgreSQL repository/current-history and reconnect suites | 18 passed, 88 assertions, including both previously unrun reconnect cases |
| `bun run e2e/doc-reconnect.ts` from `frontend` | Passed all reconnect, replay, snapshot and fatal-lock scenarios |
| Backend/frontend TypeScript, explicit reconnect-harness TypeScript, targeted ESLint and `git diff --check` | Passed |

PostgreSQL 16.14 ran in a fresh loopback-only temporary cluster with all 55 existing migrations. The count-boundary case edits actual BlockNote paragraphs in two documents through 202 updates each, with interleaved global sequences and no client checkpoints. It preserves a separate bold paragraph and exact binary state. The duplicate/deletion case combines paragraph edits with auxiliary Yjs padding: canonical blocks have a separate 512 KiB limit, so padding is needed to reach the 2 MiB binary-history boundary. Duplicate replay succeeds, and a large deletion reduces state below 110 KiB without changing outside formatting. The temporary server was stopped after verification.

Reproduce the database tests against a disposable migrated database with `RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<test-database-url> bun test --isolate src/repositories/docCollab.integration.test.ts src/repositories/docCollab.reconnect.integration.test.ts` from `backend`. Frontend checks used `bun test --dom --preload ./src/test/setup.ts src/components/docs/block-note-editor.test.tsx src/hooks/use-doc-collaboration.test.tsx`; backend checks used `bun test --isolate src/collab/docHistory.test.ts src/collab/hub.test.ts src/routes/collab.test.ts`.

**Review and limits:** Implementing-agent self-review inspected installed BlockNote portal/mount behaviour, production focus/control locking, replay assertions and repository boundary fixtures. Browser transport is controlled rather than the production authenticated route; repository tests independently exercise PostgreSQL. The combined browser/authenticated-server/database recovery path, full suites, production builds and mobile reconnect interaction were not run in this follow-up. Historical continuity results and the eight rejected-witness failures are not fresh full-suite verification. These corrections require no migration; reverting the editor correction reintroduces the reviewed interaction gaps. There is no commit, deployment or live-tool activation.

### Next bounded retention experiment

This is the experiment agreed before execution. The results below supersede its future-tense actions: 32 and 64 were measured; the gate blocks 128. Larger capacity remains an experiment, not a sustainable retention policy.

1. Account for the complete serialized checkpoint, including bounded coverage/control metadata. Before this follow-up, admission counted only baseline and packets. Keep packet capacity separate from causal-frontier limits, and preserve the existing 1 MiB update and 2 MiB state bounds.
2. Repeat sustained edit → native undo → patch with original and fresh references, retained pre-issuance undo sources, exact outside identities/marks, GC reload, atomic cap refusal and post-cap human convergence. Include a 150,000-character outside paragraph; earlier byte exhaustion is a measured outcome, not permission to raise the budget.
3. Measure warm admission, issuance, resolution and patch latency in a persistent isolated backend worker. Measure reload separately from subprocess startup. Record complete checkpoint/preimage bytes, browser capture latency, peak heap and RSS against the mounted baseline; serialized bytes are not a memory estimate.
4. Report the 64-packet cost/correctness results before advancing to 128. Provisional comparison thresholds are p95 admission 50 ms, issuance/resolution/patch 100 ms each, reload 2 seconds, browser capture 16 ms with no capture-attributed task of 50 ms, and incremental peak memory 128 MiB per worker/renderer. These are experiment stop criteria, not measured production service guarantees.
5. Keep compaction/pruning parked. After capacity is understood, test grouped native typing/undo and outside formatting, which remain normal-workflow continuity gaps, before durable evidence and live-tool integration.

### Bounded retention capacity results

**Decision, 15 September 2026:** Stop workload expansion at 64. Both large-document runs exceed the provisional 128 MiB incremental worker-memory gate. The 64 candidate also reaches 100.5 ms p95 original-reference resolution against a 100 ms gate. The margin on latency is small and needs repeated profiling; the memory excess is already sufficient to block 128. No evidence was reclaimed to make the runs fit.

**Accounting and implementation:** [The journal](../backend/src/collab/docContinuityExperiment.ts) now budgets the UTF-8 JSON size of the entire checkpoint, plus a fixed 28 KiB coverage-control reserve. The reserve covers the worst-case escaped 32-ID frontier and bounded loss reason, so marking coverage incomplete cannot exceed the admitted budget. Construction, admission and reload enforce the same bound. `retentionStats()` distinguishes actual checkpoint bytes from reserved budget bytes. Configurable retention allows up to 128 packets for experiments; the default remains 32, the measured byte limit remains 8 MiB, and the causal frontier remains independently limited to 32. The existing 1 MiB update and 2 MiB materialised-state bounds remain enforced. No-op events consume evidence capacity. A capacity refusal leaves journal state and checkpoint unchanged.

#### Persistent worker measurements

[The worker](../backend/src/collab/docContinuityCapacity.ts) runs one fixture per isolated Bun process, with module startup outside operation timings. Two native Yjs UndoManagers alternate outside insertion, single-source undo and an actual agent patch. Fresh references are issued after their eventual undo source; original and fresh references resolve exactly, survive checkpoint reload and preserve outside content, formatting and sampled identities. After the first admission refusal, human updates still converge and recorded coverage loss blocks agent entry points. The small fixture has three paragraphs; its companion adds 150,000 outside characters.

| Fixture / packet limit | Completed patch cycles / retained packets | Actual checkpoint / reserved budget bytes | Sampled heap / RSS growth (MiB) | First refusal |
| --- | --- | --- | --- | --- |
| Small / 32 | 10 / 32 | 44,596 / 73,198 | 23.6 / 59.0 | Agent patch, packet cap |
| Small / 64 | 21 / 64 | 105,849 / 134,451 | 43.9 / 84.0 | Native undo, packet cap |
| 150k outside / 32 | 10 / 32 | 6,652,556 / 6,681,158 | 121.0 / 210.6 | Agent patch, packet cap |
| 150k outside / 64 | 13 / 40 | 8,267,969 / 8,296,571 | 145.5 / 251.7 | Native undo, byte cap |

Final checkpoint sizes include the bounded loss marker. The 64/150k candidate's next packet was 201,959 bytes; it was refused atomically. Retained base64 preimages account for 8,054,088 bytes in that run. The current binary state is only 151,223 bytes: repeated preimages dominate retained storage.

| Fixture / limit | Admission p95 | Issue p95 | Original / fresh resolution p95 | Patch p95 | Reload p95 |
| --- | --- | --- | --- | --- | --- |
| Small / 32 | 4.5 ms | 6.2 ms | 13.5 / 4.5 ms | 10.6 ms | 55.0 ms |
| Small / 64 | 3.5 ms | 2.3 ms | 25.0 / 4.4 ms | 10.5 ms | 102.8 ms |
| 150k outside / 32 | 12.7 ms | 13.3 ms | 81.0 / 13.1 ms | 31.6 ms | 228.6 ms |
| 150k outside / 64 | 15.2 ms | 13.0 ms | 100.5 / 11.6 ms | 28.1 ms | 301.0 ms |

These are single completed workload samples, not stable production percentiles. Reload has three samples and includes JSON parsing/revalidation, excluding process startup. Memory is sampled at operation boundaries; it includes the worker's disposable correctness copies, checkpoint copies and reload work. Linux `VmHWM` records total process RSS peaks of 159,739,904; 184,119,296; 329,297,920; and 383,000,576 bytes respectively. Sampled deltas are neither retained-journal size nor an allocation attribution. Synthetic capture timing is reported separately and is not browser capture latency.

#### Browser results and measurement scope

The sustained browser mode passes at 32 and 64 packets in both desktop and mobile Chromium 152.0.7977.82. The 64 run uses twenty patch cycles, two certified no-op packets and a final insertion/undo pair: 64 packets and 21 native undos. This padding preserves the exact safe-reference → next-patch refusal boundary. Original and post-source fresh references survive GC reload; the next patch refuses atomically; subsequent human editing converges with sticky coverage loss.

| Packet limit / viewport | Checkpoint bytes | Capture p95, writers A / B | Maximum captured duration | Sampled heap growth, A / B | Aggregate renderer RSS growth |
| --- | --- | --- | --- | --- | --- |
| 32 / desktop | 247,054 | 5.4 / 4.0 ms | 7.5 ms | 2.60 / 3.44 MiB | 13.70 MiB |
| 32 / mobile | 247,111 | 4.0 / 4.3 ms | 6.5 ms | 2.49 / 3.47 MiB | 15.94 MiB |
| 64 / desktop | 503,643 | 5.0 / 4.0 ms | 5.3 ms | 2.58 / 3.60 MiB | 12.81 MiB |
| 64 / mobile | 503,635 | 4.6 / 4.3 ms | 6.4 ms | 2.54 / 3.46 MiB | 15.36 MiB |

These rows are the explicit `--capacity` runs. A subsequent complete default-capacity continuity run also passed all 22 desktop/mobile scenarios. Generated IDs and GC scheduling vary between runs. Browser capture measures the bridge's before/after hook work, not the intervening Yjs transaction or full browser task. Per-page heap is sampled after completed cycles; RSS aggregates the isolated browser's renderer processes rather than attributing one process per editor. The 64 desktop bridge retains 496,479 packet bytes per editor and at most 15,576 measured in-flight bytes. Browser packets, backend checkpoints and process memory are separate accounting scopes. Large-document browser profiling, per-renderer peak attribution, capture-attributed long tasks and concurrent-branch warm timings remain unmeasured; the backend stop condition already prevents advancement.

**Verification:** The changed continuity suite passed 95 tests with 723 assertions. The broader four-file continuity/undo/compact/rejected-target comparison reported 186 passes and the same eight rejected-witness failures, with 2,522 assertions. The real-binding bridge wrapper passed. Backend and explicit frontend-harness TypeScript and targeted ESLint passed; replacing the old coverage-reason regex also removes its recorded lint failure. No full application suites, production build or database rerun was needed for this experiment-only change. Reproduction commands are in [the harness README](../frontend/e2e/README.md#bounded-capacity-measurements).

**Next action at revision 12:** Profile the 32-packet/150k worker to distinguish journal admission/resolution allocations from correctness-clone and reload allocations. That follow-up is now recorded below. Preserve the full-evidence oracle and refusal regressions during any optimisation. Grouped native typing/undo and outside formatting remain the next semantic experiments; a larger cap does not resolve those gaps.

**Review and recovery:** Implementing-agent self-review checked complete-byte accounting, worst-case reserve bounds, independent frontier limits, atomic refusal, existing browser failure cases and the metric scopes above. The result is a bounded experiment with recorded limitations, not independent release approval. Returning experiment options to 32 restores the prior capacity; larger stored experimental checkpoints must retain their compatible reader rather than being silently truncated. No production migration, deployment or live-tool activation occurred. Compact/pruned evidence remains parked, and the existing live-document guard remains required.

### Allocation profiling follow-up

**Decision, 15 September 2026:** The memory failure is repeatable and is not confined to final reload. Keep the 32-packet default, 8 MiB evidence budget and 128-packet workload gate unchanged. Test one local optimisation next: reuse the disposable pre-event document to form the post-event document in `evaluate()`, after its pre-event checks have completed. Source inspection shows the same preimage is currently decoded twice on that path. This is an optimisation hypothesis, not allocation-stack attribution or a measured improvement.

**Instrumentation:** The persistent worker accepts `--profile-memory=observe` and `--profile-memory=gc`. It records before/after heap, RSS, external and array-buffer samples for admission, original/fresh resolution, patching, verification copies, convergence checks, checkpoint copy/serialization, reload and reload verification. Linux `VmHWM` increments identify new process-wide high-water marks, not independent per-operation peaks. The warm and checkpoint/reload segment summaries use the same initial baseline. Numeric profiling records do not retain operation objects.

Four isolated observational runs and four forced-GC diagnostic runs each completed ten cycles and retained 32 packets with a 150,000-character outside paragraph. Every run preserved exact original/fresh decisions, outside content/formatting and sampled identities, native undo, GC reload, atomic refusal and post-cap human convergence.

| Observation across four runs | Measured range |
| --- | --- |
| Full-workload sampled RSS growth | 203.3–213.5 MiB |
| Warm segment RSS growth, before final checkpoint/reload | 143.4–161.3 MiB |
| Original-reference resolution p95 | 85.0–88.6 ms |
| Admission p95 | 13.6–14.8 ms |
| Reload p95, three samples per run | 236.6–270.6 ms |

All four observational runs report the memory-gate breach. The warm segment still includes per-operation oracle snapshots and convergence checks, so this does not isolate journal-only RSS. The additional phase boundaries also make these memory samples more frequent than the earlier capacity run's samples.

#### Temporary work versus live copies

The forced-GC mode collects before and after each phase, outside operation timing, and reports `breaches: null`: its timing and memory results cannot establish the ordinary operating envelope. Across four diagnostic runs, original-reference resolution's maximum immediate reported heap rise was about 53.3–54.2 MiB; reload's was 113.9–121.0 MiB. Most of that reported growth disappeared after collection.

The latest diagnostic run additionally compares collected endpoints. These are net reported live-heap changes across a phase, not total allocated bytes:

| Phase | Maximum net heap growth across collected endpoints |
| --- | --- |
| Per-operation verification snapshot | 6.31 MiB |
| Original-reference resolution | 0.26 MiB |
| Final checkpoint copy | 6.16 MiB |
| Checkpoint serialization | 6.35 MiB |
| Reload, including the returned journal | 6.41 MiB |

That run's reload phase shows 117.1 MiB of immediate reported heap growth but only 6.41 MiB net across collected endpoints. Its original-reference resolution shows 53.3 MiB immediate growth but 0.26 MiB net. This supports investigating temporary materialisation during resolution and replay; it does not establish which individual allocations dominate. Verification snapshots are real additional live copies and remain in the correctness workload.

**Measurement limits:** Bun can refresh heap accounting during collection: a checkpoint copy may show zero immediate growth but a positive collected-endpoint delta. The output therefore labels the intermediate difference `maxReportedHeapDropBytes`; a negative value is not evidence that GC allocated the copied object. Samples miss within-phase peaks; RSS includes allocator retention and native state. Forced collection is diagnostic, not a production fix. No allocation-stack profiler or journal-only isolated memory benchmark was added. The first three runs per mode supplied phase events; the final run per mode verified the added segment and collected-endpoint summaries.

**Next experiment at revision 13:** Remove only the redundant second materialisation in the causal event-resolution path, retaining the same pre/post validation and disposable lifetime. That experiment is recorded below. Preserve full preimages, undo-source evidence, all caps and atomic refusal. Do not introduce a persistent document cache or reclaim evidence as part of that experiment.

**Verification and recovery:** All eight large-document correctness runs and one non-profiled small run passed. Backend TypeScript and targeted worker ESLint passed. This change instruments the worker only; the prior 95-test continuity and 22-scenario browser results were not rerun, and the eight rejected-witness failures remain unresolved. Reproduction commands are in [the harness README](../frontend/e2e/README.md#bounded-capacity-measurements). Implementing-agent self-review checked phase lifetimes, collected versus uncollected comparisons, measurement overhead and the unchanged correctness assertions. Omitting the profiling flag disables diagnostic collection and output. No journal semantics, production route, schema, frontend, deployment or live-tool activation changed.

### Disposable-document reuse follow-up

**Decision, 15 September 2026:** Retain the local reuse change for its repeated original-reference latency improvement. Do not claim a memory improvement or reopen the 128-packet workload gate. All four new observational runs still breach the 128 MiB memory gate, and their full-workload RSS range is slightly higher than the preceding control range.

**Implementation:** In `ContinuityJournal.evaluate()`, causal events now apply their update to the already-loaded disposable pre-event document after pre-event checks complete. The resulting post-event state runs the same location, PM-mapping and surviving-boundary checks. The outer `finally` destroys the document on success, refusal or exception. The new `applyResolvedDocUpdate()` helper in `docHistory.ts` uses the existing malformed-update wrapping and unresolved-struct/delete-set checks. Strict base64 and update-size checks still precede application. No persistent cache, retained-evidence change or limit increase was introduced; production callers retain their previous behaviour.

#### Repeated 32-packet/150k measurements

Four fresh observational workers and one forced-GC diagnostic worker each completed ten patch cycles and retained 32 packets. Every run preserved original and post-source fresh references, outside content/formatting and sampled identities, native undo, GC reload, exact refusal and continued human convergence.

| Metric | Preceding four controls | Four reuse runs |
| --- | --- | --- |
| Original-reference resolution p95 | 85.0–88.6 ms | 68.2–78.4 ms |
| Admission p95 | 13.6–14.8 ms | 12.5–13.9 ms |
| Reload p95, three samples per run | 236.6–270.6 ms | 235.6–271.7 ms |
| Warm sampled RSS growth | 143.4–161.3 MiB | 147.3–165.5 MiB |
| Full-workload sampled RSS growth | 203.3–213.5 MiB | 212.8–222.5 MiB |

The reuse runs' original-resolution p95 values were 68.15, 72.42, 75.89 and 78.43 ms; every run was below the preceding controls. Workloads ran serially, but these are separate process samples with generated IDs and normal GC variation, not a paired allocation experiment. The measurements support a latency gain, not a precise percentage or memory-regression attribution. Actual checkpoint sizes remain about 6.65 MB; representation and retained packet counts are unchanged.

The diagnostic run reports about 51.3 MiB of immediate original-resolution heap growth and 0.35 MiB maximum net growth across collected endpoints. Compared with the preceding 53.3–54.2 MiB immediate range, that is only a small diagnostic difference. It does not establish an RSS improvement. Diagnostic timings and `breaches: null` remain excluded from ordinary gate evidence.

**Verification:** `bun test --isolate src/collab/docHistory.test.ts src/collab/docContinuityExperiment.test.ts src/collab/docUndoContinuityExperiment.test.ts src/collab/docCompactContinuityExperiment.test.ts` passed **148 tests, 2,109 assertions**. New helper regressions cover malformed input, missing insertion dependencies, missing delete dependencies and binary/snapshot/formatting equality with fresh GC-enabled replay. The full `--continuity` browser run passed **22 desktop/mobile scenarios** in Chromium 152.0.7977.82, including native undo, concurrent delivery orders, structural refusal, byte/packet caps and post-cap convergence. Backend TypeScript and targeted ESLint passed. Full application suites and the rejected-witness comparison were not rerun; their eight known failures remain unresolved.

**Next action:** Investigate memory independently of this latency gain. Use paired baseline/reuse runs with the same generated history to determine whether the higher sampled RSS is repeatable before making another memory optimisation. Retain the verification copies and full-evidence oracle during that comparison. The 32-packet default, 8 MiB budget, 32-head frontier and live-document guard remain required.

**Review and recovery:** Implementing-agent self-review checked that pre-event checks finish before mutation, post-event checks still run, rejected updates reach the owning cleanup, and shared production validation behaviour is unchanged. This is local experimental evidence, not independent release approval. Restoring the former second materialisation reverses the optimisation without migrating or truncating checkpoints. No deployment, database migration or live-tool activation occurred.

### Multi-keystroke and sustained-use follow-up

This is the preceding revision-10 evidence record. Its 32-packet results remain valid for that run; the capacity/accounting measurements above are newer.

**Result, 15 September 2026:** From `a[bc]def`, one editor deletes `a` while another independently types `X`, then `Y`, in separate causal packets. Both delivery orders resolve the original target to `[2, 4]` and patch exactly `XYagentdef`. Both desktop/mobile editors preserve outside character identities and bold `def`, survive checkpoint reload, converge and continue typing.

**Proof change:** The outside-only fallback reconstructs the original passage at issuance. For every subsequent event in the disputed cut, it requires ancestry covering issuance and validated plain-text insertion/deletion steps strictly outside the mapped passage. It checks original item liveness, order and contiguity in each packet's preimage, postimage and merged current state; the postimage must also agree with the PM interval mapping. This removes the two-event/one-step restriction without adding a second resolver or stored witnesses. Multi-step packets and additional branches use the same checks. Relevant concurrent issuance, boundary insertion, outside replacement and undo are not newly certified by this fallback. Earlier structural-break and incomplete-lineage checks remain authoritative.

The backend fixtures include all six orders of the three-packet typing case, including child-before-parent delivery, issuance after an earlier edit, successive deletions after the original boundary anchor disappears, duplicate delivery and GC reload. Refusal cases include later inside/boundary steps and disjoint outside steps whose whole-document reconciler recreates target items. Identical visible text is insufficient. Existing recreated-character/container and permanent structural-break regressions still pass.

**Sustained-use measurement:** Each viewport runs ten cycles of fresh inspection, human outside insertion, native undo and an actual agent patch, alternating human writers. All ten patches succeed and preserve outside content, identities and formatting. One further insertion and undo bring the journal to 32 packets and 11 certified native undos. Both the original reference and a fresh reference issued after that last insertion remain safe through GC reload. The fresh reference needs the insertion's source evidence from before its own issuance. At this point, the serialized checkpoint is **247,111 bytes** in each measured run, well below 8 MiB. An attempted next patch fails admission with `LIMIT_EXCEEDED` and leaves binary state and evidence unchanged. Further human edits in both editors converge, mark coverage incomplete, and cause old-reference patches and fresh issuance to refuse without mutation.

**Retention decision:** Keep complete admitted evidence for the current bounded prototype. Do not reclaim records merely because they predate a live reference or because a reference expires: native undo can depend on older source records, and the earlier compact experiment already demonstrates the resulting false refusal. The measured bottleneck here is packet count, not the byte budget; these observations do not justify selecting the compact-journal design or increasing limits without latency/memory checks. The next capacity experiment should replay this same workflow at larger bounded full-evidence budgets before adding a pruning mechanism. Any later reclamation policy must preserve live-reference causal evidence and the supported native undo dependencies, or demonstrate that those dependencies have ended. No sustained production retention policy is claimed by this bounded result.

| Verification | Current worktree result |
| --- | --- |
| Backend continuity suite | **90 passed, 699 assertions** |
| Real browser continuity | **All 22 desktop/mobile scenario runs passed**, Chrome 152.0.7977.82; includes both multi-keystroke orders and sustained use, plus previous undo, structural and loss cases |
| Full configured backend suite | **646 passed, eight known rejected-witness failures, 4,566 assertions** across 654 tests; chained database phase not reached |
| TypeScript and bridge regression | Backend and strict harness typechecks passed; bridge wrapper passed its ten isolated real-binding cases |
| Lint | Only the previously recorded `no-control-regex` error at `docContinuityExperiment.ts:296` remains |

Commands are in [the harness README](../frontend/e2e/README.md). Database integration, full frontend suite/build, normal/capture modes and schema parity were not rerun for this experiment-only change. The implementing agent reviewed ancestry coverage, per-step mapping, original-item checks and refusal cases; this is self-review, not independent release approval. Only the continuity experiment/tests, browser runner and these two documents changed. Reverting the fallback extension restores the prior fail-closed restriction; there is no persistence migration or new protocol to reverse. General concurrent inside-target editing, broader undo, production capacity and live-tool integration remain gates.

### Concurrent outside-edit follow-up

This is the earlier single-step checkpoint. Its two-event restriction and then-unsupported multi-step/third-branch cases are superseded by the follow-up above; its recorded checks remain historical.

**Result, 15 September 2026:** From `abcdef`, issue a reference to `bc`. Two isolated editors concurrently delete the preceding `a` and insert `X` at the beginning. Both delivery orders now resolve the original reference to `[1, 3]` in `Xbcdef`; its patch produces exactly `Xagentdef`. Duplicate delivery and default-GC checkpoint reload preserve the result. Both desktop/mobile editors retain outside character identities and bold `def`, converge and continue typing.

**Implementation:** The existing boundary join can disagree because one branch re-anchors the start to the text-container beginning while the other retains a character-based boundary. `ContinuityJournal.evaluate()` now has a fallback for exactly two direct children of the issuance cut. Each must carry one validated plain-text insertion or deletion entirely outside the passage; insertions exactly at its boundaries do not qualify for this fallback. It reconstructs the original target from each retained preimage and uses public Yjs relative positions, with undo-following disabled, to prove that every original character remains live, ordered and contiguous in the original container. Opposite associations distinguish a live item from a deleted item that merely resolves to a nearby position. Only matching exact intervals are re-anchored. No reference registry, stored character-witness list or alternate storage layer was added.

| Check | Observed result |
| --- | --- |
| Backend continuity suite | 84 passed, 552 assertions; positive case in both delivery orders, duplicates, exact patch, outside anchors and checkpoint reload; recreated first/middle/last target characters or container refuse without mutation, including after reload |
| Unsupported branch shapes | Outside replacement, multiple steps and a third concurrent branch remain `unknown` in the conflicting-boundary fixtures; the existing independent split still permanently breaks the reference |
| Real browser continuity | All 16 desktop/mobile scenario runs passed in Chrome 152.0.7977.82, including four new outside-edit runs and the earlier two-undo/structural/loss scenarios |
| Bridge regression wrapper | Passed; launches the ten isolated real-binding cases |
| Full configured backend suite | 631 passed, the same eight rejected-witness failures, 4,395 assertions; chained database phase not reached |
| TypeScript and lint | Backend and strict harness typechecks passed. Lint reports only the previously recorded `no-control-regex` error in coverage-reason sanitisation at `docContinuityExperiment.ts:296` |

Reproduce the focused backend result with `bun test --isolate src/collab/docContinuityExperiment.test.ts` from `backend`, and the browser result with `bun run e2e/live-agent-doc-editing.ts --continuity` from `frontend`. The current run completed without the earlier Bun crash. Database, full frontend-suite/build, normal/capture modes and schema parity were not rerun for this experiment-only change; their earlier evidence remains separately dated.

**Limits and recovery:** This is an outside-only reconciliation fallback, not general concurrent passage editing. Its proof is restricted to two single-step branches from the issuance cut; broader branch shapes, relevant concurrent issuance and broader undo histories still need their own evidence. Missing coverage, unsupported operations and structural invalidation continue to block patches. The implementing agent reviewed the ancestry, item-liveness and negative-case checks; this is self-review, not independent release approval. The change is confined to the continuity experiment, its tests, the browser runner and these documents. Reverting it restores the prior fail-closed boundary comparison without changing the database or protocol. Evidence pruning remains parked, and live-tool activation remains gated.

### Two-native-undo follow-up

**Result, 14 September 2026:** A reference issued before `A` and `B` are separately inserted outside its target remains `safe` after undoing `B`, then `A`. Both native undos restore content without losing the original character/container identities. The old reference survives default-GC checkpoint reload and patches `before TARGET after` to `before agent after`. Both real editors converge and continue typing at desktop and mobile sizes.

**Narrow implementation:** The bridge and backend share [a local cancellation verifier](../backend/src/collab/docUndoContinuityExperiment.ts). The existing exact source-postimage check remains the first path. The extension accepts only a serial source → single inline text insertion → its undo → current inverse chain, with retained source IDs, exact binary endpoints and matching inverse steps. It replays the intervening insertion in a disposable native Yjs UndoManager: the insertion must delete no original items, its undo must create no new items, and the actual cancellation must match the expected binary state exactly. This proves cancellation of the new items rather than equality of visible text. The live editor's UndoManager is unchanged; permanent passage invalidation is still evaluated event by event.

**Verification:**

| Check | Result |
| --- | --- |
| Backend continuity and cancellation suites | 87 passed, 478 assertions; includes ten new cases rejecting wrong identical-character deletion, recreation of original items, missing/wrong sources, concurrent ancestry, wrong preimages/inverses, structural batches and absent cancellation |
| Real-binding bridge regression | Ten isolated cases pass; the original two-undo regression now requires four exact safe intervals, checkpoint survival and a successful patch; missing/false final source evidence still refuses without state or journal mutation |
| Continuity browser mode | All 12 desktop/mobile scenario runs pass on Chromium 152.0.7977.82, including two new two-undo runs and existing structural rejection/coverage-loss cases; fork patches verify outside identities, formatting and properties |
| Frontend suite and TypeScript | 78 passed, 340 assertions; explicit strict harness/test TypeScript and backend typecheck pass |
| Full backend suite | 624 passed, the same eight rejected-witness failures, 4,308 assertions; chained database phase not reached |

The first full backend invocation crashed in Bun 1.4.0 while other checks ran. A separate retry completed with the recorded eight failures; the crash cause is unestablished. The new helper and its tests pass ESLint; linting the existing continuity module also reports its pre-existing `no-control-regex` violation in coverage-reason sanitisation. Database integration, normal/capture browser modes and production builds were not rerun for this experiment-only change; their earlier evidence is unchanged.

**Limits and recovery:** This fixes the agreed two-insertion/two-undo case, not arbitrary multilevel, grouped, selective or concurrent undo. More than one intervening cancellation pair, replacement/deletion pairs and missing evidence can still return `unknown`. Pruned-source behaviour remains unchanged because the compact experiment is parked. The implementing agent reviewed the binary cancellation proof and negative fixtures; no independent release approval is claimed. Changes are confined to experiment/bridge code, tests and these documents. Reverting this extension restores the prior fail-closed behaviour without a database or protocol change. Broader causal concurrency is still a separate unresolved workflow requirement.

### Milestone-2A persistence evidence

**Result and implementation:** The first bounded 2A task completed on 12 September 2026. [Transaction-scoped history helpers](../backend/src/repositories/docCollabHistory.ts) own document locking, baseline selection, bounded replay and same-history checkpoints. [The existing repository](../backend/src/repositories/docCollab.ts) reuses those helpers and exposes an append that can join an outer transaction, plus internal current-read and compaction entry points. Current reads return projected content and the exact durable sequence separately from stored canonical JSON/version metadata. Transactions use the existing `READ COMMITTED` isolation so history queries after a lock wait observe the preceding commit.

**Integrity boundaries:** Complete reads and compaction refuse count/byte-truncated, corrupt or dependency-incomplete history. Existing update-only history is never reseeded from stale JSON. New reads reject embedded text values and multi-paragraph table/header cells known to project lossily, and reject projection that changes the binary state. The existing production projector still needs its schema/fidelity migration before current-read consumers are activated. Checkpoints retain original Yjs history, preserve deletion coverage and keep the existing three-snapshot retention policy; they do not advance canonical JSON, search text, version or canonical sequence.

**Real PostgreSQL coverage:** [The new integration suite](../backend/src/repositories/docCollab.integration.test.ts) passes **16 cases, 73 assertions**. Fixtures prove acknowledged updates are immediately readable; deletion-only changes survive despite unchanged state vectors; original container and surviving character anchors resolve after checkpoint/reload; late offline updates merge after compaction; and repeated checkpoints preserve binary state. Composed append/metadata/checkpoint transactions roll back on both an injected exception and a real foreign-key violation. Lock tests observe `pg_blocking_pids`: readers wait for prior writers, checkpoints exclude same-document appends while another document remains writable, and independent client updates converge. Boundary cases cover 200 versus 201 updates, byte limits, the database update-size constraint, oversized/corrupt snapshots, unresolved dependencies, missing documents and lossy projection refusal, with no partial writes on failure.

| Verification | Result |
| --- | --- |
| Fresh disposable PostgreSQL 16.14, all 55 existing migrations; `NODE_ENV=test RUN_DB_INTEGRATION_TESTS=true bun test --isolate integration` from `backend` with the test `DATABASE_URL` | **35 passed, zero failed, 171 assertions**, nine files, approximately 11.46 seconds; includes the 16 new cases and 19 existing cases |
| Backend `bun run test` | **614 passed, eight known rejected-witness failures, 4,295 assertions**, 622 tests; its chained integration phase was not reached, so the PostgreSQL suites were run explicitly above |
| Backend `bun run typecheck` | Passed |
| `bunx --no-install eslint src/repositories/docCollab.ts src/repositories/docCollabHistory.ts src/repositories/docCollab.integration.test.ts` from `backend` | Passed |

The eight unit failures remain the rejected witness candidate's five false outside-deletion rejections and three false split/new-neighbour acceptances. They are not new PostgreSQL failures. The configured unit suite therefore remains red. Frontend/browser/build checks were not rerun for this backend-only task; their earlier evidence remains historical.

**Review, scope and recovery:** The implementing agent inspected the extraction, transaction boundaries and regression results; this is self-review, not independent release approval. PostgreSQL ran in an isolated, loopback-only temporary cluster. No production database, schema migration, dependency change, protocol change or live-tool activation was involved. This task changes the repository, two new repository files and this plan. Reverting those changes needs no database reset. Binary Y.Doc reload was tested; a real server-process restart, production-shaped recovery rehearsal and 20-client lock/latency benchmark remain unproven. The later user direction parks evidence pruning and prioritises the bounded two-undo workflow described above; broader causal concurrency and production capacity remain unresolved.

### Milestone-1C local evidence

**Result and implementation:** Local experiment completed, 12 September 2026. [CompactContinuityJournal](../backend/src/collab/docCompactContinuityExperiment.ts) stores one original-history binary checkpoint and a serial delta/step window, omitting repeated preimages. It reconstructs and validates the existing `ContinuityJournal` on demand. Absolute issuance cursors survive checkpoint advancement without a registry or token rewrite. Only the current serial frontier is admitted; reversed or concurrent packets are refused, not buffered or silently serialised. Production code and the browser bridge do not use this representation.

**Reclamation and bounds:** Events older than the configured reference lifetime may move into the binary floor. Events at the exact cutoff remain retained. The tested live reference can be issued on an independent checkpoint reader, unknown to the writer, and still resolve after older evidence is reclaimed. Defaults remain 15 minutes, 32 retained events and 8 MiB serialized storage, including a 1,536-byte coverage-control reserve. Reconstruction has a separate 128 MiB serialized-evidence ceiling and existing binary history/update bounds; this is not a measured peak-memory limit. Admission and patches commit only after replay and retained-budget validation. Rejected candidates leave the journal unchanged; their human replica is unaffected. Coverage loss stays sticky and disables reclamation. Clock values behind the persisted issuance/admission/compaction watermark are refused; a trusted common monotonic clock and serial issuance remain assumptions.

**Measured evidence:** [The real-library suite](../backend/src/collab/docCompactContinuityExperiment.test.ts) has **31 passing tests and 1,340 assertions**, approximately **11.32 seconds** in the focused run. It compares exact decisions and binary state with the full-history model, tests actual patches and outside character/mark/container preservation, and requires unchanged state/evidence on refusal. It covers adjacent deletion/replacement, boundary insertion, temporary deletion, split/import and net-zero structural invalidation, recreated containers, Unicode, GC reload, expiry, malformed evidence/checkpoints, duplicate/stale/concurrent admission, quota failure and sticky loss.

| Experiment | Observation |
| --- | --- |
| 24 edits beside a 150,000-character paragraph | 206,173 bytes compact versus 5,019,633 bytes with repeated preimages in the focused run: about 24.3 times smaller serialized storage; exact counts vary slightly with generated Yjs IDs |
| 96 serial edits; 160 ms test TTL, 10 ms spacing, overlapping unregistered references | 184 live-reference comparisons matched exact oracle decisions; at most 17 retained records and 4,658 serialized bytes; 79 events reclaimed; checkpoint/GC restore after every edit |
| Original passage after prefix reclamation, adjacent deletions and replacement | Same original reference resolves to `[6, 11)` and patches `beforeHUMANafter` to `beforeagentafter`; outside identities survive |
| Native undo with its source retained | Exact safe decision agrees with the full-history model |
| Native undo after its older source was reclaimed, with a newer live reference | Full-history model: `safe`; compact model: `unknown`, including after reload; patch refuses without mutation and a fresh reference works |

**Decision and remaining work:** Keep this as a serial storage baseline, not the production resolver. It reduces repeated data but still reconstructs full preimages and runs the existing classifier. The binary floor can grow; high edit rates can exhaust the live window before TTL permits reclamation. The 96-edit fixture proves neither indefinite availability nor 20-client capacity. Undo source evidence can predate a still-valid reference, so TTL-based prefix reclamation alone is insufficient for full equivalence. The proposed undo-source retention extension is now parked under the user's later direction. Relevant concurrent issuance/admission, complete editor-writer support, latency/peak-memory budgets and durable protocol integration remain unresolved.

**Post-fix review:** The same implementing agent reread the corrected projection validation, continuity model, browser patch/refusal assertions and native multilevel-undo regression. The projection fixes held in the focused rerun. One additional assertion gap was corrected: browser fork-patch checks now compare prefix/suffix formatting within the target `XmlText`, as well as other text containers. The README's current witness pass count was corrected from 47 to 50. This is a focused self-review, not a separate independent technical review or human approval.

**Verification in this follow-up:** Backend `bun run test`: **614 passed, eight known rejected-witness failures, 4,295 assertions** across 622 tests; the chained database phase was not reached. Backend typecheck and explicit strict harness/test TypeScript passed. The bridge wrapper passed its ten isolated real-binding cases. The continuity browser mode passed all ten desktop/mobile scenarios on Chromium 152.0.7977.82 with the added formatting assertions. Its first invocation reached eight passes before the shell's 240-second timeout; a complete retry with a 600-second allowance passed. The compact model was tested only in backend fixtures, not this browser run. Frontend full-suite/build, normal/capture browser modes and schema parity retain their earlier milestone-1B evidence and were not rerun here because their implementation was unchanged. No database, deployment or recovery rehearsal was performed.

**Recovery and authority:** Only the two new isolated backend files, browser runner assertions, harness README and this plan changed in this follow-up. Existing user worktree changes were preserved. There are no production callers, new dependencies, persistence changes or commits. Removing the isolated compact experiment returns to the retained-preimage baseline; no production rollback is needed. The user's local experiment authorisation does not authorise milestone 2.

### Milestone-1B local evidence

**Result:** Scoped local prototype built, 12 September 2026; production gate remains blocked. [ContinuityJournal](../backend/src/collab/docContinuityExperiment.ts) retains causal packets alongside the Y.Doc. Each carries a complete prechange binary image, actual delta and accepted PM or certified undo/redo evidence. Strict replay checks compare causal preimages and deletion coverage, validate the resulting schema, and reject mismatched evidence. Pending dependencies prevent safe decisions. No reference-registration service, saved-text CAS, fuzzy matching or body fallback was added.

**Demonstrated behaviour:** The original reference to `TARGET` in `before TARGET after` survives deletion of both adjacent spaces, replacement with `HUMAN`, certified undo/redo and GC/checkpoint reload. Applying that same reference produces `beforeagentafter`. Query-local lineage transports the interval through certified steps and reanchors it only in the original live `XmlText`; surviving Yjs boundaries must agree. Target splits/imports remain permanently invalidating after undo, while unaffected inner spans and permitted literal edits remain valid. A newer reference can be invalidated by undo's structural effect. Recreated containers are never followed.

**Editor and delivery at this checkpoint:** [The bridge](../frontend/e2e/doc-continuity-bridge.ts) captures installed accepted batches, including appended normalisation and net-zero split/rejoin. Native undo/redo is not wrapped or replaced. Simple inverse certification is checked against the actual preimage and outcome; grouped/intervened cases can remain `unknown`. At the milestone-1B correction checkpoint, the real-binding two-undo regression restored content but left the original reference `unknown`: the later operation's retained CRDT history prevented certification of the second undo. The 14 September follow-up above fixes that specific insertion/undo sequence with a binary cancellation proof. Content and evidence still share one local transport packet, not one Yjs outcome transaction. Offline writers do not need to know the reference. Reversed/duplicate packets converge; untrusted evidence dependencies are not manufactured to release buffered human content.

**Review corrections:** The target adapter now rejects multi-paragraph table cells, including headers, before projection because BlockNote 0.49 can drop their paragraph separators when boundary marks differ. It also rejects unsupported embedded `Y.XmlText` values throughout the document, including outside an already-issued target. Single-paragraph table cells remain supported. Real merged-cell and outside-embed regressions require refusal without changing the supplied history. Browser safe decisions now assert exact UTF-16 endpoints; structural positive cases patch disposable checkpoint forks and check exact text, outside character/container identities, marks and properties. Rejected decisions exercise `apply()` and verify unchanged binary state and retained evidence in the same fork.

**Failure behaviour and bounds:** The journal retains at most 32 packets and 8 MiB, with 15-minute reference validity. `markIncomplete` persists the first coverage-loss reason and its known causal frontier. After loss, issuance and patching are refused even when binary content is unchanged; previously certified breaks remain decisive. Checkpoints retain full evidence and sticky coverage. They do not compact it, and expiry does not reclaim capacity. The relay preserves and acknowledges valid human updates rejected by evidence admission. Its separate one-packet overflow validator is capped at 12 MiB with an 8 MiB candidate-input cap; this does not enlarge the real journal budget or establish a distributed quota.

**Verification at the milestone-1B correction checkpoint:** Bun 1.4.0 and Chromium 152.0.7977.82. That rerun covered the configured backend/frontend suites, strict harness/test TypeScript, backend typecheck, frontend production build, schema parity and all three browser modes. Browser modes ran sequentially. The table records that checkpoint, before the additional milestone-1C tests above. Commands are in [the harness README](../frontend/e2e/README.md).

| Check | Result |
| --- | --- |
| `backend`: `bun test --isolate src/collab/docContinuityExperiment.test.ts` | 77 passed, 465 assertions |
| Retained witness / discriminator suites | 50 passed and eight ordinary failures / eight passed, 996 assertions; three new projection regressions passed |
| `backend`: `bun run test` | 583 passed, eight failed, 2,955 assertions; the same eight rejected-witness failures; chained integration phase not reached |
| `backend`: `bun test --isolate integration` | Prior separate run: 29 opt-in skips, no database exercised; not rerun for these corrections |
| `backend`: `bun run typecheck` | Passed |
| `frontend`: `bun run test` | 78 passed, 340 assertions; bridge wrapper additionally runs ten isolated real-library cases, including multilevel undo |
| `frontend`: `bun run build`; explicit strict harness/test TypeScript | Passed; existing large-chunk warning |
| `frontend`: `bun run e2e/schema-parity.ts` | Passed: 23 PM nodes, 11 marks, JavaScript default |
| Browser normal / `--capture` | Both viewports passed; previous normal/capture measurements retained below |
| Browser `--continuity` | Ten scenario runs passed across desktop/mobile; main scenario has 31 decision checks and zero mismatches per viewport |

The continuity main scenario delivers 32 packets (31 human, one agent), exercises four duplicates across eight reversed frames and preserves post-cap editing. Additional scenarios check step overflow and enclosing-transaction net-zero loss, concurrent cap overflow/retry, and byte-budget overflow. The concurrent-cap scenario preserves 33 human edits plus one acknowledged retry with 32 packets admitted. The byte-overflow scenario preserves a final `!` from a real three-step batch whose roughly 8.38 MB packet fits client admission but exceeds journal admission with its baseline. Invalid evidence remains rejected. EditorView, DOM, Y.Doc and Awareness continuity are asserted; no production hook or database is used.

**Limitations and next work:** Supported classification is intentionally narrow: direct paragraph text segments, recognised split/join/hard-break operations and compatible marks. Relevant concurrent issuance, competing lineage, broad replacement covering both outside boundaries, unsupported transforms and uncertified undo can return `unknown`; these are unresolved requirements, not permission to redefine the full acceptance matrix. The two-undo follow-up narrows one ordinary multilevel limitation; broader, grouped and selective cases remain unsupported. Multi-paragraph table cells are rejected as a projection limitation. References and producer evidence are trusted local inputs, not a secure production protocol. Durable content/evidence transactions, authentication, crash recovery, production capacity, all rich-content writers, mobile IME and load tests remain unimplemented or unverified. Milestone 1C supplies the parked serial storage comparison and its measured undo limitation.

**Technical and documentary review:** An earlier separate OpenCode review recorded a pass with limitations on 12 September 2026 after verifying coverage-loss, buffered-delivery and overflow-validation fixes. That review independently reran the configured suites, focused regressions, schema parity and typechecks before the corrections above (580 backend passes with eight failures; nine isolated bridge cases). One initial backend run ended in a Bun segmentation fault; a sequential retry completed, with the crash cause unestablished. Browser and production-build results were supplied implementation evidence. A subsequent source review identified the two projection defects, browser assertion gap and additional multilevel-undo limitation recorded above. Their corrections have implementation verification in the updated table; no separate post-correction review has been performed. These agent assessments are not human release approval, representative-human evaluation or permission to begin milestone 2.

**Recovery:** This build introduced no production callers, changed no production guards or collaboration protocol, and performed no commit, deployment or database mutation. Existing worktree dependency/schema changes predate this follow-up. Omit `--continuity` to run the normal harness; no production rollback is required.

### Milestone-1A local evidence

**Historical result:** Bounded experiment complete; milestone exit blocked, 12 September 2026. Milestone 1B supersedes this gate assessment, not these recorded observations. Implementing agent: OpenCode with separate research/implementation agents. The corrected witness candidate is retained only to reproduce failure, with a warning against integration. No span resolver consumes the milestone-1A capture records.

**Baseline correction:** The revision-3 candidate present at the start of this follow-up reported 47 passes and three failures, not the older 42 ordinary passes/two expected failures. Two failures were malformed fixtures: a split omitted a generated block ID, and a `Transform` called nonexistent `insertText`. These are repaired. Required unrelated deletions now assert success; whole-span split and new-neighbour imports assert rejection. The resulting suite reports 47 passes and eight ordinary failures: five false rejections and three false acceptances. The mirrored preceding-container import is labelled synthetic, not claimed as observed browser keyboard behaviour.

**Decisive evidence:** [docTargetDiscriminator.test.ts](../backend/src/collab/docTargetDiscriminator.test.ts) compares whole-span split, interior-span split, existing-neighbour merge and post-issuance-neighbour merge with permitted replacement/boundary insertion plus unrelated edits. Each pair begins with identical binary state and references. Alternative timelines use the same writer ID and are never merged together. Distinct ProseMirror steps yield byte-identical emitted updates when reconciled together, and byte-identical final states when permitted edits are reconciled separately. Original target identities survive. All four pairs pass with GC enabled/disabled and repeated binary reload.

Consequently, a resolver receiving only that reference and current binary state cannot give the two required answers. More issuance-time witnesses or raw Yjs update retention cannot recover the erased distinction in the paired single-reconciliation cases. Explicit structural provenance before reconciliation is necessary for the unchanged contract; these tests do not prove any proposed provenance design sufficient.

**Capture result:** [doc-structural-capture.ts](../frontend/e2e/doc-structural-capture.ts) is opt-in through the harness, using accepted installed ProseMirror plugin state and Yjs `beforeTransaction`. Ordinary local root/appended batches are recorded inside the same ySync transaction as content. Records carry step JSON, an encoded prechange snapshot and structural counts. Remote replay does not manufacture local records; no target registration is required. There is no complete causal prechange document, span-local classifier or production consumer. `safeSpanSupport` is always `false`.

The maintained browser runner exercises real Enter/Backspace/Delete splits and merges, hard-break removal, whole-target replacement, appended UniqueID normalisation, concurrent editing while a reference is unknown to the other replica, reversed/duplicate delivery and default-GC binary reload. Per viewport it checks 32 content/capture records across 35 received updates, 28 sequential plus four concurrent sender-state pre-snapshots, and eight reversed/duplicate delivery frames. Both editors retain their view, DOM, Y.Doc and Awareness, with no remount/reconnect or browser/relay errors.

**Reasons to stop at that revision:** Effective undo and redo each change content without capture; a no-op undo adds no record. The undo policy was then undecided; revision 5 records the subsequent approval. Snapshot bytes survive reload, but snapshots do not themselves retain historical content. The reconstruction API's rejection of `gc:true` proves an API restriction, not which content was collected. Sufficient retained causal evidence and span-local interpretation were unproven. Net-zero PM batches and enclosing Yjs transactions are not certified by this older capture mode.

Capture admits at most 32 records and 64 KiB of serialised shared records locally, with additional batch/diagnostic bounds. At exhaustion it reports incomplete coverage and stops capture while editing continues; the runner verifies one successful uncaptured post-cap edit. Concurrent peers can overshoot local admission before receiving each other's records, so this is not a distributed quota. Missing, exhausted or unsupported evidence cannot be treated as a clean span.

**Verification:** Bun `1.4.0`, Chromium `152.0.7977.82`, Puppeteer Core `24.22.0`; installed schema-affecting versions remain those recorded in the historical dependency section. Run browser modes sequentially to avoid Vite port collisions. Commands and scope are also in [the harness README](../frontend/e2e/README.md).

| Directory | Command | Milestone-1A result |
| --- | --- | --- |
| `backend` | `bun test --isolate src/collab/docTargetExperiment.test.ts` | 47 passed, eight failed; 414 assertions; no expected-failure acceptance |
| `backend` | `bun test --isolate src/collab/docTargetDiscriminator.test.ts` | Eight passed; 996 assertions |
| `backend` | `bun run test` | 503 passed, eight failed; 2,458 assertions; approximately 12.32 seconds; chained integration phase not reached |
| `backend` | `bun test --isolate integration` | Separately run: 29 opt-in skips, zero failures; no database exercised |
| `backend` | `bun run typecheck` | Passed |
| `frontend` | `bun run e2e/schema-parity.ts` | Passed: 23 PM nodes, 11 marks, JavaScript default |
| `frontend` | `bun run e2e/live-agent-doc-editing.ts` | Passed desktop/mobile; 34 human updates and observed 89-byte agent delta each |
| `frontend` | `bun run e2e/live-agent-doc-editing.ts --capture` | Diagnostic assertions passed desktop/mobile, including two undo/redo coverage gaps and post-cap editing; not span acceptance |
| `frontend` | `bun run test` | 77 passed; 339 assertions; existing React act warning |
| `frontend` | `bun run build` | Passed TypeScript/Vite; existing large-chunk warnings |

The implementing harness agent also ran a strict TypeScript check targeting the runner and its imported client/capture files, which the normal frontend build excludes; the exact command is in the README. No production MCP/database integration, application-hook delivery, mobile IME, load benchmark, migration or recovery rehearsal was performed.

**Decision and recovery:** Do not integrate the witness candidate or capture prototype. Preserve exact-text mutation, outward anchors, live ancestry and the mandatory positive/negative fixtures. The next maintainer decision concerns a bounded durable-provenance design, including undo semantics and causal interpretation, not another current-state witness heuristic. This follow-up changed only local experiment/tests/harness/documentation; it did not add production callers, alter guards or protocols, commit, deploy or modify database/history. The broader worktree already contained dependency/schema extraction changes from milestone 1. No production rollback is needed; omit the opt-in capture flag to run the normal harness.

**Technical review:** A separate OpenCode reviewer reproduced the eight counterexamples and all eight candidate failures, and reran schema parity. It found no high/medium issue in the scoped experiment and supported the stop decision. One low finding corrected the GC assertion's description: API refusal is not measured content loss. The reviewer inspected but did not rerun the supplied browser results.

**Revision-4 documentary review:** Pass with recorded limitations, 12 September 2026. The separate reviewer checked the plan, harness README and revised GC comment against the previously reviewed implementation and independently reproduced targeted test results. No concrete inaccuracies or contradictions were found within that scope. Browser, full-suite, build and additional typecheck results were treated as supplied implementation evidence, not independently rerun during this review. The exact recorded harness typecheck command was added afterwards. This is agent review, not milestone acceptance, independent human technical approval or representative-human evaluation.

### Milestone-1 local evidence

**Historical result:** Blocked, 11 September 2026. This section records the original experiment, not current source behaviour or reproducible counts; milestone-1A above supersedes its gate assessment. Implementing agent: OpenCode. A separate OpenCode general reviewer found the surviving-container boundary failures. This is agent evidence, not independent human release approval. Tuesday maintainer owns the unresolved target-semantics decision; no personal name has been supplied.

**Changes:** Exact Yjs `13.6.31` in both packages; BlockNote packages pinned at `0.49.0`; backend direct `y-prosemirror` `1.3.7` and matching `@blocknote/code-block`; frontend direct development dependency `puppeteer-core` `24.22.0`. The frontend schema was extracted unchanged into `block-note-schema.ts`. The backend experiment uses `docTargetSchema.ts`; the existing production `docContent.ts` projector is unchanged.

The lockfiles still contain backend/frontend Tiptap `3.30.1`/`3.27.3` and ProseMirror View `1.42.2`/`1.42.1`. These were not broadly upgraded: independent subprocesses matched the generated block/inline/style schemas and ordered ProseMirror specs (23 nodes, 11 marks, `javascript` code defaults), and the browser experiment exercised both graphs through binary updates. This is measured parity for the tested fixtures, not a claim that all transitive versions or parser/renderer functions are identical.

**Identity encoding tested:** Public `Y.createRelativePositionFromTypeIndex(container, 0, -1)` with public binary encode/decode; absolute resolution passes `false` for undo following and verifies live traversal from `prosemirror`. Real BlockNote block and inline identities survive binary reload and checkpoint/replay, including 205 updates and default GC. Deleted non-GC containers that still resolve non-null are rejected by live ancestry; same-ID recreation cannot retarget. Outward span endpoints use start association `-1`, end association `0`.

**Adapter scope:** [docTargetExperiment.ts](../backend/src/collab/docTargetExperiment.ts) is an unsigned, in-memory experiment with no production callers. It materialises a disposable binary state, directly edits `Y.XmlText`, and validates projection without accepting normalisation. It supports homogeneous spans and typed replacement of empty/single-`XmlText` bodies. Complex body replacement, mark-boundary crossings, and unsupported inline nodes are rejected. Tests cover exact `aaa` deletion identity, disjoint edits, delayed outside edits, whole-selection replacement, empty bodies, links, tables, nested blocks, Unicode and malformed input. Opaque data already in Yjs survives; returned blocks are a schema projection, not a persisted metadata sidecar. Atomic database persistence and opaque canonical-metadata composition remain unimplemented.

**Historical failed acceptance:** The original fixtures exercised mapped ProseMirror structural edits on actual BlockNote XML; their required semantics are retained in the corrected current suite:

| Starting target and intervening edit | Observed resolution and patch | Required result |
| --- | --- | --- |
| `TARGET` in `before TARGET after`; split through `TAR\|GET` | Old reference resolves to `[7, 10)`, replacing only `TAR`; blocks become `before agent` and `GET after` | `TARGET_UNRESOLVABLE`, no patch |
| Whole `first` paragraph followed by `second`; merge into the first surviving container | Old reference expands to `[0, 11)`, replacing `firstsecond` with `agent` | `TARGET_UNRESOLVABLE`, no patch |

The original reference recorded containers and relative locations, not the originating structural command. The observed split resembled a permitted suffix deletion; the merge resembled a permitted boundary insertion. That evidence alone did not prove indistinguishability; milestone-1A subsequently supplied byte-identical counterexamples. No fuzzy retargeting, paragraph fallback, text/version CAS, or broad rejection of unrelated structural edits was added to hide the gap.

**Historical verification:** Commands below were executed against the original experiment with Bun `1.4.0`, Chromium `152.0.7977.82`, and Puppeteer Core `24.22.0`. Their counts are not expected from current source. The former expected-failure name filter has been withdrawn because current acceptance tests use ordinary assertions. Use the milestone-1A table and [README](../frontend/e2e/README.md) for reproduction.

| Directory | Command | Observed result |
| --- | --- | --- |
| `frontend` | `bun run e2e/schema-parity.ts` | Passed; independent frontend/backend schema comparison |
| `backend` | `bun test --isolate src/collab/docTargetExperiment.test.ts` | 42 ordinary passes and **two expected failures**; Bun reports 44 pass, 369 assertions |
| `frontend` | `bun run e2e/live-agent-doc-editing.ts` | Passed at 1280x800 and 390x844: two real editors, 34 keyboard-generated updates and one observed 89-byte phrase/body delta per scenario |
| `backend` | `bun run test` | Final run: 490 ordinary passes plus two expected failures (Bun reports 492 pass), 1,417 assertions, no unexpected failures; 29 opt-in integration tests skipped; 11.33 seconds plus 57 ms for the skipped integration pass |
| `backend` | `bun run typecheck` | Passed after the boundary fixtures |
| `frontend` | `bun run test` | 77 passed, no failures |
| `frontend` | `bun run build` | Passed; Vite reported large-chunk warnings |

The browser assertions cover continued typing without refocusing, exact PM/DOM selection, nonzero scroll, stable mounted view/DOM/Y.Doc, outside rich content and convergence. Services bind loopback interfaces and use one binary baseline, with cleanup on failure. They do not use production MCP, the application's collaboration hook or PostgreSQL, and do not prove mobile IME, reconnect, generation fencing or durable delivery. No database integration, load benchmark, migration or recovery rehearsal was run.

**Historical decision and recovery:** Stop at the milestone-1 gate. Keep milestones 3/4 provisional and their token layout unfrozen; the basic container encoding passed its fixtures but did not settle span semantics. Follow-up work had to demonstrate structural rejection while preserving permitted replacement/boundary edits and unrelated human changes, or obtain explicit approval for changed semantics. Structural capture was not authorised at that point; the subsequent milestone-1A authority extends only to the bounded local experiment above. The original experiment had no production callers and did not change collaborator guards, repositories, services, MCP tools or WebSocket protocols. No production data/history was modified and no migration or release rollback was needed.

**Evidence-record review:** A separate OpenCode agent checked the failure fixtures, dependency versions, commands, limitations and blocked status. Documentary result: pass with a minor historical-baseline wording correction, applied above. The final full-suite counts were then updated from the implementing agent's rerun. No representative-human evaluation or human technical approval has occurred; this record is local engineering evidence, not an approved operational procedure.

### Supplied revision-1 review

| Field | Record |
| --- | --- |
| Review result | Pass with recorded limitations; corrections required before implementation. |
| Reviewer | Claude (Fable 5.1), agent review against repository source, as supplied by the user. Not the independent human review required before release. |
| Evidence inspected | `plan/live-agent-doc-editing.md`; backend `services/doc.ts`, `collab/hub.ts`, `repositories/doc.ts`, `repositories/docCollab.ts`, `collab/docHistory.ts`, `routes/collab.ts`, `mcp/idempotency.ts`, `db/schema.ts`, `config.ts`, `services/hiring.ts`, `services/policy.ts`; frontend collaboration hook and BlockNote editor; both manifests and installed versions; `AGENTS.md`, `docker-compose.yml`, `docs/mcp.md`, repository Tuesday skill. |
| Limitations | No tests run; Yjs relative-position behaviour not exercised by this reviewer; performance claims unmeasured. |
| Required correction and owner | Corrections 1 to 7 below, Tuesday maintainer, before milestone 1 begins. Personal maintainer name not supplied; must be recorded before release. |
| Retest result | Passed with recorded limitations in the supplied Claude revision-2 retest below. Its additional rejection-fixture requirement is now explicit in milestone 1, step 2. |

### Revision-2 correction record

| Finding | Plan correction |
| --- | --- |
| 1. Catch-up contention | Event-triggered baseline, no per-client 30-second poll. Benchmark reconnect/anomaly bursts with 20 typing clients; consider hub state only if evidence requires it. Record silent-delivery limitation. |
| 2. Projection cost | Prefer read/agent-time projection plus bounded server search refresh. Compare per-human-update projection in milestone 2 before choosing; keep scoped reads current. |
| 3. Container identity | Public relative-position encoding candidate and live reachability checks. Milestone 1 must pin/prove block and inline-container identity through reload, compaction, GC, and deletion/recreation. |
| 4. Dependencies | Record both Yjs versions, transitive backend y-prosemirror, and code-block configuration difference. Align/pin manifests and lockfiles before adapter work. |
| 5. Receipt retention | Accept no timed pruning for compact text-free first-release receipts, with cascade/restore caveats and measured storage budget. No indefinite excerpt retention. |
| 6. Reset writers | Evidence table names both version-checked and unversioned reset functions, including hiring/policy use. |
| 7. Review ownership | Template fields name the supplied agent reviewer and Tuesday maintainer as correction owner. The supplied revision-2 retest is recorded below; independent human approval remains pending. |

Generation fencing and exact update acknowledgements remain required. Other milestone-3/4 mechanics are provisional pending the identity experiment and benchmark. The reference and delivery sections now separate ordered build steps from constraints.

### Revision-2 agent retest

| Field | Record |
| --- | --- |
| Review result | Pass with recorded limitations, 11 September 2026. All seven requested corrections addressed; no material internal contradiction found within the reviewed scope. |
| Reviewer | OpenCode general reviewer agent, separate from the supplied Claude review and the required human release reviewer. |
| Evidence inspected | Complete revision-2 plan; targeted installed dependency/manifests, reset-writer/caller, receipt-schema, and idempotency source checks. Documentation whitespace check: `git diff --no-index --check /dev/null plan/live-agent-doc-editing.md` passed. |
| Limitations | Read-only source/document review. No application tests, Yjs experiments, benchmarks, or recovery rehearsal performed. |
| Required correction and owner | No additional material correction identified. Tuesday maintainer retains ownership of milestone evidence, named human assignments, and release approval. |
| Retest result | Revision-2 document consistency passed within this scope. The subsequent supplied Claude retest is recorded below; independent human release review remains pending. |

### Supplied revision-2 retest

| Field | Record |
| --- | --- |
| Review result | Pass with recorded limitations. |
| Reviewer | Claude (Fable 5.1), agent retest of revision 2 against repository source and installed Yjs 13.6.31, as supplied by the user. Not the independent human release review. |
| Evidence inspected | Complete revision-2 plan; `frontend/node_modules/yjs/src/utils/RelativePosition.js`: `createRelativePositionFromTypeIndex`, `createRelativePosition`, and `createAbsolutePositionFromRelativePosition`. |
| Limitations | No tests run; relative-position behaviour confirmed by reading source, not by executing it; performance claims unmeasured. |
| Required correction and owner | Add a deleted but not garbage-collected container rejection fixture to milestone 1, step 2. Owner: Tuesday maintainer, before milestone 1 begins. This documentation correction is incorporated; fixture implementation and execution remain pending. |
| Retest result | Passed; no material contradiction found. |

### Independent release review

| Field | Record |
| --- | --- |
| Review result | Pending; production enablement blocked until the release gate is satisfied. |
| Reviewer | Independent human technical reviewer, to be named by the Tuesday maintainer before release. |
| Evidence inspected | None yet. Require implementation, saved integration/performance results, and migration/recovery rehearsal evidence. |
| Limitations | Plan and agent reviews are not implementation verification, human approval, or a recovery rehearsal. |
| Required correction and owner | Tuesday maintainer: assign named people, obtain review, close release findings, and record release/rollback builds. |
| Retest result | Pending implementation and human review. |

**Maintenance triggers:** Failed acceptance tests, dependency/schema changes, changed reference semantics, a multi-process deployment, or an incident involving lost/overwritten document content. Revise this plan and the associated tool guidance together.
