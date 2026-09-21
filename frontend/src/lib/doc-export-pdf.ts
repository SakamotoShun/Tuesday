import type { Block } from "@blocknote/core"
import type { Content, ContentText, Style, TableCell, TDocumentDefinitions } from "pdfmake/interfaces"
import { exportColor, exportUrl, inlineText, tableGrid, type DocumentSnapshot, type ExportInline, type ExportResult } from "./doc-export"

const PAGE_WIDTH = 499 // A4 minus 48pt margins

function isLatin1(text: string) {
  for (const character of text) if (character.charCodeAt(0) > 255) return false
  return true
}

function blockStyle(props: { textAlignment?: string; textColor?: string; backgroundColor?: string; [key: string]: unknown }): Style {
  return {
    alignment: ["left", "center", "right", "justify"].includes(props.textAlignment ?? "") ? props.textAlignment as Style["alignment"] : "left",
    color: exportColor(props.textColor, "text"),
    background: exportColor(props.backgroundColor, "background"),
  }
}

function pdfInline(content: ExportInline, baseUrl: string): ContentText[] {
  return content.flatMap((item): ContentText[] => {
    if (item.type === "link") return pdfInline(item.content, baseUrl).map((part) => ({
      ...part, link: exportUrl(item.href, baseUrl), color: part.color ?? "#2563eb",
      decoration: [...new Set([...(Array.isArray(part.decoration) ? part.decoration : []), "underline" as const])],
    }))
    const s = item.styles
    const decoration: ("underline" | "lineThrough")[] = []
    if (s.underline) decoration.push("underline")
    if (s.strike) decoration.push("lineThrough")
    return [{ text: item.text, bold: s.bold, italics: s.italic, decoration,
      color: exportColor(s.textColor, "text"), background: exportColor(s.backgroundColor, "background") ?? (s.code ? "#f1f5f9" : undefined),
      font: s.code && isLatin1(item.text) ? "RobotoMono" : undefined,
    }]
  })
}

export function createPdfDefinition(snapshot: DocumentSnapshot, baseUrl: string, images: Map<string, string> = new Map()) {
  const warnings = new Set<string>()
  const convert = (blocks: Block[], width = PAGE_WIDTH): Content[] => {
    const result: Content[] = []
    let numbered = 0
    for (const block of blocks) {
      if (block.type !== "numberedListItem") numbered = 0
      const style = blockStyle(block.props)
      const text = Array.isArray(block.content) ? pdfInline(block.content, baseUrl) : []
      const paragraph: ContentText = { text: text.length ? text : " ", ...style, margin: [0, 0, 0, 7] }
      switch (block.type) {
        case "paragraph": result.push(paragraph); break
        case "heading": result.push({ ...paragraph, fontSize: [24, 20, 16, 14, 12, 11][block.props.level - 1], bold: true, margin: [0, 12, 0, 7] }); break
        case "quote": result.push({ table: { widths: [Math.max(10, width - 17)], body: [[{ ...paragraph, border: [true, false, false, false], margin: [7, 4, 0, 4] }]] }, layout: { vLineColor: () => "#94a3b8", vLineWidth: () => 2 }, margin: [0, 0, 0, 7] }); break
        case "toggleListItem": result.push({ ...paragraph, bold: true }); break
        case "divider": result.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: "#cbd5e1" }], margin: [0, 10, 0, 10] }); break
        case "codeBlock": {
          const code = inlineText(block.content)
          // A splittable table cell keeps shading and whitespace across page breaks.
          result.push({ table: { widths: [Math.max(10, width - 16)], body: [[{
            text: code || " ", font: isLatin1(code) ? "RobotoMono" : "Roboto", fontSize: 9,
            preserveLeadingSpaces: true, preserveTrailingSpaces: true, fillColor: "#f1f5f9", margin: [4, 4, 4, 4],
          }]] }, layout: "noBorders", margin: [0, 0, 0, 9] })
          break
        }
        case "bulletListItem": case "checkListItem": case "numberedListItem": {
          if (block.type === "numberedListItem") numbered = block.props.start ?? numbered + 1
          const marker = block.type === "numberedListItem" ? `${numbered}.` : block.type === "checkListItem" ? (block.props.checked ? "[x]" : "[ ]") : "•"
          const indent = Math.max(22, marker.length * 6)
          result.push({ columns: [{ text: marker, width: indent, ...style }, { ...paragraph, width: "*" }], margin: [0, 0, 0, 2] })
          if (block.children.length) result.push({ stack: convert(block.children, Math.max(30, width - indent)), margin: [indent, 0, 0, 0] })
          continue
        }
        case "table": {
          const table = block.content
          const { grid, columns } = tableGrid(table)
          if (!columns || !grid.length) break
          let headerRows = Math.min(table.headerRows ?? 0, grid.length)
          // A repeating header cannot end in the middle of a vertically merged cell.
          for (let y = 0; y < headerRows; y++) for (const cell of grid[y]!) if (cell) headerRows = Math.max(headerRows, y + (cell.props.rowspan ?? 1))
          const weights = Array.from({ length: columns }, (_, x) => Math.max(40, table.columnWidths?.[x] ?? 160))
          const total = weights.reduce((a, b) => a + b, 0)
          const available = Math.max(columns * 10, width - columns * 9 - 1)
          const body: TableCell[][] = grid.map((row, y) => row.map((cell, x): TableCell => cell ? {
            text: pdfInline(cell.content, baseUrl), ...blockStyle(cell.props),
            colSpan: cell.props.colspan ?? 1, rowSpan: cell.props.rowspan ?? 1,
            bold: y < (table.headerRows ?? 0) || x < (table.headerCols ?? 0),
            fillColor: exportColor(cell.props.backgroundColor, "background") ?? (y < (table.headerRows ?? 0) || x < (table.headerCols ?? 0) ? "#f1f5f9" : undefined),
            margin: [0, 3, 0, 3],
          } : {}))
          result.push({ table: { headerRows, widths: weights.map((n) => available * n / total), body },
            layout: { hLineColor: () => "#cbd5e1", vLineColor: () => "#cbd5e1", hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
            fontSize: columns > 6 ? 8 : 10, margin: [0, 3, 0, 10],
          })
          break
        }
        case "image": case "file": case "audio": case "video": {
          const url = exportUrl(block.props.url, baseUrl)
          const label = block.props.name || block.type
          const image = images.get(block.props.url)
          if (block.type === "image" && image) {
            result.push({ image, fit: [Math.min(width, block.props.previewWidth ? block.props.previewWidth * 0.75 : width), 620], alignment: style.alignment, margin: [0, 0, 0, 5] })
          } else {
            if (block.type === "image") warnings.add(`Image unavailable: ${label}. A link was included instead.`)
            result.push({ text: `${block.type === "image" ? "Image unavailable: " : ""}${label}`, link: url, color: url ? "#2563eb" : undefined, decoration: url ? "underline" : undefined, margin: [0, 0, 0, 5] })
          }
          if (block.props.caption) result.push({ text: block.props.caption, italics: true, color: "#64748b", fontSize: 9, margin: [0, 0, 0, 8] })
          break
        }
        default: throw new Error(`Unsupported document block: ${(block as Block).type}`)
      }
      if (block.children.length) result.push({ stack: convert(block.children, Math.max(30, width - 18)), margin: [18, 0, 0, 0] })
    }
    return result
  }
  const content = convert(snapshot.blocks)
  // Bundled Roboto supports Latin, Greek and Cyrillic. Make missing-script risk visible.
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Extended_Pictographic}]/u.test(JSON.stringify(snapshot))) {
    warnings.add("Some characters may not be supported by the PDF fonts. Use Markdown to preserve all Unicode text.")
  }
  const definition: TDocumentDefinitions = {
    info: { title: snapshot.title || "Untitled", creator: "Tuesday" },
    pageSize: "A4", pageMargins: [48, 48, 48, 48],
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.2, color: "#1e293b" },
    content: [{ text: snapshot.title || "Untitled", fontSize: 28, bold: true, margin: [0, 0, 0, 20] }, ...content],
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: "center", fontSize: 8, color: "#64748b", margin: [0, 16, 0, 0] }),
  }
  return { definition, warnings: [...warnings] }
}

