import type { Block } from "@blocknote/core"
import { exportColor, exportUrl, inlineText, tableGrid, type DocumentSnapshot, type ExportInline, type ExportTable } from "./doc-export"

const htmlEscape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const markdownEscape = (text: string) => text.replace(/([\\`*_{}[\]()#+\-.!|~])/g, "\\$1").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const isList = (block: Block) => ["bulletListItem", "numberedListItem", "checkListItem"].includes(block.type)

function css(props: { textAlignment?: string; textColor?: string; backgroundColor?: string; [key: string]: unknown }) {
  const styles = []
  const color = exportColor(props.textColor, "text")
  const background = exportColor(props.backgroundColor, "background")
  if (color) styles.push(`color:${color}`)
  if (background) styles.push(`background-color:${background}`)
  if (props.textAlignment && ["center", "right", "justify"].includes(props.textAlignment)) styles.push(`text-align:${props.textAlignment}`)
  return styles.length ? ` style="${styles.join(";")}"` : ""
}

function inline(content: ExportInline, baseUrl: string, html = false): string {
  return content.map((item, index) => {
    if (item.type === "link") {
      const label = inline(item.content, baseUrl, html)
      const href = exportUrl(item.href, baseUrl)
      if (!href) return label
      return html ? `<a href="${htmlEscape(href)}">${label}</a>` : `[${label}](<${href.replace(/&/g, "&amp;").replace(/</g, "%3C").replace(/>/g, "%3E")}>)`
    }
    const s = item.styles
    // Markdown emphasis delimiters cannot reliably express formatting inside a word
    // or adjacent runs with different marks. HTML keeps those boundaries exact.
    const adjacent = (index > 0 && /\S$/.test(inlineText([content[index - 1]!])) && /^\S/.test(item.text)) ||
      (index + 1 < content.length && /\S$/.test(item.text) && /^\S/.test(inlineText([content[index + 1]!])) )
    if (html || s.underline || s.textColor || s.backgroundColor || (adjacent && (s.bold || s.italic || s.strike)) || (s.code && /[\n|]/.test(item.text))) {
      let text = htmlEscape(item.text).replace(/\n/g, "<br>")
      if (s.code) text = `<code>${text}</code>`
      if (s.bold) text = `<strong>${text}</strong>`
      if (s.italic) text = `<em>${text}</em>`
      if (s.strike) text = `<s>${text}</s>`
      if (s.underline) text = `<u>${text}</u>`
      const style = css(s)
      return style ? `<span${style}>${text}</span>` : text
    }
    let text = markdownEscape(item.text).replace(/\n/g, "<br>")
    if (s.code) {
      const ticks = "`".repeat(Math.max(0, ...Array.from(item.text.matchAll(/`+/g), (m) => m[0].length)) + 1)
      const pad = /^`|`$|^ .* $/.test(item.text) ? " " : ""
      text = `${ticks}${pad}${item.text}${pad}${ticks}`
    }
    const wrap = (marker: string) => { text = text.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_m, before, middle, after) => middle ? `${before}${marker}${middle}${marker}${after}` : before + after) }
    if (s.bold) wrap("**")
    if (s.italic) wrap("*")
    if (s.strike) wrap("~~")
    return text
  }).join("")
}

function htmlTable(table: ExportTable, baseUrl: string) {
  const { grid } = tableGrid(table)
  return `<table>\n${grid.map((row, y) => `<tr>${row.map((cell, x) => {
    if (!cell) return ""
    const tag = y < (table.headerRows ?? 0) || x < (table.headerCols ?? 0) ? "th" : "td"
    const col = (cell.props.colspan ?? 1) > 1 ? ` colspan="${cell.props.colspan}"` : ""
    const row = (cell.props.rowspan ?? 1) > 1 ? ` rowspan="${cell.props.rowspan}"` : ""
    return `<${tag}${col}${row}${css(cell.props)}>${inline(cell.content, baseUrl, true)}</${tag}>`
  }).join("")}</tr>`).join("\n")}\n</table>`
}

function markdownTable(table: ExportTable, baseUrl: string) {
  const { grid } = tableGrid(table)
  // GFM requires exactly one header row and uniform per-column alignment.
  const simple = table.headerRows === 1 && !table.headerCols && grid.length > 0 && grid.every((row) => row.every((cell, x) =>
    cell && (cell.props.colspan ?? 1) === 1 && (cell.props.rowspan ?? 1) === 1 &&
    !css({ textColor: cell.props.textColor, backgroundColor: cell.props.backgroundColor }) &&
    (cell.props.textAlignment ?? "left") === (grid[0]![x]?.props.textAlignment ?? "left") &&
    !inlineText(cell.content).includes("\n")
  ))
  if (!simple) return htmlTable(table, baseUrl)
  const rows = grid.map((row) => `| ${row.map((cell) => inline(cell!.content, baseUrl).replace(/(?<!\\)\|/g, "&#124;")).join(" | ")} |`)
  rows.splice(1, 0, `| ${grid[0]!.map((cell) => cell?.props.textAlignment === "center" ? ":---:" : cell?.props.textAlignment === "right" ? "---:" : "---").join(" | ")} |`)
  return rows.join("\n")
}

