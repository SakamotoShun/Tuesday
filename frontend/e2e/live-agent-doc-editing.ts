import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { openSync, closeSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { ServerWebSocket } from "bun"
import { createServer } from "vite"
import react from "@vitejs/plugin-react"
import puppeteer, { type Page, type KeyInput } from "puppeteer-core"
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core"
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs"
import * as Y from "yjs"
import { blockNoteSchema } from "../src/components/docs/block-note-schema"
import type {} from "./live-agent-doc-editing-client"
import type { ContinuityPacket } from "./doc-continuity-bridge"

// Wire-only types: the backend's module graph and compiler settings stay isolated.
type ContinuityCheckpoint = { version: 1; epoch: string; baseline: string; limits: { ttlMs: number; maxPackets: number; maxBytes: number }; packets: ContinuityPacket[]; coverage: { status: "complete" } | { status: "incomplete"; reason: string; knownCut: string[] } }
type ContinuityReference = { epoch: string; issuedCut: string[]; issuedSnapshot: string; issuedAt: number; expiresAt: number; target: unknown }
type ContinuityDecision = { status: "safe"; start: number; end: number } | { status: "broken" | "gone" | "unknown" | "expired"; reason?: string }
type ExpectedDecision = Exclude<ContinuityDecision["status"], "safe"> | readonly [start: number, end: number]

const captureMode = process.argv.includes("--capture")
const continuityMode = process.argv.includes("--continuity")
const evidenceSyncMode = process.argv.includes("--evidence-sync")
const capacityArg = process.argv.find(value => value.startsWith("--capacity="))
const capacity = Number(capacityArg?.split("=")[1] ?? 32)
assert([32, 64, 128].includes(capacity) && (!capacityArg || continuityMode), "--capacity=32|64|128 requires --continuity")
assert(!(captureMode && continuityMode), "--capture and --continuity are mutually exclusive")
assert(!evidenceSyncMode || (continuityMode && !capacityArg), "--evidence-sync requires --continuity without --capacity")
const continuityFailures: string[] = []
type CaptureProbe = Extract<ReturnType<Window["harness"]["probeCapture"]>, { enabled: true }>
type CaptureRecord = CaptureProbe["records"][number]
type CapturePhase = "ordinary" | "undo" | "concurrent" | "cap"
const captureKey = "__experiment_structural_capture"
const frontend = fileURLToPath(new URL("../", import.meta.url))
const backend = fileURLToPath(new URL("../../backend/", import.meta.url))
const adapterPath = join(backend, "src/collab/docTargetExperiment.ts")
assert(await Bun.file(adapterPath).exists(), `Adapter not ready: ${adapterPath}. Rerun after the adapter agent finishes.`)

// Adapter calls run in the backend package's own process/module graph. References
// and state never leave this local experiment; no app endpoints or database run.
function adapter(action: "inspect" | "patch", state: Uint8Array, operations?: unknown[]) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, "--eval", `
      import { inspectTargets, applyTargetPatch } from "./src/collab/docTargetExperiment.ts";
      const input = JSON.parse(await Bun.stdin.text());
      const state = new Uint8Array(input.state);
      const result = input.action === "inspect"
        ? inspectTargets(state)
        : applyTargetPatch(state, input.operations);
      console.log(JSON.stringify(result, (_key, value) => value instanceof Uint8Array ? Array.from(value) : value));
    `],
    cwd: backend,
    stdin: Buffer.from(JSON.stringify({ action, state: Array.from(state), operations })),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  })
  assert.equal(result.exitCode, 0, `Adapter ${action} failed:\n${result.stderr.toString()}`)
  assert.equal(result.stderr.toString(), "", `Adapter ${action} diagnostics`)
  return JSON.parse(result.stdout.toString())
}

function continuityAdapter(input: { checkpoint?: ContinuityCheckpoint; baseline?: string; action: "init" | "accept" | "issue" | "evaluate" | "verifyPatch" | "capacityRefusal" | "apply" | "roundtrip" | "markIncomplete" | "refusals"; interval?: readonly [number, number]; reason?: string; packet?: ContinuityPacket; block?: string; from?: number; to?: number; inlineIndex?: number; ref?: ContinuityReference; text?: string; currentState?: string }) {
  // A regular temporary file avoids Bun's nonblocking stdout pipe truncating
  // large checkpoint responses. Calls are synchronous and the runner removes it.
  const outputPath = join(temp, "continuity-response.json")
  const output = openSync(outputPath, "w", 0o600)
  let result: ReturnType<typeof Bun.spawnSync>
  try { result = Bun.spawnSync({
    cmd: [process.execPath, "--eval", `
      import { ContinuityJournal, ContinuityError } from "./src/collab/docContinuityExperiment.ts";
      import assert from "node:assert/strict";
      import { encodeContainerIdentity } from "./src/collab/docTargetExperiment.ts";
      import * as Y from "yjs";
      const input = JSON.parse(await Bun.stdin.text());
       const journal = input.checkpoint ? ContinuityJournal.fromCheckpoint(input.checkpoint) : new ContinuityJournal(input.baseline, { maxPackets: ${capacity} });
      let result;
      if (input.action === "accept") {
        try { result = journal.accept(input.packet); }
        catch (error) {
          if (!(error instanceof ContinuityError) || error.code !== "LIMIT_EXCEEDED") throw error;
          if (Buffer.byteLength(JSON.stringify(input.packet)) > 8 * 1024 * 1024) {
            throw new ContinuityError("INVALID_PACKET", "Candidate exceeds the bridge's 8 MiB bound");
          }
          // Admission currently precedes evidence/causal validation in accept().
          // Reuse its validator with the declared cut as a temporary baseline.
          const checkpoint = journal.checkpoint();
          const packets = new Map(checkpoint.packets.map(packet => [packet.id, packet]));
          const ancestors = new Set();
          const visit = (id) => {
            if (ancestors.has(id)) return true;
            const packet = packets.get(id);
            if (!packet) return false;
            ancestors.add(id);
            return packet.parents.every(visit);
          };
          const completeCut = input.packet.parents.every(visit);
          // This subset is only a validation baseline, not the real journal's
          // coverage frontier, which can contain an unrelated admitted sibling.
          const baseline = completeCut
            ? ContinuityJournal.fromCheckpoint({ ...checkpoint, coverage: { status: "complete" }, packets: checkpoint.packets.filter(packet => ancestors.has(packet.id)) }).currentState()
            : input.packet.before;
          // One <=8 MiB packet plus a <=2 MiB binary baseline (base64 encoded)
          // and JSON delimiters fit below 12 MiB. This does not raise admission.
          new ContinuityJournal(baseline, { maxPackets: 1, maxBytes: 12 * 1024 * 1024 }).accept({ ...input.packet, parents: [] });
          result = { status: "limit-exceeded", reason: error.message };
        }
      }
      if (input.action === "markIncomplete") journal.markIncomplete(input.reason);
      if (input.action === "issue") result = journal.issueSpan(input.block, input.from, input.to, input.inlineIndex);
      if (input.action === "evaluate") result = journal.evaluate(input.ref, input.currentState);
      if (input.action === "verifyPatch") {
        // This subprocess owns a disposable checkpoint fork. Exercise apply(),
        // never publish the resulting packet to the live relay or its journal.
        result = journal.evaluate(input.ref, input.currentState);
        const before = journal.currentState(), checkpoint = journal.checkpoint();
        if (result.status !== "safe") {
          assert.throws(() => journal.apply(input.ref, "must not apply", input.currentState),
            error => error instanceof ContinuityError && error.code === "UNKNOWN");
          assert.deepEqual(journal.currentState(), before, "Refusal changed binary history");
          assert.deepEqual(journal.checkpoint(), checkpoint, "Refusal changed retained evidence");
        } else {
          assert.deepEqual([result.start, result.end], input.interval, "Exact patch interval");
          const doc = new Y.Doc();
          try {
            Y.applyUpdate(doc, before);
            const root = doc.getXmlFragment("prosemirror");
            const nodes = () => Array.from(root.createTreeWalker(() => true));
            const originalNodes = nodes();
            const identities = originalNodes.map(encodeContainerIdentity);
            const target = Y.createAbsolutePositionFromRelativePosition(
              Y.decodeRelativePosition(Buffer.from(input.ref.target.container, "base64")), doc, false)?.type;
            assert(target instanceof Y.XmlText);
            const plain = text => text.toDelta().map(part => part.insert).join("");
             const ids = text => Array.from({ length: text.length }, (_, index) =>
               Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, index, 0)).item);
             const marks = text => text.toDelta().flatMap(part =>
               Array.from({ length: part.insert.length }, () => part.attributes ?? {}));
             const [start, end] = input.interval;
             const oldText = plain(target), oldIds = ids(target), oldMarks = marks(target);
            const outside = originalNodes.filter(node => node instanceof Y.XmlText && node !== target)
              .map(node => ({ node, delta: node.toDelta(), ids: ids(node) }));
            const attributes = originalNodes.filter(node => node instanceof Y.XmlElement)
              .map(node => ({ node, value: node.getAttributes() }));
            const replacement = "AGENT";
            const applied = journal.apply(input.ref, replacement, input.currentState);
            Y.applyUpdate(doc, applied.update);
            assert.equal(plain(target), oldText.slice(0, start) + replacement + oldText.slice(end));
            assert.deepEqual(ids(target).slice(0, start), oldIds.slice(0, start), "Prefix character identity");
             assert.deepEqual(ids(target).slice(start + replacement.length), oldIds.slice(end), "Suffix character identity");
             assert.deepEqual(marks(target).slice(0, start), oldMarks.slice(0, start), "Prefix marks");
             assert.deepEqual(marks(target).slice(start + replacement.length), oldMarks.slice(end), "Suffix marks");
            assert.deepEqual(nodes().map(encodeContainerIdentity), identities, "Surviving container identities");
            for (const item of outside) {
              assert.deepEqual(item.node.toDelta(), item.delta, "Outside text and marks");
              assert.deepEqual(ids(item.node), item.ids, "Outside character identities");
            }
            for (const item of attributes) assert.deepEqual(item.node.getAttributes(), item.value, "Outside properties");
            assert.deepEqual(Y.encodeStateAsUpdate(doc), journal.currentState(), "Applied delta and journal agree");
          } finally { doc.destroy(); }
        }
      }
      if (input.action === "apply") result = journal.apply(input.ref, input.text, input.currentState);
      if (input.action === "capacityRefusal") {
        const before = journal.currentState(), checkpoint = journal.checkpoint();
        assert.equal(journal.evaluate(input.ref, input.currentState).status, "safe");
        assert.throws(() => journal.apply(input.ref, "must not apply", input.currentState),
          error => error instanceof ContinuityError && error.code === "LIMIT_EXCEEDED");
        assert.deepEqual(journal.currentState(), before);
        assert.deepEqual(journal.checkpoint(), checkpoint);
        result = { refused: true };
      }
      if (input.action === "refusals") {
        const refused = (run) => {
          try { run(); return false; }
          catch (error) { if (!(error instanceof ContinuityError) || error.code !== "UNKNOWN") throw error; return true; }
        };
        result = { issue: refused(() => journal.issueSpan("phrase", 7, 13)),
          apply: refused(() => journal.apply(input.ref, "must not apply", input.currentState)) };
      }
      if (input.action === "roundtrip") {
        const restored = ContinuityJournal.fromCheckpoint(JSON.parse(JSON.stringify(journal.checkpoint())));
        const doc = new Y.Doc(); Y.applyUpdate(doc, restored.currentState());
        result = { decision: restored.evaluate(input.ref, Y.encodeStateAsUpdate(doc)), gc: doc.gc };
        doc.destroy();
      }
      await Bun.write(Bun.stdout, JSON.stringify({ result, checkpoint: journal.checkpoint(), heads: journal.heads(), state: Buffer.from(journal.currentState()).toString("base64") },
        (_key, value) => value instanceof Uint8Array ? Array.from(value) : value));
    `],
    cwd: backend, stdin: Buffer.from(JSON.stringify(input)), stdout: output, stderr: "pipe", timeout: 30_000,
  }) } finally { closeSync(output) }
  assert(result.stderr, "Continuity subprocess stderr capture is missing")
  assert.equal(result.exitCode, 0, `Continuity ${input.action} failed:\n${result.stderr.toString()}`)
  assert.equal(result.stderr.toString(), "", `Continuity ${input.action} diagnostics`)
  return JSON.parse(readFileSync(outputPath, "utf8")) as { checkpoint: ContinuityCheckpoint; heads: string[]; state: string; result: any }
}

