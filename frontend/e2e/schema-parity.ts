import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"

// Each probe resolves libraries from its own package, never loading both copies
// of Yjs/ProseMirror into one process. No DOM preload or mocked editor is used.
const probe = `
  import { BlockNoteEditor } from "@blocknote/core";
  const { [process.env.SCHEMA_EXPORT]: schema } = await import(process.env.SCHEMA_MODULE);
  const editor = BlockNoteEditor.create({
    schema,
    initialContent: [{ id: "parity-code", type: "codeBlock", content: "const value = 1;" }],
  });
  const pm = editor.pmSchema;
  const describeTypes = (types) => Object.entries(types).map(([name, type]) => ({
    name,
    spec: type.spec,
    attrs: type.attrs,
    defaultAttrs: type.defaultAttrs,
    isInline: type.isInline,
    isBlock: type.isBlock,
    isText: type.isText,
    isLeaf: type.isLeaf,
    isAtom: type.isAtom,
    inlineContent: type.inlineContent,
    whitespace: type.whitespace,
  }));
  console.log(JSON.stringify({
    blockSchema: schema.blockSchema,
    inlineContentSchema: schema.inlineContentSchema,
    styleSchema: schema.styleSchema,
    prosemirror: {
      topNode: pm.topNodeType.name,
      nodes: describeTypes(pm.nodes),
      marks: describeTypes(pm.marks),
    },
    codeDefaults: {
      blockNote: schema.blockSchema.codeBlock.propSchema.language.default,
      prosemirror: pm.nodes.codeBlock.defaultAttrs.language,
      instantiated: editor.document[0].props.language,
    },
  }, (_key, value) => typeof value === "function" ? "[function]" : value));
`

const snapshots = [
  {
    name: "frontend",
    cwd: new URL("../", import.meta.url),
    module: new URL("../src/components/docs/block-note-schema.ts", import.meta.url),
    exportName: "blockNoteSchema",
  },
  {
    name: "backend",
    cwd: new URL("../../backend/", import.meta.url),
    module: new URL("../../backend/src/collab/docTargetSchema.ts", import.meta.url),
    exportName: "docTargetSchema",
  },
].map(({ name, cwd, module, exportName }) => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, "--eval", probe],
    cwd: fileURLToPath(cwd),
    env: {
      ...process.env,
      SCHEMA_MODULE: module.href,
      SCHEMA_EXPORT: exportName,
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  })
  assert.equal(result.exitCode, 0, `${name} probe failed:\n${result.stderr.toString()}`)
  assert.equal(result.stderr.toString(), "", `${name} probe emitted diagnostics`)
  const snapshot = JSON.parse(result.stdout.toString())
  assert.deepEqual(snapshot.codeDefaults, {
    blockNote: "javascript",
    prosemirror: "javascript",
    instantiated: "javascript",
  }, `${name} code-block defaults must match the browser`)
  console.log(`${name}: ${snapshot.prosemirror.nodes.length} PM nodes, ${snapshot.prosemirror.marks.length} PM marks; code default javascript`)
  return snapshot
})

assert.deepEqual(snapshots[1], snapshots[0], "Backend/frontend schema parity failed")
console.log("PASS: BlockNote block/inline/style schemas and ordered PM node/mark specs, attributes, content constraints, and code defaults match.")
console.log("Scope: declarative schema parity; function presence is compared, not DOM renderer/parser behavior or live-editor behavior.")
