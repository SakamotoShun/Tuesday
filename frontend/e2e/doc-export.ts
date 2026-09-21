import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"
import puppeteer from "puppeteer-core"

// Run: bun run e2e/doc-export.ts. Requires Chromium and Poppler's pdftotext.
// Uses the real editor schema, lazy browser PDF bundle, and downloaded PDF bytes.
const output = "/tmp/opencode/doc-export"
await mkdir(output, { recursive: true })
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { host: "127.0.0.1", port: 0 },
  plugins: [{ name: "export-proof", resolveId(id) { if (id === "/__export-entry.ts") return id },
    load(id) {
      if (id !== "/__export-entry.ts") return
      return `
        import { BlockNoteEditor } from '@blocknote/core';
        import { blockNoteSchema } from '/src/components/docs/block-note-schema.ts';
        import { block, exportFixture } from '/e2e/doc-export-fixture.ts';
        import { documentToPdf } from '/src/lib/doc-export-pdf.ts';
        import { documentToMarkdown } from '/src/lib/doc-export-markdown.ts';
        try {
          const fixture = exportFixture();
          fixture.blocks.push(
            block('image', undefined, { url: '/__export-image.svg', name: 'Embedded image', caption: 'Embedded image caption', previewWidth: 240 }),
            block('image', undefined, { url: '/__export-missing.png', name: 'Missing photo', caption: 'Missing image caption' }),
          );
          const editor = BlockNoteEditor.create({ schema: blockNoteSchema, initialContent: fixture.blocks });
          const snapshot = { ...fixture, blocks: editor.document };
          const result = await documentToPdf(snapshot, location.href);
          window.result = { bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer())), warnings: result.warnings, markdown: documentToMarkdown(snapshot, location.href) };
        } catch (error) { window.failure = String(error.stack || error); }
      `
    }, configureServer(vite) {
    vite.middlewares.use("/__export-image.svg", (_req, res) => {
      res.setHeader("Content-Type", "image/svg+xml")
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#2563eb"/><circle cx="120" cy="40" r="30" fill="#fff"/></svg>')
    })
    vite.middlewares.use("/__export-missing.png", (_req, res) => { res.statusCode = 404; res.end() })
    vite.middlewares.use("/__export", (_req, res) => {
      res.setHeader("Content-Type", "text/html")
      res.end('<html><body><script type="module" src="/__export-entry.ts"></script></body></html>')
    })
  } }],
})
await server.listen()
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] })
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on("pageerror", (error) => { errors.push(String(error)); console.error(error) })
  page.on("console", (message) => { if (message.type() === "error") console.error(message.text()) })
  await page.goto(`${server.resolvedUrls!.local[0]}__export`)
  await page.waitForFunction("window.result || window.failure", { timeout: 45_000 })
  const { result, failure } = await page.evaluate(() => ({ result: (window as any).result, failure: (window as any).failure }))
  assert.equal(failure, undefined)
  assert.deepEqual(errors, [])
   assert.deepEqual(result.warnings, ["Image unavailable: Missing photo. A link was included instead."])
  await writeFile(`${output}/proof.pdf`, new Uint8Array(result.bytes))
  await writeFile(`${output}/proof.md`, result.markdown)
  const process = Bun.spawn(["pdftotext", "-layout", `${output}/proof.pdf`, "-"], { stdout: "pipe" })
  const text = await new Response(process.stdout).text()
  assert.equal(await process.exited, 0)
  assert.ok(text.includes("END OF EXPORT"))
  assert.ok(text.includes("Merged header"))
  assert.ok(text.includes("Vertical merge"))
   assert.ok(text.includes("const value89"))
   assert.ok(text.includes("Embedded image caption"))
   assert.ok(text.includes("Image unavailable: Missing photo"))
   const images = Bun.spawn(["pdfimages", "-list", `${output}/proof.pdf`], { stdout: "pipe" })
   const imageList = await new Response(images.stdout).text()
   assert.equal(await images.exited, 0)
   assert.match(imageList, /image\s+240\s+80/, "the PDF should contain the embedded image")
  assert.ok((text.match(/ROW HEADER/g) ?? []).length >= 3, "table headers should repeat on each page")
  assert.ok(result.markdown.includes('colspan="2"'))
  assert.ok(result.markdown.includes('rowspan="2"'))
  console.log(`PASS: browser PDF/Markdown export; ${result.bytes.length} PDF bytes. Inspect ${output}/proof.pdf`)
} finally {
  await browser.close()
  await server.close()
}