function htmlBlocks(blocks: Block[], baseUrl: string): string {
  const output: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (isList(block)) {
      const tag = block.type === "numberedListItem" ? "ol" : "ul"
      const start = block.type === "numberedListItem" && block.props.start ? ` start="${block.props.start}"` : ""
      const items = []
      do {
        const item = blocks[i]!
        const check = item.type === "checkListItem" ? (item.props.checked ? "&#9745; " : "&#9744; ") : ""
        items.push(`<li${css(item.props)}>${check}${inline(item.content as ExportInline, baseUrl, true)}${htmlBlocks(item.children, baseUrl)}</li>`)
        i++
      } while (i < blocks.length && blocks[i]!.type === block.type && !("start" in blocks[i]!.props && (blocks[i]!.props as { start?: number }).start !== undefined))
      i--
      output.push(`<${tag}${start}>${items.join("")}</${tag}>`)
      continue
    }
    const text = Array.isArray(block.content) ? inline(block.content, baseUrl, true) : ""
    let body: string
    switch (block.type) {
      case "table": body = htmlTable(block.content, baseUrl); break
      case "heading": body = `<h${block.props.level}${css(block.props)}>${text}</h${block.props.level}>`; break
      case "codeBlock": body = `<pre><code>${htmlEscape(inlineText(block.content))}</code></pre>`; break
      case "divider": body = "<hr>"; break
      case "quote": body = `<blockquote${css(block.props)}>${text}</blockquote>`; break
      case "toggleListItem": body = `<p${css(block.props)}><strong>${text}</strong></p>`; break
      case "image": case "file": case "audio": case "video": {
        const url = exportUrl(block.props.url, baseUrl)
        const label = htmlEscape(block.props.name || block.type)
        body = block.type === "image" && url
          ? `<figure><img src="${htmlEscape(url)}" alt="${label}"${block.props.previewWidth ? ` width="${Number(block.props.previewWidth)}"` : ""}>${block.props.caption ? `<figcaption>${htmlEscape(block.props.caption)}</figcaption>` : ""}</figure>`
          : `<p>${url ? `<a href="${htmlEscape(url)}">${label}</a>` : label}${block.props.caption ? `<br>${htmlEscape(block.props.caption)}` : ""}</p>`
        break
      }
      case "paragraph": body = `<p${css(block.props)}>${text || "<br>"}</p>`; break
      default: throw new Error(`Unsupported document block: ${(block as Block).type}`)
    }
    output.push(body)
    if (block.children.length) output.push(`<div style="margin-left:24px">${htmlBlocks(block.children, baseUrl)}</div>`)
  }
  return output.join("\n")
}

function markdownBlocks(blocks: Block[], baseUrl: string): string {
  let counter = 0
  const output: string[] = []
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!
    if (block.type !== "numberedListItem") counter = 0
    if (isList(block) && blocks[index - 1]?.type !== block.type) {
      let end = index + 1
      while (end < blocks.length && blocks[end]!.type === block.type) end++
      const run = blocks.slice(index, end)
      if (run.some((item, i) => css(item.props) || (i > 0 && item.type === "numberedListItem" && item.props.start !== undefined))) {
        output.push(htmlBlocks(run, baseUrl))
        index = end - 1
        counter = 0
        continue
      }
    }
    if (css(block.props) || (block.children.length && !isList(block)) || block.type === "toggleListItem") {
      output.push(htmlBlocks([block], baseUrl))
      continue
    }
    const text = Array.isArray(block.content) ? inline(block.content, baseUrl) : ""
    let body: string
    switch (block.type) {
      case "heading": body = `${"#".repeat(block.props.level)} ${text}`; break
      case "paragraph": body = text || "<br>"; break
      case "quote": body = `> ${text}`; break
      case "divider": body = "---"; break
      case "codeBlock": {
        const code = inlineText(block.content)
        const fence = "`".repeat(Math.max(2, ...Array.from(code.matchAll(/`+/g), (m) => m[0].length)) + 1)
        body = `${fence}${block.props.language.replace(/[^\w#+.-]/g, "")}\n${code}\n${fence}`
        break
      }
      case "table": body = markdownTable(block.content, baseUrl); break
      case "bulletListItem": case "numberedListItem": case "checkListItem": {
        if (block.type === "numberedListItem") counter = block.props.start ?? (blocks[index - 1]?.type === "numberedListItem" ? counter + 1 : 1)
        const marker = block.type === "numberedListItem" ? `${counter}. ` : block.type === "checkListItem" ? `- [${block.props.checked ? "x" : " "}] ` : "- "
        body = `${marker}${text}`
        if (block.children.length) body += `\n\n${markdownBlocks(block.children, baseUrl).split("\n").map((line) => " ".repeat(marker.length) + line).join("\n")}`
        break
      }
      case "image": case "file": case "audio": case "video": body = htmlBlocks([block], baseUrl); break
      default: throw new Error(`Unsupported document block: ${(block as Block).type}`)
    }
    output.push(body)
  }
  return output.join("\n\n")
}

export function documentToMarkdown(snapshot: DocumentSnapshot, baseUrl: string) {
  return `# ${markdownEscape(snapshot.title || "Untitled").replace(/\n/g, " ")}\n\n${markdownBlocks(snapshot.blocks, baseUrl)}\n`
}