const headless = BlockNoteEditor.create({ schema: blockNoteSchema })
const fixture: PartialBlock[] = continuityMode ? [
  { id: "phrase", type: "paragraph", content: "before TARGET after" },
  { id: "split", type: "paragraph", content: "before TARGET after" },
  { id: "merge", type: "paragraph", content: "first" },
  { id: "neighbour", type: "paragraph", content: "second" },
  { id: "new", type: "paragraph", content: "first" },
  { id: "hard", type: "paragraph", content: "left\nright" },
  { id: "concurrent", type: "paragraph", content: "before TARGET after" },
  { id: "netzero", type: "paragraph", content: "before TARGET after" },
  { id: "outside-a", type: "paragraph", content: "Writer A:" },
  { id: "outside-b", type: "paragraph", content: "Writer B:" },
  ...Array.from({ length: 16 }, (_, i) => ({ id: `filler-${i}`, type: "paragraph" as const, content: `Unchanged ${i}.` })),
  { id: "tail", type: "paragraph", content: "" },
] : captureMode ? [
  { id: "phrase", type: "paragraph", content: "before TARGET after" },
  { id: "neighbour", type: "paragraph", content: "second" },
  { id: "hard", type: "paragraph", content: "left\nright" },
  { id: "outside-a", type: "paragraph", content: "Writer A:" },
  { id: "outside-b", type: "paragraph", content: "Writer B:" },
  { id: "tail", type: "paragraph", content: "" },
] : [
  { id: "outside-a", type: "paragraph", content: "Writer A:" },
  { id: "outside-b", type: "paragraph", content: "Writer B:" },
  { id: "phrase", type: "paragraph", content: "target phrase" },
  { id: "body", type: "paragraph", props: { backgroundColor: "yellow" }, content: "original body", children: [
    { id: "body-child", type: "paragraph", content: "Nested child must survive." },
  ] },
  { id: "rich", type: "paragraph", content: [
    { type: "text", text: "Bold survivor ", styles: { bold: true } },
    { type: "link", href: "https://example.com/", content: [{ type: "text", text: "linked survivor", styles: {} }] },
    { type: "text", text: " Unicode: \ud83d\ude00 e\u0301\nnext line", styles: { italic: true } },
  ] },
  { id: "code", type: "codeBlock", content: "const untouched = true;" },
  { id: "table", type: "table", content: { type: "tableContent", rows: [{ cells: ["left cell", "right cell"] }] } },
  ...Array.from({ length: 24 }, (_, index) => ({ id: `filler-${index}`, type: "paragraph" as const, content: `Unchanged scroll fixture ${index}.` })),
  { id: "tail", type: "paragraph", content: "" },
]
// Import JSON once only. Every client and scenario receives these same bytes.
const seeded = blocksToYDoc(headless, fixture, "prosemirror")
const baseline = Y.encodeStateAsUpdate(seeded)
const baselineBlocks = yDocToBlocks(headless, seeded, "prosemirror")
seeded.destroy()

