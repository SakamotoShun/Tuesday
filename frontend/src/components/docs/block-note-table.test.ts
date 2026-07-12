import { describe, expect, it } from "bun:test"

describe("BlockNote table payloads", () => {
  it("round-trips the table shape documented for MCP clients", () => {
    const table = {
      id: "agent-table-1",
      type: "table",
      props: { textColor: "default" },
      content: {
        type: "tableContent",
        columnWidths: [160, 160],
        rows: [
          {
            cells: [
              {
                type: "tableCell",
                props: {
                  backgroundColor: "default",
                  textColor: "default",
                  textAlignment: "left",
                  colspan: 1,
                  rowspan: 1,
                },
                content: [{ type: "text", text: "Name", styles: { bold: true } }],
              },
              {
                type: "tableCell",
                props: {
                  backgroundColor: "default",
                  textColor: "default",
                  textAlignment: "left",
                  colspan: 1,
                  rowspan: 1,
                },
                content: [{ type: "text", text: "Status", styles: { bold: true } }],
              },
            ],
          },
        ],
      },
      children: [],
    }
    const script = `
      import { BlockNoteEditor } from "@blocknote/core";
      import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
      const table = JSON.parse(process.env.TABLE);
      const editor = BlockNoteEditor.create();
      const ydoc = blocksToYDoc(editor, [table], "prosemirror");
      console.log(JSON.stringify(yDocToBlocks(editor, ydoc, "prosemirror")[0]));
    `
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: { ...process.env, TABLE: JSON.stringify(table) },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.stderr.toString()).toBe("")
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toEqual(table)
  })
})
