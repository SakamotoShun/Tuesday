import { afterEach, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

// The normal frontend suite mocks yjs globally. Run these real binding tests in
// their own Bun process, still using frontend/bunfig.toml's Happy DOM preload.
if (process.env.TUESDAY_CONTINUITY_BRIDGE_TEST_CHILD !== "1") {
  test("continuity bridge regressions with real Yjs (isolated)", () => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "test", fileURLToPath(import.meta.url)],
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...process.env, TUESDAY_CONTINUITY_BRIDGE_TEST_CHILD: "1" },
      stdout: "pipe", stderr: "pipe", timeout: 60_000,
    })
    expect(result.exitCode, result.stderr.toString()).toBe(0)
  }, 65_000)
} else {
  const { BlockNoteEditor } = await import("@blocknote/core")
  const { EditorState, Plugin } = await import("prosemirror-state")
  const { EditorView } = await import("prosemirror-view")
  const { initProseMirrorDoc, prosemirrorToYXmlFragment, ySyncPlugin, ySyncPluginKey, yUndoPlugin, yUndoPluginKey, undo } = await import("y-prosemirror")
  const Y = await import("yjs")
  const { createContinuityBridge, decodeContinuityBytes, encodeContinuityBytes } = await import("./doc-continuity-bridge")
  const { blockNoteSchema } = await import("../src/components/docs/block-note-schema")
  const identity = { docId: crypto.randomUUID(), generation: crypto.randomUUID() }
  const requestId = crypto.randomUUID()
  const epoch = crypto.randomUUID()
  type Output = Parameters<Parameters<typeof createContinuityBridge>[2]>[0]
  const cleanup: (() => void)[] = []
  afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose() })
  const schemaEditor = BlockNoteEditor.create({ schema: blockNoteSchema, initialContent: [
    { id: "phrase", type: "paragraph", content: "before TARGET after" },
    { id: "outside", type: "paragraph", content: "outside" },
  ] })
  const schema = schemaEditor.pmSchema

  function fixture(baseline?: Uint8Array, heads: string[] = [], managed = false) {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment("prosemirror")
    if (baseline) Y.applyUpdate(doc, baseline)
    else prosemirrorToYXmlFragment(schemaEditor.prosemirrorState.doc, fragment)
    const messages: Output[] = []
    const bridge = createContinuityBridge(doc, heads, message => messages.push(message), 32, managed ? identity : undefined)
    const extension = bridge.extension({ editor: schemaEditor })
    const initial = initProseMirrorDoc(fragment, schema)
    const view = new EditorView(document.body.appendChild(document.createElement("div")), {
      state: EditorState.create({ schema, doc: initial.doc, plugins: [
        new Plugin({ filterTransaction: tr => tr.getMeta("reject") !== true }),
        ...extension.prosemirrorPlugins,
        ySyncPlugin(fragment, { mapping: initial.mapping }), yUndoPlugin(),
      ] }),
    })
    cleanup.push(() => { view.destroy(); bridge.dispose(); doc.destroy() })
    const neutral = (pairs = 1) => {
      const tr = view.state.tr
      for (let i = 0; i < pairs; i++) tr.split(13, 2).join(15, 2)
      expect(tr.doc.eq(view.state.doc)).toBe(true)
      return tr
    }
    return { doc, view, bridge, messages, neutral }
  }

  function envelope(baseline: string, packets: import("./doc-continuity-bridge").ContinuityPacket[] = []) {
    const state = new Y.Doc()
    try {
      Y.applyUpdate(state, decodeContinuityBytes(baseline))
      const heads = new Set(packets.map(packet => packet.id))
      for (const packet of packets) {
        Y.applyUpdate(state, decodeContinuityBytes(packet.update))
        packet.parents.forEach(id => heads.delete(id))
      }
      return { type: "doc.evidence.sync" as const, version: 1 as const, ...identity, requestId, collabSeq: packets.length,
        snapshot: encodeContinuityBytes(Y.encodeStateAsUpdate(state)), journal: { frontier: [...heads].sort(), checkpoint: {
          version: 1 as const, epoch, baseline, packets, coverage: { status: "complete" as const },
          limits: { ttlMs: 900_000, maxPackets: 32, maxBytes: 8 * 1024 * 1024 },
        } } }
    } finally { state.destroy() }
  }

  test("two ordinary native undos preserve an original reference and its targeted patch", async () => {
    const f = fixture(undefined, [], true)
    const baseline = encodeContinuityBytes(Y.encodeStateAsUpdate(f.doc))
    expect(f.bridge.synchronize(envelope(baseline), requestId)).toEqual({ status: "ready" })
    const original = f.view.state.doc
    const um = yUndoPluginKey.getState(f.view.state)!.undoManager as InstanceType<typeof Y.UndoManager>
    let start = -1
    original.descendants((node, pos) => {
      if (node.type.name === "blockContainer" && node.attrs.id === "outside") start = pos + 2
    })
    expect(start).toBeGreaterThan(0)
    um.stopCapturing()
    f.view.dispatch(f.view.state.tr.insertText("A", start))
    um.stopCapturing()
    f.view.dispatch(f.view.state.tr.insertText("B", start + 1))
    um.stopCapturing()
    expect(um.undoStack).toHaveLength(2)
    const captured = f.messages.flatMap(message => message.type === "continuity" ? [message.packet] : [])
    // Reconnect after A committed and B remained pending. Restore A's retained
    // certificate without deleting B or replacing the native UndoManager/view.
    expect(f.bridge.synchronize(JSON.stringify(envelope(baseline, captured.slice(0, 1))), requestId)).toEqual({ status: "ready" })
    expect(yUndoPluginKey.getState(f.view.state)!.undoManager).toBe(um)
    expect(um.undoStack).toHaveLength(2)
    expect(undo(f.view.state)).toBe(true)
    expect(f.view.state.doc.textContent).toBe("before TARGET afterAoutside")
    expect(undo(f.view.state)).toBe(true)
    await Promise.resolve()
    expect(f.view.state.doc.eq(original)).toBe(true)
    expect(f.bridge.probe()).toMatchObject({ incomplete: false, uncertifiedUndo: 0, packetCount: 4 })
    const packets = f.messages.map(message => {
      if (message.type !== "continuity") throw new Error("Expected captured content and evidence")
      return message.packet
    })
    expect(packets).toHaveLength(4)
    expect(packets[2]!.evidence).toMatchObject({ kind: "undo", sourceId: packets[1]!.id })
    expect(packets[3]!.evidence.kind).toBe("undo")
    expect(packets[3]!.evidence).toMatchObject({ sourceId: packets[0]!.id })
    const journal = Bun.spawnSync({
      cmd: [process.execPath, "--eval", `
        import assert from "node:assert/strict";
        import * as Y from "yjs";
        import { ContinuityJournal, ContinuityError } from "./src/collab/docContinuityExperiment.ts";
        const input = JSON.parse(await Bun.stdin.text());
        const journal = new ContinuityJournal(input.baseline);
        const ref = journal.issueSpan("phrase", 7, 13);
        const decisions = input.packets.map(packet => { journal.accept(packet); return journal.evaluate(ref); });
        // Native undo retains deleted content locally; compare canonical GC state.
        const supplied = new Y.Doc();
        try {
          Y.applyUpdate(supplied, new Uint8Array(input.currentState));
          assert.deepEqual(journal.currentState(), Y.encodeStateAsUpdate(supplied));
        } finally { supplied.destroy(); }
        const checkpoint = journal.checkpoint();
        const restored = ContinuityJournal.fromCheckpoint(checkpoint);
        const reloaded = restored.evaluate(ref);
        const result = restored.apply(ref, "agent");
        assert.equal(result.blocks[0].content[0].text, "before agent after");
        assert.equal(result.blocks[1].content[0].text, "outside");
        // Losing or falsifying the source must not inherit the successful proof.
        for (const sourceId of [undefined, input.packets[1].id]) {
          const rejected = new ContinuityJournal(input.baseline);
          const old = rejected.issueSpan("phrase", 7, 13);
          input.packets.forEach((packet, index) => rejected.accept(index === 3
            ? { ...packet, evidence: { ...packet.evidence, sourceId } } : packet));
          const before = rejected.currentState(), saved = rejected.checkpoint();
          assert.equal(rejected.evaluate(old).status, "unknown");
          assert.throws(() => rejected.apply(old, "must not apply"),
            error => error instanceof ContinuityError && error.code === "UNKNOWN");
          assert.deepEqual(rejected.currentState(), before);
          assert.deepEqual(rejected.checkpoint(), saved);
        }
        console.log(JSON.stringify({ decisions, reloaded }));
      `],
      cwd: fileURLToPath(new URL("../../backend/", import.meta.url)),
      stdin: Buffer.from(JSON.stringify({ baseline, packets, currentState: Array.from(Y.encodeStateAsUpdate(f.doc)) })),
      stdout: "pipe", stderr: "pipe", timeout: 15_000,
    })
    expect(journal.exitCode, journal.stderr.toString()).toBe(0)
    const result = JSON.parse(journal.stdout.toString())
    expect(result.decisions).toEqual(Array.from({ length: 4 }, () => ({ status: "safe", start: 7, end: 13 })))
    expect(result.reloaded).toEqual({ status: "safe", start: 7, end: 13 })
  })

  test("first journal initialisation after mount preserves prior human edits and native undo", () => {
    const f = fixture(undefined, [], true)
    const first = envelope(encodeContinuityBytes(Y.encodeStateAsUpdate(f.doc)))
    expect(f.bridge.synchronize({ ...first, journal: null }, requestId)).toEqual({ status: "inactive" })
    f.view.dispatch(f.view.state.tr.insertText("before-init ", 3))
    const um = yUndoPluginKey.getState(f.view.state)!.undoManager as InstanceType<typeof Y.UndoManager>
    const stackItem = um.undoStack[0]
    const baseline = encodeContinuityBytes(Y.encodeStateAsUpdate(f.doc))
    expect(f.bridge.synchronize(envelope(baseline), requestId)).toEqual({ status: "ready" })
    expect(um.undoStack[0]).toBe(stackItem)
    expect(f.bridge.probe()).toMatchObject({ incomplete: false, mounted: true, awaitingEvidence: false })
    um.stopCapturing()
    // Pre-baseline undo is retained, but has no invented source certificate.
    expect(undo(f.view.state)).toBe(true)
    const last = f.messages.at(-1)!
    expect(last.type).toBe("continuity")
    if (last.type === "continuity") expect(last.packet.evidence).toMatchObject({ kind: "undo" })
    if (last.type === "continuity") expect("sourceId" in last.packet.evidence).toBe(false)
    expect(f.bridge.probe().uncertifiedUndo).toBe(1)
  })

  test("sync rejects wrong identity, epoch, frontier and missing sources without mutating content", () => {
    for (const defect of ["document", "generation", "request", "epoch", "sequence", "ancestry", "frontier", "source", "contradiction", "incomplete", "oversize"] as const) {
      const f = fixture(undefined, [], true)
      const baseline = encodeContinuityBytes(Y.encodeStateAsUpdate(f.doc))
      expect(f.bridge.synchronize(envelope(baseline), requestId).status).toBe("ready")
      f.view.dispatch(f.view.state.tr.insertText("x", 3))
      const packets = f.messages.flatMap(message => message.type === "continuity" ? [message.packet] : [])
      expect(f.bridge.synchronize(envelope(baseline, packets), requestId).status).toBe("ready")
      const next = envelope(baseline, packets)
      if (defect === "document") next.docId = crypto.randomUUID()
      if (defect === "generation") next.generation = crypto.randomUUID()
      if (defect === "request") next.requestId = crypto.randomUUID()
      if (defect === "epoch") next.journal.checkpoint.epoch = crypto.randomUUID()
      if (defect === "sequence") next.collabSeq = 0
      if (defect === "ancestry") next.journal.checkpoint.packets = packets.map(packet => ({ ...packet, parents: ["missing-parent"] }))
      if (defect === "frontier") next.journal.frontier = []
      if (defect === "source") { next.journal.checkpoint.packets = []; next.journal.frontier = [] }
      if (defect === "contradiction") next.journal.checkpoint.packets = packets.map(packet => ({ ...packet, evidence: { kind: "pm", steps: [] } }))
      if (defect === "incomplete") Object.assign(next.journal.checkpoint, { coverage: { status: "incomplete", reason: "exhausted", knownCut: next.journal.frontier } })
      if (defect === "oversize") next.journal.checkpoint.limits.maxBytes = 1
      const before = Y.encodeStateAsUpdate(f.doc)
      expect(f.bridge.synchronize(next, requestId).status).toBe("incomplete")
      expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before)
      expect(f.bridge.probe().packetCount).toBe(1)
      expect(f.bridge.synchronize(envelope(baseline, packets), requestId).status).toBe("incomplete")
    }
  })

  test("sync never evicts pending local packets to fit a smaller server journal budget", () => {
    const f = fixture(undefined, [], true)
    const baseline = encodeContinuityBytes(Y.encodeStateAsUpdate(f.doc))
    const initial = envelope(baseline)
    initial.journal.checkpoint.limits.maxPackets = 1
    expect(f.bridge.synchronize(initial, requestId).status).toBe("ready")
    f.view.dispatch(f.view.state.tr.insertText("x", 3))
    f.view.dispatch(f.view.state.tr.insertText("y", 4))
    const before = Y.encodeStateAsUpdate(f.doc)
    expect(f.bridge.synchronize(initial, requestId).status).toBe("incomplete")
    expect(f.bridge.probe().packetCount).toBe(2)
    expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before)
    expect(f.bridge.synchronize(envelope(baseline), requestId).status).toBe("incomplete")
  })

  test("pending local content absent from the checkpoint survives and remote-only deletions merge", () => {
    const f = fixture(undefined, [], true)
    const baseline = encodeContinuityBytes(Y.encodeStateAsUpdate(f.doc))
    expect(f.bridge.synchronize(envelope(baseline), requestId).status).toBe("ready")
    const remote = fixture(decodeContinuityBytes(baseline))
    remote.view.dispatch(remote.view.state.tr.delete(3, 4))
    const packets = remote.messages.flatMap(message => message.type === "continuity" ? [message.packet] : [])
    f.view.dispatch(f.view.state.tr.insertText("local", f.view.state.doc.content.size - 3))
    const before = f.view.state.doc.textContent
    expect(f.bridge.synchronize(envelope(baseline, packets), requestId).status).toBe("ready")
    expect(f.view.state.doc.textContent).toContain("local")
    expect(f.view.state.doc.textContent).not.toBe(before)
    expect(f.view.state.doc.textContent).toStartWith("efore TARGET")
    expect(f.bridge.probe()).toMatchObject({ incomplete: false, packetCount: 2 })
    expect(f.bridge.synchronize(envelope(baseline, packets), requestId).status).toBe("ready")
    expect(f.bridge.probe().packetCount).toBe(2)
  })

  test("514 installed structural steps emit loss without any Yjs content update", async () => {
    const f = fixture()
    const before = Y.encodeStateAsUpdate(f.doc)
    let updates = 0
    f.doc.on("update", () => updates++)
    f.view.dispatch(f.neutral(257))
    await Promise.resolve()
    expect(updates).toBe(0)
    expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before)
    expect(f.messages).toEqual([{ type: "update", update: [0, 0], missing: true, reason: "Accepted PM batch budget exhausted" }])
    expect(f.bridge.probe().incomplete).toBe(true)
  })

  test("enclosing Y transaction cannot silently consume a net-zero installed PM batch", async () => {
    const f = fixture()
    const before = Y.encodeStateAsUpdate(f.doc)
    f.doc.transact(() => f.view.dispatch(f.neutral()), ySyncPluginKey)
    await Promise.resolve()
    expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before)
    expect(f.messages).toEqual([{ type: "update", update: [0, 0], missing: true, reason: "Enclosing Y transaction is outside continuity coverage" }])
    expect(f.bridge.probe().incomplete).toBe(true)
  })

  test("speculative or rejected overflow does not emit loss or poison coverage", async () => {
    const f = fixture()
    const installed = f.view.state
    const speculative = installed.apply(f.neutral(257))
    expect(speculative).not.toBe(installed)
    f.view.dispatch(f.neutral(257).setMeta("reject", true))
    await Promise.resolve()
    expect(f.view.state).toBe(installed)
    expect(f.messages).toEqual([])
    expect(f.bridge.probe().incomplete).toBe(false)
    f.view.dispatch(f.view.state.tr.insertText("x", 3))
    expect(f.messages).toHaveLength(1)
    expect(f.messages[0]!.type).toBe("continuity")
    expect(f.bridge.probe().incomplete).toBe(false)
  })

  test("a supported net-zero batch and its synchronous successor retain causal order", async () => {
    const f = fixture()
    f.view.dispatch(f.neutral())
    f.view.dispatch(f.view.state.tr.insertText("x", 3))
    await Promise.resolve()
    expect(f.messages).toHaveLength(2)
    const [first, second] = f.messages
    if (first?.type !== "continuity" || second?.type !== "continuity") throw new Error("Expected two captured packets")
    expect(decodeContinuityBytes(first.packet.update)).toEqual(new Uint8Array([0, 0]))
    expect(second.packet.parents).toEqual([first.packet.id])
    expect(f.bridge.probe().incomplete).toBe(false)
  })

  test("known packet-cap net-zero loss is emitted again after coverage is already incomplete", async () => {
    const f = fixture()
    for (let i = 0; i < 32; i++) f.view.dispatch(f.view.state.tr.insertText("x", 3))
    expect(f.messages).toHaveLength(32)
    const before = Y.encodeStateAsUpdate(f.doc)
    f.view.dispatch(f.neutral())
    f.view.dispatch(f.neutral())
    await Promise.resolve()
    expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before)
    expect(f.messages).toHaveLength(34)
    for (const message of f.messages.slice(32)) expect(message).toMatchObject({ type: "update", missing: true, update: [0, 0] })
    expect(f.bridge.probe()).toMatchObject({ incomplete: true, packetCount: 32, missingUpdates: 2 })
  })

  test("preimage byte exhaustion emits loss for a net-zero batch before marking it consumed", async () => {
    const f = fixture()
    const baseline = encodeContinuityBytes(Y.encodeStateAsUpdate(f.doc))
    let start = -1
    f.view.state.doc.descendants((node, pos) => {
      if (node.type.name === "blockContainer" && node.attrs.id === "outside") start = pos + 2
    })
    expect(start).toBeGreaterThan(0)
    // Two real accepted edits leave less free space than the current preimage,
    // without exhausting the packet-count budget or fabricating retained data.
    // Large accepted insert/delete steps retain real evidence, but the actual
    // Yjs updates stay below the backend's 1 MiB update limit.
    const first = "x".repeat(4_000_000), second = "y".repeat(3_950_000)
    f.view.dispatch(f.view.state.tr.insertText("s".repeat(100_000), start, start + 7)
      .insertText(first, start).delete(start, start + first.length))
    f.view.dispatch(f.view.state.tr.insertText(second, start).delete(start, start + second.length))
    expect(f.messages).toHaveLength(2)
    expect(f.messages.every(message => message.type === "continuity")).toBe(true)
    const probe = f.bridge.probe()
    expect(probe).toMatchObject({ incomplete: false, packetCount: 2 })
    expect(probe.bytes + baseline.length).toBeLessThan(probe.limits.bytes)
    const packets = f.messages.map(message => {
      if (message.type !== "continuity") throw new Error("Expected captured packet")
      expect(decodeContinuityBytes(message.packet.update).byteLength).toBeLessThan(1024 * 1024)
      return message.packet
    })
    const canonical = new Y.Doc()
    let preimageBytes: number
    try {
      Y.applyUpdate(canonical, Y.encodeStateAsUpdate(f.doc))
      preimageBytes = encodeContinuityBytes(Y.encodeStateAsUpdate(canonical)).length
    } finally { canonical.destroy() }
    expect(probe.limits.bytes - probe.bytes).toBeGreaterThan(0)
    expect(probe.limits.bytes - probe.bytes).toBeLessThan(preimageBytes)
    const before = Y.encodeStateAsUpdate(f.doc)
    let updates = 0
    f.doc.on("update", () => updates++)
    f.view.dispatch(f.neutral())
    await Promise.resolve()
    expect(updates).toBe(0)
    expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before)
    expect(f.messages.slice(2)).toEqual([{ type: "update", update: [0, 0], missing: true, reason: "Error: Continuity preimage budget exhausted" }])
    expect(f.bridge.probe()).toMatchObject({ incomplete: true, missingUpdates: 1 })
    const journal = Bun.spawnSync({
      cmd: [process.execPath, "--eval", `
        import { ContinuityJournal, ContinuityError } from "./src/collab/docContinuityExperiment.ts";
        const input = JSON.parse(await Bun.stdin.text());
        const journal = new ContinuityJournal(input.baseline);
        const ref = journal.issueSpan("phrase", 7, 13);
        for (const packet of input.packets) journal.accept(packet);
        const before = journal.evaluate(ref).status;
        journal.markIncomplete(input.reason);
        let refused = false;
        try { journal.apply(ref, "must not apply"); }
        catch (error) { if (!(error instanceof ContinuityError) || error.code !== "UNKNOWN") throw error; refused = true; }
        const restored = ContinuityJournal.fromCheckpoint(journal.checkpoint());
        console.log(JSON.stringify({ before, after: journal.evaluate(ref).status, reloaded: restored.evaluate(ref).status, refused }));
      `],
      cwd: fileURLToPath(new URL("../../backend/", import.meta.url)),
      stdin: Buffer.from(JSON.stringify({ baseline, packets, reason: "Continuity preimage budget exhausted" })),
      stdout: "pipe", stderr: "pipe", timeout: 15_000,
    })
    expect(journal.exitCode, journal.stderr.toString()).toBe(0)
    expect(JSON.parse(journal.stdout.toString())).toEqual({ before: "safe", after: "unknown", reloaded: "unknown", refused: true })
  }, 15_000)

  test.each(["missing-parent", "overflow-parent"])("buffered child content survives %s without inventing ancestry", async mode => {
    const parent = fixture()
    const receiver = fixture(Y.encodeStateAsUpdate(parent.doc))
    for (let i = 0; i < 31; i++) {
      parent.view.dispatch(parent.neutral())
      const message = parent.messages.at(-1)!
      if (message.type !== "continuity") throw new Error("Expected captured history")
      receiver.bridge.receive(message.packet)
    }
    const trustedHeads = receiver.bridge.probe().heads
    parent.view.dispatch(parent.view.state.tr.insertText("A", 3))
    const a = parent.messages.at(-1)!
    if (a.type !== "continuity") throw new Error("Expected parent packet")
    // A newly synced writer knows A's head without retaining the earlier packets.
    const child = fixture(Y.encodeStateAsUpdate(parent.doc), [a.packet.id])
    child.view.dispatch(child.view.state.tr.insertText("B", 4))
    const b = child.messages.at(-1)!
    if (b.type !== "continuity") throw new Error("Expected child packet")
    receiver.bridge.receive(b.packet)
    expect(receiver.bridge.probe()).toMatchObject({ packetCount: 32, buffered: 1, incomplete: false })
    expect(receiver.view.state.doc.textContent).toBe("before TARGET afteroutside")
    if (mode === "missing-parent") receiver.bridge.missing(decodeContinuityBytes(a.packet.update))
    else receiver.bridge.receive(a.packet)
    await Promise.resolve()
    expect(receiver.view.state.doc.textContent).toBe("ABbefore TARGET afteroutside")
    expect(receiver.bridge.probe()).toMatchObject({ incomplete: true, buffered: 0, heads: trustedHeads })
    receiver.bridge.receive(b.packet)
    expect(receiver.view.state.doc.eq(child.view.state.doc)).toBe(true)
    expect(receiver.bridge.probe()).toMatchObject({ buffered: 0, heads: trustedHeads, duplicates: 1 })
    expect(receiver.messages).toEqual([])
  })

  test("two isolated senders each admit packet 32 and preserve both edits after explicit relay loss", async () => {
    const a = fixture()
    const b = fixture(Y.encodeStateAsUpdate(a.doc))
    for (let i = 0; i < 31; i++) {
      a.view.dispatch(a.view.state.tr.insertText("x", 3))
      const message = a.messages.at(-1)!
      if (message.type !== "continuity") throw new Error("Expected covered history")
      b.bridge.receive(message.packet)
    }
    a.view.dispatch(a.view.state.tr.insertText("A", 3))
    b.view.dispatch(b.view.state.tr.insertText("B", 3))
    const left = a.messages.at(-1)!, right = b.messages.at(-1)!
    if (left.type !== "continuity" || right.type !== "continuity") throw new Error("Both local admissions must succeed")
    expect(a.bridge.probe().packetCount).toBe(32)
    expect(b.bridge.probe().packetCount).toBe(32)
    expect(left.packet.parents).toEqual(right.packet.parents)
    // The maintained browser runner separately checks the actual relay's journal
    // LIMIT_EXCEEDED handler, acknowledgements, sticky checkpoint and patch refusal.
    b.bridge.receive(left.packet)
    a.bridge.missing(decodeContinuityBytes(right.packet.update))
    b.bridge.missing(decodeContinuityBytes(right.packet.update))
    await Promise.resolve()
    expect(a.view.state.doc.textContent).toContain("A")
    expect(a.view.state.doc.textContent).toContain("B")
    expect(a.view.state.doc.eq(b.view.state.doc)).toBe(true)
    expect(Y.encodeStateAsUpdate(a.doc)).toEqual(Y.encodeStateAsUpdate(b.doc))
    expect(a.bridge.probe().incomplete).toBe(true)
    expect(b.bridge.probe().incomplete).toBe(true)
  })
}