const temp = await mkdtemp(join(tmpdir(), "tuesday-live-edit-"))
let vite: Awaited<ReturnType<typeof createServer>> | undefined
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
try {
  vite = await createServer({
    configFile: false,
    root: frontend,
    cacheDir: join(temp, "vite"),
    plugins: [react()],
    logLevel: "error",
    optimizeDeps: {
      entries: ["e2e/live-agent-doc-editing.html"],
      noDiscovery: true,
      include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "@blocknote/core", "@blocknote/code-block", "@blocknote/react", "@blocknote/shadcn", "yjs", "y-prosemirror", "y-protocols/awareness", "prosemirror-state", "prosemirror-transform"],
    },
    server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false },
  })
  await vite.listen()
  const address = vite.httpServer!.address()
  assert(address && typeof address !== "string")
  browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--enable-precise-memory-info"],
    userDataDir: join(temp, "chromium"),
  })
  console.log(`Browser: ${await browser.version()}`)

  const viewports = [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 390, height: 844 }]
  for (const viewport of viewports.flatMap(viewport => (evidenceSyncMode ? ["two-undos"] : capacityArg ? ["sustained"] : continuityMode ? ["main", "two-undos", "outside-ab", "outside-ba", "outside-keys-ab", "outside-keys-ba", "sustained", "step-overflow", "enclosing", "concurrent-cap", "byte-cap"] : ["main"]).map(scenario => ({ ...viewport, scenario })))) {
    const state = new Y.Doc()
    let scenarioBaseline = baseline
    let scenarioBlocks = baselineBlocks
    if (viewport.scenario.startsWith("outside-")) {
      const outside = blocksToYDoc(headless, fixture.map(block => block.id === "phrase" && block.type === "paragraph" ? { ...block, content: [
        { type: "text" as const, text: "abc", styles: {} },
        { type: "text" as const, text: "def", styles: { bold: true } },
      ] } : block), "prosemirror")
      try {
        scenarioBaseline = Y.encodeStateAsUpdate(outside)
        scenarioBlocks = yDocToBlocks(headless, outside, "prosemirror")
      } finally { outside.destroy() }
    }
    if (viewport.scenario === "byte-cap") {
      const large = blocksToYDoc(headless, fixture.map(block => block.id === "outside-a" && block.type === "paragraph" ? { ...block, content: "s".repeat(100_000) } : block), "prosemirror")
      try {
        scenarioBaseline = Y.encodeStateAsUpdate(large)
        scenarioBlocks = yDocToBlocks(headless, large, "prosemirror")
      } finally { large.destroy() }
    }
    Y.applyUpdate(state, scenarioBaseline)
    const clients = new Set<ServerWebSocket<{ client: string }>>()
    const errors: string[] = []
    let connections = 0
    let closes = 0
    let humanUpdates = 0
    let phase: CapturePhase = "ordinary"
    let paused = false
    const queued: { peer: ServerWebSocket<{ client: string }>; payload: string }[] = []
    const branches = new Map<string, Y.Doc>()
    const received = new Set<string>()
    const receipts: { phase: CapturePhase; sender: string; recordsAdded: number; snapshotChecked: boolean }[] = []
    const evidenceIdentity = { docId: crypto.randomUUID(), generation: crypto.randomUUID() }
    let journal = continuityMode && !evidenceSyncMode ? continuityAdapter({ action: "init", baseline: Buffer.from(scenarioBaseline).toString("base64") }) : undefined
    const heldPackets: { sender: string; packet: ContinuityPacket; id: number }[] = []
    let packetReceipts = 0
    let duplicatePackets = 0
    let missingReceipts = 0
    let limitRejections = 0
    let holdForwarding = false
    let byteCandidate: ContinuityPacket | undefined
    const forwardContinuity = (payload: string, sender?: string) => {
      for (const peer of clients) if (peer.data.client !== sender) {
        if (holdForwarding) queued.push({ peer, payload })
        else peer.send(payload)
      }
    }
    const markIncomplete = (reason: string) => {
      assert(journal)
      journal = continuityAdapter({ action: "markIncomplete", checkpoint: journal.checkpoint, reason })
      assert.equal(journal.checkpoint.coverage.status, "incomplete")
    }
    const acceptPacket = (packet: ContinuityPacket, sender?: string, agent = false) => {
      assert(journal)
      if (viewport.scenario === "byte-cap") byteCandidate = packet
      journal = continuityAdapter({ action: "accept", checkpoint: journal.checkpoint, packet })
      if (journal.result.status === "limit-exceeded") {
        const reason = `Relay admission: ${journal.result.reason}`
        limitRejections++
        missingReceipts++
        markIncomplete(reason)
        const update = Array.from(Buffer.from(packet.update, "base64"))
        Y.applyUpdate(state, new Uint8Array(update))
        // Include the sender: its local admission succeeded, but global coverage did not.
        forwardContinuity(JSON.stringify({ type: "update", update, missing: true, reason }))
        return { status: "missing", accepted: [] }
      }
      if (journal.result.status === "duplicate") duplicatePackets++
      else packetReceipts++
      Y.applyUpdate(state, Buffer.from(packet.update, "base64"))
      forwardContinuity(JSON.stringify({ type: "continuity", packet, agent }), sender)
      return journal.result as { status: string; accepted: string[] }
    }
    const relay = Bun.serve<{ client: string }>({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request, server) {
        const url = new URL(request.url)
        const client = url.searchParams.get("client")
        if (url.pathname === "/relay" && (client === "a" || client === "b") && server.upgrade(request, { data: { client } })) return
        return new Response("Local experiment only", { status: 404 })
      },
      websocket: {
        open(socket) {
          connections++
          clients.add(socket)
          socket.send(JSON.stringify({ type: "sync", update: Array.from(Y.encodeStateAsUpdate(state)), ...(journal ? { heads: journal.heads, incomplete: journal.checkpoint.coverage.status === "incomplete" } : {}) }))
        },
        message(socket, raw) {
          try {
            const message = JSON.parse(String(raw))
            if (message.type === "continuity") {
              assert(continuityMode, "Packet outside continuity mode")
              assert(!JSON.stringify(message.packet).includes("targetRef"), "No target registration in packets")
              humanUpdates++
              if (paused) heldPackets.push({ sender: socket.data.client, packet: message.packet, id: message.id })
              else acceptPacket(message.packet, socket.data.client)
              if (!paused || !evidenceSyncMode) socket.send(JSON.stringify({ type: "ack", id: message.id }))
            } else if (message.type === "update") {
              if (continuityMode) {
                assert.equal(message.missing, true, "Continuity mode never emits an unlabelled naked update")
                missingReceipts++
                markIncomplete(typeof message.reason === "string" ? message.reason : "Missing client provenance")
              }
              const records = captureMode ? state.getArray<CaptureRecord>(captureKey) : undefined
              const priorIds = new Set(records?.toArray().map(record => record.id))
              const preSnapshot = captureMode ? Y.snapshot(branches.get(socket.data.client) ?? state) : undefined
              const beforeXML = captureMode ? state.getXmlFragment("prosemirror").toJSON() : undefined
              if (captureMode) {
                const key = `${socket.data.client}:${message.id}`
                assert(!received.has(key), "Each client update is applied exactly once at the relay")
                received.add(key)
              }
              Y.applyUpdate(state, new Uint8Array(message.update))
              if (records) {
                const added = records.toArray().filter(record => !priorIds.has(record.id))
                assert.notEqual(state.getXmlFragment("prosemirror").toJSON(), beforeXML, "No metadata-only/fabricated relay update")
                assert.equal(added.length, phase === "undo" || phase === "cap" ? 0 : 1, `${phase}: content and capture in the same received update`)
                for (const record of added) {
                  assert(Y.equalSnapshots(Y.decodeSnapshot(new Uint8Array(record.preSnapshot)), preSnapshot!), "Snapshot is exactly prechange, including deletes")
                  assert.equal(record.snapshotMatchesTransactionBeforeState, true)
                }
                const branch = branches.get(socket.data.client)
                if (branch) Y.applyUpdate(branch, new Uint8Array(message.update))
                receipts.push({ phase, sender: socket.data.client, recordsAdded: added.length, snapshotChecked: added.length > 0 })
              }
              humanUpdates++
              for (const peer of clients) if (peer !== socket) {
                const payload = JSON.stringify({ type: "update", update: message.update, ...(message.missing ? { missing: true } : {}) })
                if (paused) queued.push({ peer, payload })
                else peer.send(payload)
              }
              socket.send(JSON.stringify({ type: "ack", id: message.id }))
            } else if (message.type === "awareness") {
              for (const peer of clients) if (peer !== socket) peer.send(String(raw))
            } else throw new Error(`Unexpected relay message ${message.type}`)
          } catch (error) {
            errors.push(String(error))
            socket.close(1011, "Relay failure")
          }
        },
        close(socket) {
          closes++
          clients.delete(socket)
        },
      },
    })
    const contexts = []
    const pages: Page[] = []
    try {
      for (const client of ["a", "b"]) {
        const context = await browser.createBrowserContext()
        contexts.push(context)
        const page = await context.newPage()
        pages.push(page)
        await page.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.name === "mobile", hasTouch: viewport.name === "mobile" })
        page.on("pageerror", (error) => errors.push(`${client}: ${String(error)}`))
        page.on("console", (message) => { if (message.type() === "error") errors.push(`${client}: ${message.text()}`) })
        let navigations = 0
        page.on("framenavigated", (frame) => {
          if (frame === page.mainFrame() && ++navigations > 1) errors.push(`${client}: unexpected navigation/remount`)
        })
        const relayURL = `ws://127.0.0.1:${relay.port}/relay?client=${client}`
        await page.goto(`http://127.0.0.1:${address.port}/e2e/live-agent-doc-editing.html?client=${client}${captureMode ? "&capture=1" : continuityMode ? `&continuity=1&capacity=${capacity}` : ""}${evidenceSyncMode ? `&evidenceDoc=${evidenceIdentity.docId}&evidenceGeneration=${evidenceIdentity.generation}` : ""}&relay=${encodeURIComponent(relayURL)}`, { waitUntil: "networkidle0", timeout: 60_000 })
        await page.waitForFunction(() => Boolean(window.harness), { timeout: 30_000 })
      }

      async function converged() {
        const expected = JSON.stringify(yDocToBlocks(headless, state, "prosemirror"))
        for (const page of pages) {
          await page.waitForFunction((blocks) => {
            const probe = window.harness.probe()
            return probe.pending === 0 && JSON.stringify(probe.blocks) === blocks
          }, { timeout: 15_000 }, expected)
          const probe = await page.evaluate(() => window.harness.probe())
          assert.equal(probe.xml, state.getXmlFragment("prosemirror").toJSON(), "XML state convergence")
          assert.deepEqual(probe.vector, Array.from(Y.encodeStateVector(state)), "Yjs state-vector convergence")
        }
      }

      async function synchronizeEvidence(page: Page) {
        assert(journal)
        const requestId = crypto.randomUUID()
        const envelope = { type: "doc.evidence.sync", version: 1, requestId, ...evidenceIdentity,
          collabSeq: journal.checkpoint.packets.length, snapshot: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64"),
          journal: { checkpoint: journal.checkpoint, frontier: journal.heads } }
        assert.deepEqual(await page.evaluate(({ envelope, requestId }) => window.harness.synchronizeEvidence(envelope, requestId),
          { envelope, requestId }), { status: "ready" })
      }
      if (evidenceSyncMode) {
        // First journal issuance happens only after both real editors are mounted.
        journal = continuityAdapter({ action: "init", baseline: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") })
        for (const page of pages) await synchronizeEvidence(page)
      }
      await converged()
      const before = yDocToBlocks(headless, state, "prosemirror")
      assert.deepEqual(before, scenarioBlocks, "Mount must not normalize/reseed the baseline")
      if (continuityMode) {
        const [a, b] = pages as [Page, Page]
        assert(journal)
        let decisions = 0
        const failuresBefore = continuityFailures.length
        const issue = (block: string, from: number, to: number, inlineIndex = 0): ContinuityReference => {
          assert(journal)
          return continuityAdapter({ action: "issue", checkpoint: journal.checkpoint, block, from, to, inlineIndex }).result
        }
        const decision = (ref: ContinuityReference, expected: ExpectedDecision, exercisePatch = false) => {
          assert(journal)
          const interval = typeof expected === "string" ? undefined : expected
          const status = typeof expected === "string" ? expected : "safe"
          const result = continuityAdapter({ action: exercisePatch || !interval ? "verifyPatch" : "evaluate", interval,
            checkpoint: journal.checkpoint, ref, currentState: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") }).result as ContinuityDecision
          decisions++
          if (result.status !== status || (interval && (result.status !== "safe" || result.start !== interval[0] || result.end !== interval[1]))) {
            continuityFailures.push(`${viewport.name}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(result)}; last evidence: ${JSON.stringify(journal.checkpoint.packets.at(-1)?.evidence)}`)
          }
          return result
        }
        const text = (id: string) => {
          const block = yDocToBlocks(headless, state, "prosemirror").find(block => block.id === id)
          assert(block && Array.isArray(block.content), `Missing block ${id}`)
          return block.content.map(item => "text" in item ? item.text : "").join("")
        }
        const probe = async (page: Page) => {
          const value = await page.evaluate(() => window.harness.probeContinuity())
          assert(value.enabled)
          assert.equal(value.atomicScope, "transport-packet-not-y-transaction")
          return value
        }
        const settled = async (allowMissing = false) => {
          for (const page of pages) await page.waitForFunction(() => window.harness.probe().pending === 0)
          await converged()
          assert(journal)
          const probes = await Promise.all(pages.map(probe))
          for (const value of probes) {
            assert.equal(value.buffered, 0)
            assert(value.packetCount <= capacity && value.bytes <= 8 * 1024 * 1024)
            if (!allowMissing) { assert.equal(value.incomplete, false, JSON.stringify(value)); assert.deepEqual(value.errors, []); assert.deepEqual(value.heads, journal.heads) }
          }
          assert.deepEqual(errors, [])
          if (!allowMissing) assert.deepEqual(Buffer.from(journal.state, "base64"), Buffer.from(Y.encodeStateAsUpdate(state)), "Journal and relay binary content converge")
          return probes
        }
        const key = async (page: Page, block: string, offset: number, keyName: KeyInput) => {
          await page.evaluate((id, at) => { window.harness.separateHistory(); window.harness.placeCursorAt(id, at) }, block, offset)
          await page.keyboard.press(keyName)
          await settled()
          await page.evaluate(() => window.harness.separateHistory())
        }
        const replace = async (page: Page, block: string, from: number, to: number, value: string) => {
          await page.evaluate((id, start, end) => { window.harness.separateHistory(); window.harness.setSelection(id, start, end) }, block, from, to)
          if (value) await page.keyboard.sendCharacter(value)
          else await page.keyboard.press("Backspace")
          await settled()
          await page.evaluate(() => window.harness.separateHistory())
        }
        const checkpoint = (ref: ContinuityReference, expected: ExpectedDecision) => {
          assert(journal)
          const restored = continuityAdapter({ action: "roundtrip", checkpoint: journal.checkpoint, ref })
          assert.equal(restored.result.gc, true)
          if (typeof expected === "string") assert.equal(restored.result.decision.status, expected)
          else assert.deepEqual(restored.result.decision, { status: "safe", start: expected[0], end: expected[1] })
          assert.deepEqual(restored.checkpoint, journal.checkpoint)
          assert.equal(restored.state, journal.state)
        }
        const live = async () => {
          for (const page of pages) {
            const value = await page.evaluate(() => window.harness.probe())
            for (const name of ["sameView", "sameDOM", "sameDoc", "sameAwareness", "socketOpen"]) assert.equal(value[name], true)
            assert.equal(value.mounts, 1); assert.equal(value.unmounts, 0); assert.equal(value.detachments, 0); assert.equal(value.syncs, 1)
            assert.equal(value.pending, 0, "Every receipt/control message is acknowledged")
          }
          assert.equal(connections, 2); assert.equal(closes, 0); assert.deepEqual(errors, [])
        }
        const lostCoverage = async (ref: ContinuityReference) => {
          assert(journal)
          for (const page of pages) await page.waitForFunction(() => {
            const value = window.harness.probeContinuity()
            return value.enabled && value.incomplete
          })
          assert.equal(journal.checkpoint.coverage.status, "incomplete")
          decision(ref, "unknown")
          checkpoint(ref, "unknown")
          const refused = continuityAdapter({ action: "refusals", checkpoint: journal.checkpoint, ref,
            currentState: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") })
          assert.deepEqual(refused.result, { issue: true, apply: true }, "Coverage loss prevents fresh issuance and patching")
          assert.deepEqual(refused.checkpoint, journal.checkpoint)
        }
        await settled()
        if (viewport.scenario.startsWith("outside-")) {
          const multipleKeys = viewport.scenario.includes("keys")
          const prefix = multipleKeys ? "XY" : "X"
          const interval = [prefix.length, prefix.length + 2] as const
          const ref = issue("phrase", 1, 3)
          const outside = yDocToBlocks(headless, state, "prosemirror").filter(block => block.id !== "phrase")
          paused = true
          await a.evaluate(() => { window.harness.separateHistory(); window.harness.setSelection("phrase", 0, 1) })
          await a.keyboard.press("Backspace")
          await a.waitForFunction(() => window.harness.probe().pending === 0)
          await b.evaluate(() => { window.harness.separateHistory(); window.harness.placeCursorAt("phrase", 0) })
          await b.keyboard.sendCharacter("X")
          await b.waitForFunction(() => window.harness.probe().pending === 0)
          if (multipleKeys) {
            await b.keyboard.sendCharacter("Y")
            await b.waitForFunction(() => window.harness.probe().pending === 0)
          }
          assert.equal(heldPackets.length, multipleKeys ? 3 : 2)
          assert.equal(heldPackets[0]!.packet.before, heldPackets[1]!.packet.before, "Both humans edited the same pre-change state")
          if (multipleKeys) assert.deepEqual(heldPackets[2]!.packet.parents, [heldPackets[1]!.packet.id], "Second key has its own causal packet")
          let deliveries = heldPackets.splice(0)
          if (viewport.scenario.endsWith("ba")) deliveries = [...deliveries.slice(1), deliveries[0]!]
          paused = false
          for (const item of deliveries) {
            assert.equal(acceptPacket(item.packet, item.sender).status, "accepted")
            assert.equal(acceptPacket(item.packet, item.sender).status, "duplicate")
          }
          await settled()
          assert.equal(text("phrase"), `${prefix}bcdef`)
          decision(ref, interval, true)
          checkpoint(ref, interval)
          const block = [...state.getXmlFragment("prosemirror").createTreeWalker(() => true)]
            .find(node => node instanceof Y.XmlElement && node.getAttribute("id") === "phrase") as Y.XmlElement
          const xml = [...block.createTreeWalker(node => node instanceof Y.XmlText)][0] as Y.XmlText
          const indices = [...Array.from({ length: prefix.length }, (_, index) => index), interval[1], interval[1] + 1, interval[1] + 2]
          const anchors = indices.map(index => Y.createRelativePositionFromTypeIndex(xml, index, 0))
          const applied = continuityAdapter({ action: "apply", checkpoint: journal.checkpoint, ref, text: "agent",
            currentState: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") })
          acceptPacket(applied.result.packet, undefined, true)
          await settled()
          assert.equal(text("phrase"), `${prefix}agentdef`)
          assert.deepEqual(anchors.map(position => Y.createAbsolutePositionFromRelativePosition(position, state, false)?.index), indices.map(index => index < interval[0] ? index : index + 3))
          assert.deepEqual(yDocToBlocks(headless, state, "prosemirror").filter(item => item.id !== "phrase"), outside)
          const content = yDocToBlocks(headless, state, "prosemirror").find(item => item.id === "phrase")!.content
          assert(Array.isArray(content))
          assert.deepEqual(content.find(item => "text" in item && item.text === "def"), { type: "text", text: "def", styles: { bold: true } })
          for (const [page, id] of [[a, "outside-a"], [b, "outside-b"]] as const) {
            await page.evaluate(blockId => window.harness.placeCursor(blockId), id)
            await page.keyboard.sendCharacter("!")
            await settled()
          }
          assert.equal(text("outside-a"), "Writer A:!")
          assert.equal(text("outside-b"), "Writer B:!")
          await live()
          assert.equal(continuityFailures.length, failuresBefore)
          console.log(`PASS continuity ${viewport.name} ${viewport.scenario}: concurrent prefix deletion/${multipleKeys ? "two separate keys" : "insertion"}, duplicate delivery, original interval ${JSON.stringify(interval)}, GC reload, exact ${prefix}agentdef patch, outside identities/formatting and continued typing in both editors.`)
          continue
        }
        if (viewport.scenario === "sustained") {
          const cycles = Math.floor((capacity - 2) / 3)
          const memoryBaseline = await Promise.all(pages.map(page => page.metrics()))
          const heapPeak = memoryBaseline.map(value => value.JSHeapUsedSize ?? 0)
          const system = await browser.target().createCDPSession()
          const rendererRss = async () => {
            const { processInfo } = await system.send("SystemInfo.getProcessInfo")
            return processInfo.filter(info => info.type === "renderer").reduce((sum, info) => {
              const status = readFileSync(`/proc/${info.id}/status`, "utf8")
              return sum + Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1]) * 1024
            }, 0)
          }
          const rssBaseline = await rendererRss()
          let rssPeak = rssBaseline
          const sampleMemory = async () => {
            for (const [i, page] of pages.entries()) heapPeak[i] = Math.max(heapPeak[i]!, (await page.metrics()).JSHeapUsedSize ?? 0)
            rssPeak = Math.max(rssPeak, await rendererRss())
          }
          const original = issue("phrase", 7, 13)
          const outside = () => yDocToBlocks(headless, state, "prosemirror").filter(block => block.id !== "phrase")
          const outsideBefore = outside()
          for (let cycle = 0; cycle < cycles; cycle++) {
            const page = cycle % 2 === 0 ? a : b
            const block = cycle % 2 === 0 ? "outside-a" : "outside-b"
            const ref = issue("phrase", 7, 13)
            await replace(page, block, 0, 0, "X")
            assert.equal(await page.evaluate(() => window.harness.performUndo()), true)
            await settled()
            decision(ref, [7, 13], true)
            const applied = continuityAdapter({ action: "apply", checkpoint: journal.checkpoint, ref, text: "AGENT!",
              currentState: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") })
            acceptPacket(applied.result.packet, undefined, true)
            await settled()
            assert.equal(text("phrase"), "before AGENT! after")
            assert.deepEqual(outside(), outsideBefore)
            decision(original, [7, 13])
            await sampleMemory()
          }
          assert.equal(journal.checkpoint.packets.length, cycles * 3)
          // 64 is not 3n+2. Fill the remainder with explicit content-neutral
          // evidence, keeping the final native undo and atomic patch refusal.
          while (journal.checkpoint.packets.length < capacity - 2) {
            acceptPacket({ id: `capacity-neutral-${journal.checkpoint.packets.length}`, parents: journal.heads,
              before: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64"), update: "AAA=",
              evidence: { kind: "pm", steps: [] } })
            await settled()
          }
          await replace(a, "outside-a", 0, 0, "X")
          const sourceId = journal.checkpoint.packets.at(-1)!.id
          // A fresh reference can still need a source from before its issuance.
          const fresh = issue("phrase", 7, 13)
          assert(fresh.issuedCut.includes(sourceId))
          assert.equal(await a.evaluate(() => window.harness.performUndo()), true)
          await settled()
          assert.equal(journal.checkpoint.packets.length, capacity)
          const undo = journal.checkpoint.packets.at(-1)!.evidence
          assert(undo.kind === "undo")
          assert.equal(undo.sourceId, sourceId)
          decision(fresh, [7, 13]); decision(original, [7, 13])
          checkpoint(fresh, [7, 13])
          const refused = continuityAdapter({ action: "capacityRefusal", checkpoint: journal.checkpoint, ref: fresh,
            currentState: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") })
          assert.deepEqual(refused.result, { refused: true })
          assert.deepEqual(refused.checkpoint, journal.checkpoint)
          assert.deepEqual(outside(), outsideBefore)
          const retainedBytes = Buffer.byteLength(JSON.stringify(journal.checkpoint))
          const probes = await Promise.all(pages.map(probe))
          assert(probes.every(value => value.uncertifiedUndo === 0))
          await sampleMemory()
          const capture = probes.map(value => {
            const sorted = [...value.captureMs].sort((a, b) => a - b)
            return { count: sorted.length, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1),
              retainedBytes: value.bytes, peakInFlightBytes: value.peakInFlightBytes }
          })
          console.log(`CAPACITY ${JSON.stringify({ viewport: viewport.name, capacity, cycles, retainedBytes, capture,
            sampledHeapDeltaBytes: heapPeak.map((value, i) => value - (memoryBaseline[i]!.JSHeapUsedSize ?? 0)),
            sampledAggregateRendererRssDeltaBytes: rssPeak - rssBaseline })}`)
          await system.detach()
          for (const [page, block] of [[a, "outside-a"], [b, "outside-b"]] as const) {
            await page.evaluate(id => window.harness.placeCursor(id), block)
            await page.keyboard.sendCharacter("!")
            await settled(true)
          }
          await lostCoverage(fresh)
          decision(original, "unknown")
          assert.equal(journal.checkpoint.packets.length, capacity)
          assert.equal(text("phrase"), "before AGENT! after")
          assert.equal(text("outside-a"), "Writer A:!")
          assert.equal(text("outside-b"), "Writer B:!")
          await live()
          assert.equal(continuityFailures.length, failuresBefore)
          console.log(`PASS continuity ${viewport.name} sustained: ${cycles} inspect/edit/native-undo/agent-patch cycles; ${cycles + 1} certified undos; original and post-source fresh references survive to ${capacity} packets (${retainedBytes} checkpoint bytes); next human edits converge, coverage becomes incomplete and patches/fresh issuance refuse without mutation.`)
          continue
        }
        if (viewport.scenario === "two-undos") {
          const ref = issue("phrase", 7, 13)
          const outside = () => yDocToBlocks(headless, state, "prosemirror").filter(block => block.id !== "phrase")
          const outsideBefore = outside()
          const identities = () => [...state.getXmlFragment("prosemirror").createTreeWalker(() => true)].map(node => ({
            container: Buffer.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(node, 0, -1))).toString("base64"),
            chars: node instanceof Y.XmlText ? Array.from({ length: node.length }, (_, index) =>
              Buffer.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(node, index, 0))).toString("base64")) : [],
          }))
          const initialIdentities = identities()
          await replace(a, "outside-a", 0, 0, "A")
          if (evidenceSyncMode) {
            paused = true
            await a.evaluate(() => { window.harness.separateHistory(); window.harness.setSelection("outside-a", 1) })
            await a.keyboard.sendCharacter("B")
            const deadline = Date.now() + 10_000
            while (heldPackets.length === 0 && Date.now() < deadline) await Bun.sleep(10)
            assert.equal(heldPackets.length, 1)
            assert.equal((await a.evaluate(() => window.harness.probe())).pending, 1)
            // Reconcile the older durable frontier without rebasing pending B or
            // replacing the native undo source objects for A and B.
            await synchronizeEvidence(a)
            paused = false
            for (const held of heldPackets.splice(0)) {
              acceptPacket(held.packet, held.sender)
              for (const socket of clients) if (socket.data.client === held.sender) socket.send(JSON.stringify({ type: "ack", id: held.id }))
            }
            await settled()
            checkpoint(ref, [7, 13])
            for (const page of pages) await synchronizeEvidence(page)
          } else await replace(a, "outside-a", 1, 1, "B")
          assert.equal(text("outside-a"), "ABWriter A:")
          for (const expected of ["AWriter A:", "Writer A:"]) {
            assert.equal(await a.evaluate(() => window.harness.performUndo()), true)
            await settled()
            assert.equal(text("outside-a"), expected)
            decision(ref, [7, 13], true)
          }
          assert.deepEqual(outside(), outsideBefore)
          assert.deepEqual(identities(), initialIdentities, "Native insertion undos preserve every original character/container")
          const probes = await Promise.all(pages.map(probe))
          assert(probes.every(value => value.uncertifiedUndo === 0))
          assert.equal(journal.checkpoint.packets.length, 4)
          const secondUndo = journal.checkpoint.packets[3]!.evidence
          assert(secondUndo.kind === "undo")
          assert.equal(secondUndo.sourceId, journal.checkpoint.packets[0]!.id)
          checkpoint(ref, [7, 13])
          const applied = continuityAdapter({ action: "apply", checkpoint: journal.checkpoint, ref, text: "agent",
            currentState: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") })
          acceptPacket(applied.result.packet, undefined, true)
          await settled()
          assert.equal(text("phrase"), "before agent after")
          assert.deepEqual(outside(), outsideBefore)
          // The fork check above covers all outside identities and marks for this
          // exact reference; this live delivery additionally exercises both editors.
          for (const [page, block] of [[a, "outside-a"], [b, "outside-b"]] as const) {
            await page.evaluate(id => window.harness.placeCursor(id), block)
            await page.keyboard.sendCharacter("!")
            await settled()
          }
          assert.equal(text("outside-a"), "Writer A:!")
          assert.equal(text("outside-b"), "Writer B:!")
          await live()
          assert.equal(continuityFailures.length, failuresBefore)
          console.log(`PASS continuity ${viewport.name} two-undos${evidenceSyncMode ? " evidence-sync: mounted bootstrap, pending-packet reconciliation and retained undo sources;" : ":"} original reference safe after both native undos and GC reload; exact fork patch/identity/formatting checks; live agent patch; both editors converge and keep typing; no uncertified undo.`)
          continue
        }
        if (viewport.scenario === "byte-cap") {
          const ref = issue("phrase", 7, 13)
          decision(ref, [7, 13])
          const outside = yDocToBlocks(headless, state, "prosemirror").filter(block => block.id !== "phrase")
          await a.evaluate(() => { window.harness.placeCursorAt("phrase", 0); window.harness.transientTextEdit(8_240_000) })
          await settled(true)
          assert(byteCandidate && byteCandidate.evidence.kind === "pm")
          const packetBytes = Buffer.byteLength(JSON.stringify(byteCandidate))
          const baselineBytes = Buffer.byteLength(journal.checkpoint.baseline)
          assert(packetBytes <= 8 * 1024 * 1024, "Candidate fits the unchanged bridge admission bound")
          assert(packetBytes + baselineBytes > journal.checkpoint.limits.maxBytes, "This is byte overflow, not packet-count overflow")
          assert.equal(byteCandidate.evidence.steps.length, 3)
          assert(Buffer.from(byteCandidate.update, "base64").byteLength < 1024 * 1024)
          const sender = await probe(a)
          assert.equal(sender.localPackets, 1, "Actual EditorView batch was admitted locally")
          assert.equal(packetReceipts, 0)
          assert.equal(limitRejections, 1)
          assert.equal(missingReceipts, 1 + sender.missingUpdates, "One relay byte rejection plus any subsequent local preimage-loss controls")
          assert.equal(humanUpdates, 1 + sender.missingUpdates)
          assert.equal(journal.checkpoint.packets.length, 0)
          assert.equal(journal.checkpoint.limits.maxBytes, 8 * 1024 * 1024)
          assert(journal.checkpoint.coverage.status === "incomplete" && journal.checkpoint.coverage.reason.startsWith("Relay admission:"),
            "Relay admission itself records the first loss, independently of later client controls")
          assert.equal(text("phrase"), "!before TARGET after")
          assert.deepEqual(yDocToBlocks(headless, state, "prosemirror").filter(block => block.id !== "phrase"), outside)
          await lostCoverage(ref)
          const saved = JSON.stringify(journal.checkpoint)
          assert.throws(() => continuityAdapter({ action: "accept", checkpoint: journal!.checkpoint,
            packet: { ...byteCandidate!, id: "invalid-byte-overflow", update: "!!!!" } }), /Continuity accept failed/,
          "Larger scratch budget must still reject malformed updates")
          assert.throws(() => continuityAdapter({ action: "accept", checkpoint: journal!.checkpoint,
            packet: { ...byteCandidate!, id: "mismatched-byte-overflow", evidence: { kind: "pm", steps: byteCandidate!.evidence.kind === "pm" ? byteCandidate!.evidence.steps.slice(0, 2) : [] } } }), /Continuity accept failed/,
          "Valid bytes with evidence that omits the final edit must still fail")
          assert.throws(() => continuityAdapter({ action: "accept", checkpoint: journal!.checkpoint,
            packet: { ...byteCandidate!, id: "over-validation-input-cap", before: byteCandidate!.before + "A".repeat(100_000) } }), /Candidate exceeds the bridge's 8 MiB bound/,
          "Scratch validation has a bounded candidate input, not unlimited retention")
          assert.equal(JSON.stringify(journal.checkpoint), saved)
          await live()
          console.log(`PASS continuity ${viewport.name} byte-cap: ${packetBytes}-byte packet + ${baselineBytes}-byte baseline exceeds real 8 MiB admission; bounded 12 MiB scratch validation; 1 edit + ${sender.missingUpdates} local loss controls acknowledged; edit preserved; sticky loss/refusal; malformed/mismatched/over-bound candidates rejected.`)
          continue
        }
        if (viewport.scenario === "step-overflow" || viewport.scenario === "enclosing") {
          const ref = issue("phrase", 7, 13)
          decision(ref, [7, 13])
          const initial = Y.encodeStateAsUpdate(state)
          await a.evaluate((pairs, enclosing) => window.harness.splitRejoin("phrase", 10, pairs, enclosing),
            viewport.scenario === "step-overflow" ? 257 : 1, viewport.scenario === "enclosing")
          await settled(true)
          assert.deepEqual(Y.encodeStateAsUpdate(state), initial, "Loss-only control need not alter a single Yjs byte")
          assert.equal(packetReceipts, 0)
          assert.equal(missingReceipts, 1)
          assert.equal(humanUpdates, 1)
          await lostCoverage(ref)
          await live()
          console.log(`PASS continuity ${viewport.name} ${viewport.scenario}: unchanged binary; 1 acknowledged loss control; old safe reference unknown; issuance/apply refused; sticky GC checkpoint coverage; both peers incomplete.`)
          continue
        }
        if (viewport.scenario === "concurrent-cap") {
          await a.evaluate(() => {
            window.harness.placeCursorAt("outside-a", 0)
            for (let i = 0; i < 31; i++) window.harness.replaceSelection("x")
          })
          await settled()
          assert.equal(journal.checkpoint.packets.length, 31)
          const ref = issue("phrase", 7, 13)
          decision(ref, [7, 13])
          // Withhold only forwarding: both real socket acknowledgements occur
          // after relay admission/preservation, not on an offline queue receipt.
          holdForwarding = true
          await a.evaluate(() => { window.harness.placeCursorAt("outside-a", 0); window.harness.replaceSelection("A") })
          await a.waitForFunction(() => window.harness.probe().pending === 0)
          await b.evaluate(() => { window.harness.placeCursorAt("outside-b", 0); window.harness.replaceSelection("B") })
          await b.waitForFunction(() => window.harness.probe().pending === 0)
          assert.equal((await probe(a)).packetCount, 32)
          assert.equal((await probe(b)).packetCount, 32)
          assert.equal(limitRejections, 1)
          assert.equal(missingReceipts, 1)
          assert.equal(queued.length, 3, "Accepted packet to B plus explicit loss to both senders")
          holdForwarding = false
          for (const { peer, payload } of queued.splice(0)) peer.send(payload)
          await settled(true)
          assert.equal(text("outside-a"), `A${"x".repeat(31)}Writer A:`)
          assert.equal(text("outside-b"), "BWriter B:")
          assert.equal(packetReceipts, 32)
          assert.equal(humanUpdates, 33, "All 33 human edits are received, including the over-quota edit")
          await lostCoverage(ref)
          const stickyCoverage = structuredClone(journal.checkpoint.coverage)
          assert.equal(stickyCoverage.status, "incomplete")
          assert(stickyCoverage.status === "incomplete" && stickyCoverage.knownCut.includes(journal.checkpoint.packets.at(-1)!.id),
            "The loss frontier includes admitted sibling A, outside B's ancestor cut")
          const beforeRetry = Y.encodeStateAsUpdate(state)
          await b.evaluate(() => window.harness.retryLastContinuityPacket())
          await settled(true)
          assert.equal(limitRejections, 2, "Retrying overflow sibling B remains recoverable admission loss")
          assert.equal(missingReceipts, 2)
          assert.equal(humanUpdates, 34, "33 human edits plus one acknowledged retry")
          assert.deepEqual(Y.encodeStateAsUpdate(state), beforeRetry, "Retry does not duplicate content")
          assert.deepEqual(journal.checkpoint.coverage, stickyCoverage, "Temporary validation must not change the real sticky frontier")
          await lostCoverage(ref)
          const snapshot = new Y.Doc()
          try {
            Y.applyUpdate(snapshot, Y.encodeStateAsUpdate(state))
            assert.equal(snapshot.gc, true)
            assert.deepEqual(yDocToBlocks(headless, snapshot, "prosemirror"), yDocToBlocks(headless, state, "prosemirror"))
          } finally { snapshot.destroy() }
          const saved = JSON.stringify(journal.checkpoint)
          assert.throws(() => continuityAdapter({ action: "accept", checkpoint: journal!.checkpoint,
            packet: { ...journal!.checkpoint.packets.at(-1)!, id: "invalid-over-cap", update: "!!!!" } }), /Continuity accept failed/,
          "Malformed evidence is not downgraded to recoverable admission loss")
          assert.throws(() => continuityAdapter({ action: "accept", checkpoint: journal!.checkpoint,
            packet: { ...journal!.checkpoint.packets.at(-1)!, id: "wrong-causal-over-cap", parents: journal!.heads } }), /Continuity accept failed/,
          "A valid payload with the wrong declared causal preimage is still malformed")
          assert.equal(JSON.stringify(journal.checkpoint), saved)
          await live()
          console.log(`PASS continuity ${viewport.name} concurrent-cap: 33 human edits + 1 retry acknowledged; 32 admitted packets; 2 admission rejections converted to sticky loss; content and real coverage frontier survive retry; both peers converge/incomplete; checkpoint/refusal and malformed-packet checks pass.`)
          continue
        }
        assert.equal(await a.evaluate(() => window.harness.performUndo()), false)
        assert.equal((await probe(a)).localPackets, 0, "No-op undo sends no packet")
        const phrase = issue("phrase", 7, 13)
        const oldSplit = issue("split", 7, 13)
        const existingWhole = issue("merge", 0, 5), existingInner = issue("merge", 1, 4)
        const newWhole = issue("new", 0, 5), newInner = issue("new", 1, 4)
        const hardWhole = issue("hard", 0, 4), hardInner = issue("hard", 1, 3)
        const offlineRef = issue("concurrent", 7, 13)
        await replace(a, "phrase", 6, 7, "")
        await replace(a, "phrase", 12, 13, "")
        decision(phrase, [6, 12])
        await replace(a, "phrase", 6, 12, "HUMAN")
        assert.equal(text("phrase"), "beforeHUMANafter")
        decision(phrase, [6, 11])
        assert.equal(await a.evaluate(() => window.harness.performUndo()), true)
        await settled()
        assert.equal(text("phrase"), "beforeTARGETafter")
        decision(phrase, [6, 12])
        assert.equal(await a.evaluate(() => window.harness.performRedo()), true)
        await settled()
        decision(phrase, [6, 11])

        for (const [page, id] of [[a, "outside-a"], [b, "outside-b"]] as const) await page.evaluate(block => window.harness.placeCursor(block), id)
        const selectionBefore = await Promise.all(pages.map(page => page.evaluate(() => window.harness.probe())))
        const outsideBefore = yDocToBlocks(headless, state, "prosemirror").filter(block => block.id !== "phrase")
        const originalPatchSafe = decision(phrase, [6, 11]).status === "safe"
        // Continue the independent transport/selection exercise if the required
        // old-reference gate fails, but retain a failing final assertion for it.
        if (!originalPatchSafe) continuityFailures.push(`${viewport.name}: original-reference agent patch blocked; only the separate fresh-reference transport exercise ran`)
        const applied = continuityAdapter({ action: "apply", checkpoint: journal.checkpoint, ref: originalPatchSafe ? phrase : issue("phrase", 6, 11), text: "agent", currentState: Buffer.from(Y.encodeStateAsUpdate(state)).toString("base64") })
        // apply() already accepts its packet in the subprocess; deliver it once to the relay journal.
        acceptPacket(applied.result.packet, undefined, true)
        await settled()
        assert.equal(text("phrase"), "beforeagentafter")
        assert.deepEqual(yDocToBlocks(headless, state, "prosemirror").filter(block => block.id !== "phrase"), outsideBefore)
        for (let i = 0; i < pages.length; i++) {
          const current = await pages[i]!.evaluate(() => window.harness.probe())
          assert.equal(current.agentUpdates, 1)
          assert.equal(current.focused, true)
          assert.deepEqual(current.selection, selectionBefore[i].selection)
          assert.deepEqual(current.scroll, selectionBefore[i].scroll)
        }
        for (const page of pages) await page.keyboard.sendCharacter("!")
        await settled()
        assert.equal(text("outside-a"), "Writer A:!")
        assert.equal(text("outside-b"), "Writer B:!")
        const unaffected = issue("phrase", 6, 11)

        await key(a, "split", 10, "Enter")
        decision(oldSplit, "broken")
        assert.equal(text("split"), "before TAR")
        const prefix = issue("split", 0, 10), prefixInner = issue("split", 1, 6)
        assert.equal(await a.evaluate(() => window.harness.performUndo()), true)
        await settled()
        assert.equal(text("split"), "before TARGET after")
        decision(oldSplit, "broken")
        decision(prefix, "broken")
        decision(prefixInner, [1, 6], true)
        checkpoint(oldSplit, "broken")
        assert.equal(await a.evaluate(() => window.harness.performRedo()), true)
        await settled()
        assert.equal(text("split"), "before TAR")
        decision(oldSplit, "broken")
        decision(issue("split", 1, 6), [1, 6], true)

        await key(a, "hard", 5, "Backspace")
        assert.equal(text("hard"), "leftright")
        decision(hardWhole, "broken")
        decision(hardInner, [1, 3], true)
        await key(a, "merge", 5, "Delete")
        assert.equal(text("merge"), "firstsecond")
        decision(existingWhole, "broken")
        decision(existingInner, [1, 4], true)
        await key(a, "new", 5, "Enter")
        decision(newWhole, [0, 5], true)
        const blocks = yDocToBlocks(headless, state, "prosemirror")
        const neighbour = blocks[blocks.findIndex(block => block.id === "new") + 1]!.id
        await replace(a, neighbour, 0, 0, "typed")
        await key(a, neighbour, 0, "Backspace")
        assert.equal(text("new"), "firsttyped")
        decision(newWhole, "broken")
        decision(newInner, [1, 4], true)

        // Neither browser is given the references. Two packets per isolated writer;
        // the relay and browsers receive children before parents, twice.
        paused = true
        await a.evaluate(() => { window.harness.separateHistory(); window.harness.placeCursorAt("concurrent", 10) })
        await a.keyboard.press("Enter")
        await a.keyboard.sendCharacter("!")
        await b.evaluate(() => { window.harness.separateHistory(); window.harness.placeCursorAt("outside-b", 0) })
        await b.keyboard.sendCharacter("x")
        await b.keyboard.sendCharacter("y")
        for (const page of pages) await page.waitForFunction(() => window.harness.probe().pending === 0)
        assert.equal(heldPackets.length, 4)
        const beforeReplay = humanUpdates
        const reversed = heldPackets.splice(0).reverse()
        assert.equal(acceptPacket(reversed[0]!.packet, reversed[0]!.sender).status, "pending")
        decision(unaffected, "unknown")
        acceptPacket(reversed[0]!.packet, reversed[0]!.sender)
        for (const item of reversed.slice(1)) { acceptPacket(item.packet, item.sender); acceptPacket(item.packet, item.sender) }
        paused = false
        const concurrentProbes = await settled()
        assert.equal(humanUpdates, beforeReplay, "Remote replay never recaptures")
        assert(concurrentProbes.every(value => value.duplicates >= 2))
        assert.equal(text("outside-b"), "xyWriter B:!")
        decision(offlineRef, "broken")
        decision(unaffected, [6, 11], true)
        checkpoint(offlineRef, "broken")
        checkpoint(unaffected, [6, 11])

        // A later remote edit makes otherwise ordinary native undo selective.
        await replace(a, "outside-a", 0, 0, "z")
        await replace(b, "outside-b", 0, 0, "w")
        const selective = issue("phrase", 6, 11)
        assert.equal(await a.evaluate(() => window.harness.performUndo()), true)
        const selectiveProbes = await settled()
        assert.equal(text("outside-a"), "Writer A:!")
        assert.equal(text("outside-b"), "wxyWriter B:!")
        assert.equal(selectiveProbes[0]!.uncertifiedUndo, 1)
        assert.equal(journal.checkpoint.packets.at(-1)!.evidence.kind, "undo")
        assert(!("sourceId" in journal.checkpoint.packets.at(-1)!.evidence))
        decision(selective, "unknown")
        decision(oldSplit, "broken")
        decision(issue("phrase", 6, 11), [6, 11])
        checkpoint(selective, "unknown")

        const netzero = issue("netzero", 7, 13)
        const priorPackets = journal.checkpoint.packets.length
        await a.evaluate(() => {
          window.harness.separateHistory()
          window.harness.splitRejoin("netzero", 10)
          window.harness.placeCursorAt("outside-a", 0)
          window.harness.replaceSelection("n")
        })
        await settled()
        assert.equal(journal.checkpoint.packets.length, priorPackets + 2)
        const neutral = journal.checkpoint.packets[priorPackets]!, following = journal.checkpoint.packets[priorPackets + 1]!
        assert(following.parents.includes(neutral.id), "Synchronous following edit includes the content-neutral causal head")
        assert.equal(text("netzero"), "before TARGET after")
        decision(netzero, "broken")

        // Two synchronous accepted text transactions deliberately share one native
        // history item. A matching final string is not a source certificate.
        await a.evaluate(() => {
          window.harness.separateHistory()
          window.harness.placeCursorAt("outside-a", 0)
          window.harness.replaceSelection("g")
          window.harness.replaceSelection("h")
        })
        await settled()
        assert.equal(text("outside-a"), "ghnWriter A:!")
        const grouped = issue("phrase", 6, 11)
        assert.equal(await a.evaluate(() => window.harness.performUndo()), true)
        await settled()
        assert.equal(text("outside-a"), "nWriter A:!")
        decision(grouped, "unknown")
        assert.equal(await a.evaluate(() => window.harness.performRedo()), true)
        const groupedProbes = await settled()
        assert.equal(text("outside-a"), "ghnWriter A:!")
        assert.equal(groupedProbes[0]!.uncertifiedUndo, 3)
        decision(grouped, "unknown")
        decision(issue("phrase", 6, 11), [6, 11])

        const fill = 32 - journal.checkpoint.packets.length
        assert(fill >= 0, "Continuity scenarios fit the 32-packet admission budget")
        await a.evaluate(() => window.harness.placeCursorAt("outside-a", 0))
        for (let i = 0; i < fill; i++) { await a.keyboard.sendCharacter("x"); await settled() }
        assert.equal(journal.checkpoint.packets.length, 32)
        const capRef = issue("phrase", 6, 11)
        decision(capRef, [6, 11])
        const atCap = Y.encodeStateAsUpdate(state)
        await a.evaluate(() => window.harness.splitRejoin("netzero", 10))
        await settled(true)
        assert.deepEqual(Y.encodeStateAsUpdate(state), atCap, "Packet-cap loss is reported even with unchanged Yjs bytes")
        assert.equal(missingReceipts, 1)
        await lostCoverage(capRef)
        await a.evaluate(() => window.harness.splitRejoin("netzero", 10))
        await settled(true)
        assert.equal(missingReceipts, 2, "An already incomplete bridge still reports later net-zero loss")
        await a.evaluate(() => window.harness.placeCursorAt("outside-a", 0))
        await a.keyboard.sendCharacter("!")
        const capped = await settled(true)
        assert.equal(text("outside-a"), `!${"x".repeat(fill)}ghnWriter A:!`)
        assert.equal(missingReceipts, 4, "Two net-zero losses plus installed-batch control and the preserved content update")
        assert.equal(journal.checkpoint.packets.length, 32)
        assert(capped.every(value => value.incomplete))
        decision(capRef, "unknown")
        assert.equal(packetReceipts, 32)
        assert.equal(duplicatePackets, 4)
        assert.equal(humanUpdates, 35, "31 human packets plus four acknowledged missing-coverage messages; agent packet is separate")
        await live()
        console.log(`${continuityFailures.length === failuresBefore ? "PASS" : "FAIL"} continuity ${viewport.name}: ${decisions} decision checks, ${continuityFailures.length - failuresBefore} required failures; 32 transport-atomic packets (31 human, 1 agent); 4 duplicate packets/8 reversed replay frames; native undo/redo and selective unknown; GC checkpoint decisions; 4 acknowledged cap-loss messages including unchanged-binary loss and preserved typing. Not same-Y-transaction or production coverage.`)
        continue
      }
      if (captureMode) {
        const [a, b] = pages as [Page, Page]
        const log = state.getArray<CaptureRecord>(captureKey)
        const capture = async (page: Page) => {
          const probe = await page.evaluate(() => window.harness.probeCapture())
          assert(probe.enabled)
          assert.equal(probe.safeSpanSupport, false, "Evidence is never span acceptance")
          assert.equal(probe.undo.status, "unresolved")
          return probe
        }
        const settled = async () => {
          for (const page of pages) await page.waitForFunction(() => window.harness.probe().pending === 0)
          await converged()
          const probes = await Promise.all(pages.map(capture))
          for (const probe of probes) assert.deepEqual(probe.records, log.toArray(), "Capture log converges without local replay capture")
          assert.deepEqual(errors, [], "No browser/relay errors")
          return probes as [CaptureProbe, CaptureProbe]
        }
        const text = (id: string) => {
          const block = yDocToBlocks(headless, state, "prosemirror").find(block => block.id === id)
          assert(block && Array.isArray(block.content))
          return block.content.map(item => "text" in item ? item.text : "").join("")
        }
        const initial = await settled()
        assert(initial.every(probe => probe.recordCount === 0 && probe.localUpdateCount === 0))
        assert.equal(await a.evaluate(() => window.harness.performUndo()), false, "Empty undo is a no-op")
        const noop = (await capture(a)).undo.observations
        assert.equal(noop.length, 1)
        assert.equal(noop[0]!.fragmentChanged, false)
        assert.equal(log.length, 0)

        await a.evaluate(() => window.harness.placeCursorAt("phrase", 10))
        await a.keyboard.press("Enter")
        await settled()
        const split = yDocToBlocks(headless, state, "prosemirror")[1]!
        assert.notEqual(split.id, "neighbour")
        assert.equal(text("phrase"), "before TAR")
        assert.equal(text(split.id), "GET after", "Keyboard Enter split through TARGET")
        assert.equal(log.length, 1)
        const first = log.get(0)
        assert.equal(first.transactions[0]!.appended, false)
        assert(first.transactions[0]!.steps.length > 0)
        assert(first.transactions.some(tr => tr.appended && tr.steps.length > 0 && JSON.stringify(tr.steps).includes(split.id)), "UniqueID appended steps share the root capture/update")
        assert.equal(first.after.blocks, first.before.blocks + 1)

        await a.evaluate(id => window.harness.placeCursorAt(id, 0), split.id)
        await a.keyboard.press("Backspace")
        await settled()
        assert.equal(text("phrase"), "before TARGET after")
        assert(!yDocToBlocks(headless, state, "prosemirror").some(block => block.id === split.id))
        await a.evaluate(() => window.harness.placeCursorAt("phrase", 19))
        await a.keyboard.press("Delete")
        await settled()
        assert.equal(text("phrase"), "before TARGET aftersecond", "Delete merged the existing neighbour")
        assert(!yDocToBlocks(headless, state, "prosemirror").some(block => block.id === "neighbour"))
        assert.equal(log.length, 3)
        assert.equal(log.get(1).after.blocks, log.get(1).before.blocks - 1)
        assert.equal(log.get(2).after.blocks, log.get(2).before.blocks - 1)

        assert.equal(text("hard"), "left\nright")
        await a.evaluate(() => window.harness.placeCursorAt("hard", 5))
        await a.keyboard.press("Backspace")
        await settled()
        assert.equal(text("hard"), "leftright", "Hardbreak removal is accepted without merging blocks")
        assert.equal(log.length, 4)
        assert.equal(log.get(3).after.blocks, log.get(3).before.blocks)
        await Bun.sleep(600) // Separate the replacement from earlier edits in Y.UndoManager's capture interval.
        await a.evaluate(() => window.harness.setSelection("phrase", 7, 13))
        await a.keyboard.sendCharacter("HUMAN")
        await settled()
        assert.equal(text("phrase"), "before HUMAN aftersecond", "Browser input replaces the entire target")
        assert.equal(log.length, 5)
        const beforeUndo = log.toArray()
        phase = "undo"
        assert.equal(await a.evaluate(() => window.harness.performUndo()), true)
        await settled()
        assert.equal(text("phrase"), "before TARGET aftersecond")
        assert.deepEqual(log.toArray(), beforeUndo, "Undo does not fabricate or remove capture records")
        assert.equal(await a.evaluate(() => window.harness.performRedo()), true)
        let probes = await settled()
        assert.equal(text("phrase"), "before HUMAN aftersecond")
        assert.deepEqual(log.toArray(), beforeUndo)
        assert.equal(probes[0].undo.changedWithoutCapture, 2, "Diagnostic gate failure: accepted undo/redo has no atomic capture")
        assert(probes[0].undo.observations.slice(1).every(item => item.contentChangedWithoutCapture && !item.pmDocEqual && item.recordsAdded === 0))
        assert.equal(probes[1].localRecordsWritten, 0)

        phase = "concurrent"
        paused = true
        // The reference stays in this process. B receives only normal Y updates,
        // never the inspect result, and edits while forwarding is paused.
        const heldReference = adapter("inspect", Y.encodeStateAsUpdate(state)).find((target: any) => target.blockId === "phrase")?.spans[0]?.targetRef
        assert(heldReference, "A relay-only reference exists before B's uninformed edit")
        for (const client of ["a", "b"]) {
          const branch = new Y.Doc()
          Y.applyUpdate(branch, Y.encodeStateAsUpdate(state))
          branches.set(client, branch)
        }
        const beforeConcurrent = probes.map(probe => probe.localRecordsWritten)
        await Promise.all([
          (async () => {
            await a.evaluate(() => window.harness.placeCursorAt("phrase", 10))
            await a.keyboard.press("Enter")
            await a.keyboard.sendCharacter("!")
          })(),
          (async () => {
            await b.evaluate(() => window.harness.setSelection("phrase", 7, 12))
            await b.keyboard.sendCharacter("WORLD")
            await b.keyboard.sendCharacter("?")
          })(),
        ])
        for (const page of pages) await page.waitForFunction(() => window.harness.probe().pending === 0)
        const isolated = await Promise.all(pages.map(capture))
        assert.equal(isolated[0]!.recordCount, beforeUndo.length + 2)
        assert.equal(isolated[1]!.recordCount, beforeUndo.length + 2, "B has not received A's split or any reference")
        assert.equal(queued.length, 4, "Two causally ordered updates per isolated sender")
        const beforeReplayUpdates = humanUpdates
        const replayFrames = queued.length * 2
        for (const { peer, payload } of queued.reverse()) { peer.send(payload); peer.send(payload) }
        queued.length = 0
        paused = false
        probes = await settled()
        assert.equal(humanUpdates, beforeReplayUpdates, "Reversed duplicate remote delivery emits no new local updates")
        for (let index = 0; index < probes.length; index++) {
          assert.equal(probes[index]!.localRecordsWritten, beforeConcurrent[index]! + 2)
          assert(probes[index]!.updates.filter(update => !update.local).every(update => update.captureId === null && !update.captureObserved))
        }
        assert.equal(log.length, 9)
        assert.equal(new Set(log.toArray().map(record => record.id)).size, log.length)
        assert(!JSON.stringify(log.toArray()).includes("targetRef"), "Capture schema is independent of target references")
        assert(!JSON.stringify(log.toArray()).includes(JSON.stringify(heldReference)))
        for (const branch of branches.values()) branch.destroy()
        branches.clear()
        phase = "ordinary"

        // Reload a default-GC Y.Doc, not a browser/editor remount. Snapshot bytes
        // persist; the reconstruction API rejects gc:true regardless of which
        // historical content remains. This does not measure collected content.
        const reloaded = new Y.Doc()
        try {
          assert.equal(reloaded.gc, true)
          Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(state))
          assert.deepEqual(reloaded.getArray(captureKey).toArray(), log.toArray())
          assert.deepEqual(yDocToBlocks(headless, reloaded, "prosemirror"), yDocToBlocks(headless, state, "prosemirror"))
          for (const record of log.toArray()) assert.deepEqual(Array.from(Y.encodeSnapshot(Y.decodeSnapshot(new Uint8Array(record.preSnapshot)))), record.preSnapshot)
          assert.throws(() => Y.createDocFromSnapshot(reloaded, Y.decodeSnapshot(new Uint8Array(first.preSnapshot))), /Garbage-collection must be disabled/)
        } finally { reloaded.destroy() }

        const fill = 32 - log.length
        await a.evaluate(() => window.harness.placeCursorAt("outside-a", 0))
        await a.keyboard.type("x".repeat(fill))
        probes = await settled()
        assert.equal(log.length, 32)
        for (const probe of probes) {
          assert.deepEqual(probe.errors, [])
          assert.equal(probe.ordinaryMissingCaptureUpdates, 0)
          assert.equal(probe.captureWithoutContentUpdates, 0)
          assert.equal(probe.ordinaryAtomicUpdates, probe.localRecordsWritten)
        }
        phase = "cap"
        await a.keyboard.type("!")
        probes = await settled()
        assert.equal(text("outside-a"), `${"x".repeat(fill)}!Writer A:`, "Editing succeeds after local admission stops")
        assert.equal(text("outside-b"), "Writer B:")
        assert.equal(log.length, 32, "Sequential local admission cap, not a distributed quota")
        assert.equal(probes[0].stopped, true)
        assert.equal(probes[0].limitsExceeded, true)
        assert.equal(probes[0].coverage, "incomplete")
        assert.equal(probes[0].ordinaryMissingCaptureUpdates, 1)
        assert.deepEqual(probes[0].errors, ["Shared capture record budget exhausted", "Local ySync content update has no same-transaction capture"])
        assert.deepEqual(probes[1].errors, [])
        for (const probe of probes) assert(probe.recordBytes <= 65536 && probe.diagnosticBytes <= 65536)
        for (const page of pages) {
          const probe = await page.evaluate(() => window.harness.probe())
          for (const key of ["sameView", "sameDOM", "sameDoc", "sameAwareness", "socketOpen"]) assert.equal(probe[key], true)
          assert.equal(probe.mounts, 1)
          assert.equal(probe.unmounts, 0)
          assert.equal(probe.detachments, 0)
          assert.equal(probe.syncs, 1)
          assert.equal(probe.pending, 0)
        }
        assert.equal(connections, 2)
        assert.equal(closes, 0)
        assert.equal(received.size, humanUpdates)
        assert.equal(receipts.filter(receipt => receipt.phase === "undo").length, 2)
        assert.equal(receipts.filter(receipt => receipt.phase === "cap").length, 1)
        assert.equal(receipts.filter(receipt => receipt.snapshotChecked).length, 32)
        assert.deepEqual(errors, [])
        console.log(`PASS capture ${viewport.name}: ${humanUpdates} updates applied once; 32 atomic records/pre-snapshots (${receipts.filter(receipt => receipt.phase === "concurrent").length} fork-checked); ${replayFrames} reversed/duplicate frames; no-op undo + 2 undo/redo gaps; GC reload preserved log; cap edit succeeded; undo gap reproduced; NOT span acceptance. Untested: net-zero batches, enclosing Y transactions, distributed quota.`)
        continue
      }
      for (const page of pages) assert.deepEqual(await page.evaluate(() => window.harness.probeCapture()), { enabled: false })
      const targets = adapter("inspect", Y.encodeStateAsUpdate(state))
      const phrase = targets.find((target: any) => target.blockId === "phrase")
      const body = targets.find((target: any) => target.blockId === "body")
      const span = phrase?.spans.find((item: any) => item.text === "target phrase")
      assert(span?.targetRef && body?.blockRef, "Exact phrase and body references must be issued")

      for (let index = 0; index < pages.length; index++) {
        const page = pages[index]!
        await page.evaluate((id) => window.harness.placeCursor(id), index === 0 ? "outside-a" : "outside-b")
        await page.keyboard.type(` before-${index}`, { delay: 20 })
      }
      await converged()
      for (const page of pages) await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const selectionBefore = await Promise.all(pages.map((page) => page.evaluate(() => window.harness.probe())))
      for (const probe of selectionBefore) {
        assert.equal(probe.focused, true, "Editor focused before injection")
        assert(probe.scroll.y > 0, "Nonzero scroll required for meaningful preservation check")
      }
      const current = yDocToBlocks(headless, state, "prosemirror")
      const result = adapter("patch", Y.encodeStateAsUpdate(state), [
        { type: "replace_text", targetRef: span.targetRef, text: "agent phrase" },
        { type: "replace_body", targetRef: body.blockRef, content: [{ type: "text", text: "agent body", styles: { bold: true } }] },
      ])
      const update = new Uint8Array(result.update)
      assert(update.byteLength > 2, "Agent must emit an actual delta")
      Y.applyUpdate(state, update)
      // Compare at the subprocess JSON boundary: optional undefined table fields
      // are omitted (and undefined array entries become null) during transport.
      assert.deepEqual(JSON.parse(JSON.stringify(yDocToBlocks(headless, state, "prosemirror"))), result.blocks, "Adapter JSON receipt matches applied binary delta")
      for (const socket of clients) socket.send(JSON.stringify({ type: "update", agent: true, update: Array.from(update) }))
      await converged()

      for (let index = 0; index < pages.length; index++) {
        const probe = await pages[index]!.evaluate(() => window.harness.probe())
        assert.equal(probe.agentUpdates, 1, "Exactly one agent delta received")
        assert.equal(probe.focused, true, "Agent delta preserved editor focus")
        assert.deepEqual(probe.selection, selectionBefore[index].selection, "Agent delta preserved PM and DOM selection outside target")
        assert.deepEqual(probe.scroll, selectionBefore[index].scroll, "Agent delta preserved window/editor scroll")
      }
      const patched = yDocToBlocks(headless, state, "prosemirror")
      assert.deepEqual(patched.map((block) => block.id), current.map((block) => block.id), "Block IDs/order unchanged")
      for (const block of current) {
        const actual = patched.find((item) => item.id === block.id)!
        if (block.id !== "phrase" && block.id !== "body") assert.deepEqual(actual, block, `Outside block ${block.id} survives`)
        else assert.deepEqual({ ...actual, content: block.content }, block, `Target ${block.id} props/children/identity survive`)
      }
      assert.deepEqual(patched.find((block) => block.id === "phrase")!.content, [{ type: "text", text: "agent phrase", styles: {} }])
      assert.deepEqual(patched.find((block) => block.id === "body")!.content, [{ type: "text", text: "agent body", styles: { bold: true } }])

      // No click, focus(), or cursor reset after injection: typing must use the
      // preserved browser selection, not a selection repaired by the test.
      for (let index = 0; index < pages.length; index++) await pages[index]!.keyboard.type(` after-${index}`, { delay: 20 })
      await converged()
      const final = yDocToBlocks(headless, state, "prosemirror")
      for (const block of patched) {
        if (block.id !== "outside-a" && block.id !== "outside-b") assert.deepEqual(final.find((item) => item.id === block.id), block, "Continued typing preserves the patch and unrelated content")
      }
      for (let index = 0; index < pages.length; index++) {
        const id = index === 0 ? "outside-a" : "outside-b"
        const text = index === 0 ? "Writer A:" : "Writer B:"
        assert.deepEqual(final.find((block) => block.id === id)!.content, [{ type: "text", text: `${text} before-${index} after-${index}`, styles: {} }], "Typing before/after survives exactly once")
        const probe = await pages[index]!.evaluate(() => window.harness.probe())
        for (const key of ["sameView", "sameDOM", "sameDoc", "sameAwareness", "socketOpen", "focused"]) assert.equal(probe[key], true, `${key} must remain true`)
        assert.equal(probe.mounts, 1)
        assert.equal(probe.unmounts, 0)
        assert.equal(probe.detachments, 0)
        assert.equal(probe.syncs, 1)
        assert.equal(probe.pending, 0)
      }
      assert.equal(connections, 2, "No reconnects")
      assert.equal(closes, 0, "Both editors remained connected")
      assert(humanUpdates > 0, "Real keyboard input emitted Yjs updates")
      assert.deepEqual(errors, [], "No browser/relay errors")
      console.log(`PASS ${viewport.name} ${viewport.width}x${viewport.height}: two real editors; phrase/body delta; before/after keyboard input; focus/selection/scroll and mount identity; rich outside content; Yjs/BlockNote convergence (${humanUpdates} human updates, ${update.byteLength} agent bytes).`)
    } catch (error) {
      console.error(`${viewport.name} ${viewport.scenario} diagnostics:`, errors)
      if (continuityMode) console.error(JSON.stringify({ humanUpdates, packetReceipts, missingReceipts, limitRejections,
        clients: await Promise.all(pages.map(page => page.evaluate(() => ({ bridge: window.harness.probeContinuity(), pending: window.harness.probe().pending, blocks: window.harness.probe().blocks.filter((block: { id: string }) => block.id.startsWith("outside-")).map((block: { id: string; content: unknown }) => ({ id: block.id, content: JSON.stringify(block.content).slice(0, 160) })) })))) }))
      throw error
    } finally {
      try {
        await Promise.all(contexts.map((context) => context.close()))
      } finally {
        relay.stop(true)
        for (const branch of branches.values()) branch.destroy()
        state.destroy()
      }
    }
  }
  assert.deepEqual(continuityFailures, [], "Required continuity acceptance scenarios remain unresolved")
} finally {
  await Promise.allSettled([browser?.close(), vite?.close()])
  await rm(temp, { recursive: true, force: true })
}