async function loadImage(url: string): Promise<string> {
  const response = await fetch(url, { credentials: "same-origin", signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error("Image unavailable")
  const blob = await response.blob()
  if (blob.size > 20 * 1024 * 1024) throw new Error("Image too large")
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image conversion unavailable")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png")
  } finally { URL.revokeObjectURL(objectUrl) }
}

export async function documentToPdf(snapshot: DocumentSnapshot, baseUrl: string): Promise<ExportResult> {
  const [{ default: pdfMake }, { default: fonts }, ...monoFonts] = await Promise.all([
    import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts"),
    import("@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff?url"),
    import("@fontsource/roboto-mono/files/roboto-mono-latin-700-normal.woff?url"),
    import("@fontsource/roboto-mono/files/roboto-mono-latin-400-italic.woff?url"),
    import("@fontsource/roboto-mono/files/roboto-mono-latin-700-italic.woff?url"),
  ])
  pdfMake.addVirtualFileSystem(fonts)
  const [normal, bold, italics, bolditalics] = monoFonts.map(({ default: url }) => new URL(url, baseUrl).href)
  pdfMake.addFonts({ RobotoMono: { normal: normal!, bold: bold!, italics: italics!, bolditalics: bolditalics! } })
  const images = new Map<string, string>()
  const urls = new Set<string>()
  const visit = (blocks: Block[]) => { for (const block of blocks) { if (block.type === "image") urls.add(block.props.url); visit(block.children) } }
  visit(snapshot.blocks)
  // Sequential loading bounds memory for image-heavy documents.
  for (const raw of urls) {
    const url = exportUrl(raw, baseUrl)
    if (!url || !/^https?:/.test(url)) continue
    try { images.set(raw, await loadImage(url)) } catch { /* Report the missing image in the result and PDF. */ }
  }
  const { definition, warnings } = createPdfDefinition(snapshot, baseUrl, images)
  const blob = await pdfMake.createPdf(definition).getBlob()
  return { blob, warnings }
}
