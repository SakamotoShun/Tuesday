import { describe, expect, it } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { block, cell, exportFixture, text } from "../../e2e/doc-export-fixture"
import { documentToMarkdown } from "./doc-export-markdown"
import { createPdfDefinition } from "./doc-export-pdf"
import { exportFilename, exportUrl, tableGrid, type DocumentSnapshot, type ExportTable } from "./doc-export"

const base = "https://tuesday.example/docs/one"
const md = (blocks: DocumentSnapshot["blocks"]) => documentToMarkdown({ title: "Test", blocks }, base)
const rendered = (markdown: string) => renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>)

describe("document export formatting", () => {
  it("keeps simple tables as GFM with escaped pipes, literal markup and alignment", () => {
    const result = md([block("table", { type: "tableContent", headerRows: 1, rows: [
      { cells: [cell("Name"), cell("Value", { textAlignment: "right" })] },
      { cells: [cell("a|b <tag> &copy;"), cell("42", { textAlignment: "right" })] },
    ] })])
    const html = rendered(result)
    expect(result).toContain("| --- | ---: |")
    expect(html).toContain("a|b &lt;tag&gt; &amp;copy;")
    expect(html).toContain('<td style="text-align:right">42</td>')
  })

  it("preserves merged and multiline cells as HTML without duplicate covered cells", () => {
    const table = block("table", { type: "tableContent", headerRows: 1, rows: [
      { cells: [cell("Both", { colspan: 2 })] },
      { cells: [cell("Tall", { rowspan: 2 }), cell("Line 1\nLine 2")] },
      { cells: [cell('<script>alert("bad")</script>', { backgroundColor: "yellow" })] },
    ] })
    const result = md([table])
    expect(result).toContain('<th colspan="2">Both</th>')
    expect(result).toContain('<td rowspan="2">Tall</td>')
    expect(result).toContain("Line 1<br>Line 2")
    expect(result).toContain("&lt;script&gt;")
    expect(result).not.toContain("<script>")
    expect((result.match(/<td/g) ?? []).length).toBe(3)
  })

  it("does not invent a header for tables without header rows", () => {
    const result = md([block("table", { type: "tableContent", rows: [{ cells: [cell("Data")] }] })])
    expect(result).toContain("<td>Data</td>")
    expect(result).not.toContain("<th>")
  })

  it("preserves nesting, checkboxes, explicit numbering and expanded toggles", () => {
    const result = documentToMarkdown(exportFixture(), base)
    expect(result).toContain("3. Numbered item starting at three")
    expect(result).toContain("4. Numbered item four")
    expect(result).toContain("     - [x] Completed nested task")
    expect(result).toContain("Hidden-in-editor content is included.")
    expect(rendered(result)).toContain('<ol start="3">')
  })

  it("keeps numbering when a list uses rich block styling", () => {
    const result = md([
      block("numberedListItem", text("First"), { start: 4 }),
      block("numberedListItem", text("Second"), { textColor: "red" }),
      block("numberedListItem", text("Third")),
    ])
    expect(result).toContain('<ol start="4"><li>First</li><li style="color:')
    expect(result).toContain("Second</li><li>Third</li></ol>")
  })

  it("escapes code fences and preserves code whitespace and Unicode", () => {
    const code = "  const café = `✓`;\n```\n  Ελληνικά Кириллица 日本語\n"
    const result = md([block("codeBlock", text(code), { language: "typescript" })])
    expect(result).toContain("````typescript\n" + code)
    expect(rendered(result)).toContain("  const café = `✓`;\n```\n  Ελληνικά Кириллица 日本語")
  })

  it("preserves an explicit numbering restart within a list", () => {
    const result = md([
      block("numberedListItem", text("One")),
      block("numberedListItem", text("Five"), { start: 5 }),
      block("numberedListItem", text("Six")),
    ])
    expect(result).toContain("<ol><li>One</li></ol>")
    expect(result).toContain('<ol start="5"><li>Five</li><li>Six</li></ol>')
  })

  it("preserves strikethrough formatting inside PDF links", () => {
    const { definition } = createPdfDefinition({ title: "Link styles", blocks: [block("paragraph", [
      { type: "link", href: "https://example.com", content: [{ type: "text", text: "Old link", styles: { strike: true } }] },
    ])] }, base)
    expect(JSON.stringify(definition)).toContain('"decoration":["lineThrough","underline"]')
  })

  it("preserves inline formatting boundaries and rejects executable links", () => {
    const result = md([block("paragraph", [
      ...text("un"), { type: "text", text: "der", styles: { bold: true } }, ...text("lined "),
      { type: "text", text: "colour", styles: { underline: true, textColor: "blue" } },
      { type: "link", href: "javascript:alert(1)", content: text("safe label") },
    ])])
    expect(result).toContain("un<strong>der</strong>lined")
    expect(result).toContain("<u>colour</u>")
    expect(result).not.toContain("javascript:")
    expect(result).toContain("safe label")
    expect(exportUrl("/api/v1/files/one", base)).toBe("https://tuesday.example/api/v1/files/one")
    expect(exportUrl("data:text/html,test", base)).toBeUndefined()
  })

  it("retains image captions, downloadable attachments and nested paragraphs", () => {
    const result = md([
      block("image", undefined, { url: "/image.png", name: 'a"b', caption: "Image caption", previewWidth: 300 }),
      block("file", undefined, { url: "/file.pdf", name: "Attachment" }),
      block("paragraph", text("Parent"), {}, [block("paragraph", text("Child"))]),
    ])
    expect(result).toContain('src="https://tuesday.example/image.png" alt="a&quot;b" width="300"')
    expect(result).toContain("<figcaption>Image caption</figcaption>")
    expect(result).toContain('href="https://tuesday.example/file.pdf">Attachment</a>')
    expect(result).toContain('<div style="margin-left:24px"><p>Child</p></div>')
  })

  it("expands merged cells for PDF and rejects corrupt spans", () => {
    const table = { type: "tableContent", rows: [
      { cells: [cell("Merged", { rowspan: 2 }), cell("Top")] },
      { cells: [cell("Bottom")] },
    ] } as ExportTable
    const { grid, columns } = tableGrid(table)
    expect(columns).toBe(2)
    expect(grid[1]![0]).toBeNull()
    expect(grid[1]![1]?.content).toEqual(text("Bottom"))
    expect(() => tableGrid({ ...table, rows: [{ cells: [cell("Bad", { rowspan: 2 })] }] } as ExportTable)).toThrow("invalid merged cells")
  })

  it("reports unavailable images and unsupported PDF scripts without dropping text", () => {
    const { definition, warnings } = createPdfDefinition({ title: "日本語", blocks: [
      block("image", undefined, { name: "Missing photo", url: "/missing.png" }),
      block("audio", undefined, { name: "Recording", url: "/audio.mp3", caption: "Audio caption" }),
    ] }, base)
    expect(warnings).toHaveLength(2)
    expect(JSON.stringify(definition)).toContain("Image unavailable: Missing photo")
    expect(JSON.stringify(definition)).toContain("https://tuesday.example/audio.mp3")
    expect(JSON.stringify(definition)).toContain("Audio caption")
    expect(definition.info?.title).toBe("日本語")
  })

  it("generates safe filenames without losing Unicode", () => {
    expect(exportFilename("  café / notes: v2?  ", "pdf")).toBe("café - notes- v2-.pdf")
    expect(exportFilename("...", "md")).toBe("Untitled.md")
    expect(exportFilename("CON", "md")).toBe("_CON.md")
    expect(exportFilename("日本語", "md")).toBe("日本語.md")
    expect(Array.from(exportFilename("😀".repeat(150), "md").slice(0, -3))).toHaveLength(120)
  })
})
