import { COLORS_DEFAULT, type Block } from "@blocknote/core"

export type ExportInline = Extract<Block, { type: "paragraph" }>["content"]
export type ExportTable = Extract<Block, { type: "table" }>["content"]
export type ExportCell = {
  content: ExportInline
  props: { textAlignment?: string; textColor?: string; backgroundColor?: string; colspan?: number; rowspan?: number }
}
export interface DocumentSnapshot { title: string; blocks: Block[] }
export interface ExportResult { blob: Blob; warnings: string[] }

export function exportFilename(title: string, extension: "md" | "pdf") {
  const name = Array.from(title.normalize("NFC").replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "-").trim())
    .slice(0, 120).join("").replace(/[. ]+$/g, "") || "Untitled"
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name}.${extension}`
}

export function downloadExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  try { anchor.click() } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

export function exportColor(value: string | undefined, kind: "text" | "background") {
  if (!value || value === "default") return undefined
  const named = COLORS_DEFAULT[value as keyof typeof COLORS_DEFAULT]
  if (named) return named[kind]
  // Allow actual colour values, never arbitrary CSS declarations.
  return /^(#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d.,%\s+-]+\))$/i.test(value) ? value : undefined
}

export function exportUrl(value: string, baseUrl: string) {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value, baseUrl)
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}

export function inlineText(content: ExportInline): string {
  return content.map((item) => item.type === "link" ? inlineText(item.content) : item.text).join("")
}

// BlockNote omits covered cells; pdfmake needs a rectangular grid with placeholders.
// Keeping the origin positions also lets HTML emit row/column spans without duplicates.
export function tableGrid(table: ExportTable) {
  const grid: (ExportCell | null)[][] = table.rows.map(() => [])
  table.rows.forEach((row, y) => {
    let x = 0
    for (const raw of row.cells) {
      while (grid[y]![x] !== undefined) x++
      const cell: ExportCell = Array.isArray(raw) ? { content: raw, props: {} } : raw
      const colspan = cell.props.colspan ?? 1
      const rowspan = cell.props.rowspan ?? 1
      if (!Number.isInteger(colspan) || !Number.isInteger(rowspan) || colspan < 1 || rowspan < 1 || y + rowspan > grid.length) {
        throw new Error("This table has invalid merged cells. Repair the table before exporting.")
      }
      for (let dy = 0; dy < rowspan; dy++) {
        for (let dx = 0; dx < colspan; dx++) {
          if (grid[y + dy]![x + dx] !== undefined) throw new Error("This table has overlapping merged cells.")
          grid[y + dy]![x + dx] = dy === 0 && dx === 0 ? cell : null
        }
      }
      x += colspan
    }
  })
  const columns = Math.max(0, ...grid.map((row) => row.length))
  for (const row of grid) {
    for (let x = 0; x < columns; x++) if (row[x] === undefined) row[x] = { content: [], props: {} }
  }
  return { grid, columns }
}
