import type { Block } from "@blocknote/core"
import type { DocumentSnapshot, ExportCell, ExportInline } from "../src/lib/doc-export"

export const text = (value: string): ExportInline => [{ type: "text", text: value, styles: {} }]
export const cell = (value: string, props: ExportCell["props"] = {}) => ({ type: "tableCell" as const, content: text(value), props: { textColor: "default", backgroundColor: "default", textAlignment: "left", ...props } })
export function block(type: Block["type"], content: unknown = [], props = {}, children: Block[] = []): Block {
  return { id: crypto.randomUUID(), type, content, props: { textColor: "default", backgroundColor: "default", textAlignment: "left", ...props }, children } as Block
}

export function exportFixture(): DocumentSnapshot {
  return { title: "Export proof — café Ελληνικά Кириллица", blocks: [
    block("heading", text("Formatted blocks"), { level: 2 }),
    block("paragraph", [
      { type: "text", text: "Bold, ", styles: { bold: true } },
      { type: "text", text: "italic, ", styles: { italic: true } },
      { type: "text", text: "underlined and coloured. ", styles: { underline: true, textColor: "blue" } },
      { type: "link", href: "https://example.com", content: text("Clickable link") },
    ]),
    block("quote", text("A quotation with a line break.\nThe second line.")),
    block("numberedListItem", text("Numbered item starting at three"), { start: 3 }, [
      block("bulletListItem", text("Nested bullet"), {}, [block("checkListItem", text("Completed nested task"), { checked: true })]),
    ]),
    block("numberedListItem", text("Numbered item four")),
    block("toggleListItem", text("Expanded toggle"), {}, [block("paragraph", text("Hidden-in-editor content is included."))]),
    block("heading", text("Merged cells"), { level: 2 }),
    block("table", { type: "tableContent", columnWidths: [110, 170, 200], headerRows: 1, rows: [
      { cells: [cell("Merged header", { colspan: 2 }), cell("Third column")] },
      { cells: [cell("Vertical merge", { rowspan: 2, backgroundColor: "yellow" }), cell("Row one"), cell("A long cell wraps without overlapping its neighbours. ".repeat(3))] },
      { cells: [cell("Row two\nSecond line", { textAlignment: "center" }), cell("Last cell")] },
    ] }),
    block("heading", text("Table spanning multiple pages"), { level: 2 }),
    block("table", { type: "tableContent", columnWidths: [70, 160, 250], headerRows: 1, rows: [
      { cells: [cell("ROW HEADER"), cell("NAME HEADER"), cell("DETAIL HEADER")] },
      ...Array.from({ length: 85 }, (_, i) => ({ cells: [cell(String(i + 1)), cell(`Record ${i + 1}`), cell(`Content ${i + 1}: selectable text and predictable wrapping.`)] })),
    ] }),
    block("heading", text("Code spanning pages"), { level: 2 }),
    block("codeBlock", text(Array.from({ length: 90 }, (_, i) => `  const value${i} = "${i === 2 ? "long_unbroken_value_".repeat(25) : `line ${i}`}";`).join("\n")), { language: "typescript" }),
    block("paragraph", text("END OF EXPORT")),
  ] }
}
