import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import puppeteer, { type BrowserContext, type Page } from 'puppeteer-core'

if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true' || !process.env.DATABASE_URL) throw new Error('Set an isolated DATABASE_URL and RUN_DB_INTEGRATION_TESTS=true')
const frontend = fileURLToPath(new URL('../', import.meta.url))
const temp = await mkdtemp('/tmp/opencode/doc-live-workflow-')
const backend = spawn('bun', ['run', 'src/collab/docLiveWorkflow.ts'], {
  cwd: join(frontend, '../backend'), env: { ...process.env, NODE_ENV: 'test',
    SESSION_SECRET: 'isolated-live-workflow-signing-secret-2026' }, stdio: ['pipe', 'pipe', 'inherit'],
})
let commandId = 0
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
let readyResolve: (value: number) => void, readyReject: (error: Error) => void
const ready = new Promise<number>((resolve, reject) => { readyResolve = resolve; readyReject = reject })
const lines = createInterface({ input: backend.stdout })
lines.on('line', line => {
  if (!line.startsWith('WORKFLOW ')) { console.log(line); return }
  const result = JSON.parse(line.slice(9))
  if (result.ready) { readyResolve(result.port); return }
  const request = pending.get(result.id); pending.delete(result.id)
  if (result.error) request?.reject(new Error(result.error)); else request?.resolve(result.data)
})
backend.on('exit', code => { const error = new Error(`Backend exited ${code}`); readyReject(error); for (const request of pending.values()) request.reject(error) })
const command = (action: string, docId?: string) => new Promise<any>((resolve, reject) => {
  const id = ++commandId; pending.set(id, { resolve, reject }); backend.stdin.write(`${JSON.stringify({ id, action, docId })}\n`)
})
const vite = await createServer({ configFile: false, root: frontend, cacheDir: join(temp, 'vite'), plugins: [react()],
  resolve: { alias: { '@': join(frontend, 'src') }, dedupe: ['yjs', 'zod'] },
  server: { host: '127.0.0.1', port: 0 } })
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
const inspect = (page: Page) => page.evaluate(() => (window as any).reconnectTest.inspect())
const caret = (page: Page) => page.evaluate(() => {
  const selection = (window as any).ProseMirror.state.selection
  return { block: selection.$from.node(-1).attrs.id, offset: selection.$from.parentOffset, empty: selection.empty }
})
const append = async (page: Page, blockId: string, text: string) => {
  await page.bringToFront()
  await page.evaluate(id => {
    const editor = (window as any).ProseMirror
    let position = -1
    editor.state.doc.descendants((node: any, pos: number) => {
      if (node.attrs.id === id) position = pos + 2 + node.firstChild.content.size
    })
    if (position < 0) throw new Error(`Missing block ${id}`)
    editor.commands.setTextSelection(position); editor.view.focus()
  }, blockId)
  await page.keyboard.sendCharacter(text)
}
try {
  const port = await ready
  await vite.listen()
  browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true, userDataDir: join(temp, 'chromium'), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const fixture = await command('seed')
    const rpc = async (method: string, params: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST',
        headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }) })
      const result = await response.json() as any
      assert.equal(response.status, 200, JSON.stringify(result)); assert.ok(!result.error, JSON.stringify(result)); return result.result
    }
    const tool = async (name: string, input: unknown) => {
      const result = await rpc('tools/call', { name, arguments: input })
      assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent.data
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status, 401)
    const listed = await rpc('tools/list', {})
    for (const name of ['get_doc', 'search_doc', 'patch_doc']) assert.ok(listed.tools.some((tool: any) => tool.name === name))
    const contexts: BrowserContext[] = await Promise.all([browser.createBrowserContext(), browser.createBrowserContext()])
    const browserErrors: string[] = []
    const pages: Page[] = await Promise.all(contexts.map(async (context, i) => {
      await context.setCookie({ name: 'session_id', value: fixture.sessions[i], domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' })
      const page = await context.newPage(); await page.setViewport(viewport)
      page.on('pageerror', error => { browserErrors.push(String(error)); console.error('Browser error:', error) })
      page.on('console', async message => { if (message.type() === 'error') console.error('Browser console:', message.text(),
        await Promise.all(message.args().map(arg => arg.evaluate(value => value instanceof Error ? value.stack : String(value)).catch(() => 'closed')))) })
      const address = vite.httpServer!.address() as { port: number }
      await page.goto(`http://127.0.0.1:${address.port}/e2e/doc-reconnect.html?docId=${fixture.docId}&relay=${encodeURIComponent(`ws://127.0.0.1:${port}/api/v1/collab/docs/${fixture.docId}`)}`)
      await page.waitForFunction(() => document.querySelector('.tiptap[contenteditable="true"]')
        && (window as any).ProseMirror?.state.doc.textContent.includes('TARGET'), { timeout: 30000 }).catch(async error => {
          console.error('Initial editor:', await page.evaluate(() => document.body.innerText)); throw error
        })
      await page.evaluate(() => (window as any).reconnectTest.remember())
      return page
    }))
    const a = pages[0]!, b = pages[1]!
    const search = await tool('search_doc', { docId: fixture.docId, query: 'TARGET' })
    console.log('Workflow: search issued; replacing target and typing')
    assert.equal(search.matches.length, 1); assert.ok(search.matches[0].targetRef)
    // Replace inside the issued target in the production binding before the agent uses it.
    await a.evaluate(() => {
      const editor = (window as any).ProseMirror
      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.attrs.id === 'target') editor.view.dispatch(editor.state.tr.insertText('HUMAN', pos + 2 + 7, pos + 2 + 13))
      })
    })
    await b.waitForFunction(() => (window as any).ProseMirror.state.doc.textContent.includes('HUMAN'))
    await append(a, 'writer-a', ' ')
    for (let i = 0; i < 110; i++) await a.keyboard.sendCharacter('x')
    // Outside formatting and ordinary grouped keyboard undo must not invalidate the target.
    await a.evaluate(() => {
      const editor = (window as any).ProseMirror
      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.attrs.id === 'writer-a') editor.view.dispatch(editor.state.tr.addMark(pos + 2, pos + 8, editor.state.schema.marks.bold.create()))
      })
      ;(window as any).reconnectTest.stopCapturing()
    })
    await a.keyboard.type('UNDO-ME')
    await a.keyboard.down('Control'); await a.keyboard.press('z'); await a.keyboard.up('Control')
    assert.ok(!(await inspect(a)).text.includes('UNDO-ME'))
    await append(a, 'writer-a', ' A-before')
    await b.waitForFunction(() => (window as any).ProseMirror.state.doc.textContent.includes('A-before'))
    await append(b, 'writer-b', ' B-before')
    await a.waitForFunction(() => (window as any).ProseMirror.state.doc.textContent.includes('B-before'))
    const request = { docId: fixture.docId, idempotencyKey: crypto.randomUUID(), operations: [
      { type: 'replace_text', targetRef: search.matches[0].targetRef, text: 'AGENT' },
    ] }
    const selection = await caret(b)
    console.log('Workflow: applying original reference')
    const [receipt] = await Promise.all([tool('patch_doc', request), append(a, 'writer-a', ' A-during')])
    await Promise.all(pages.map(page => page.waitForFunction(() => (window as any).ProseMirror.state.doc.textContent.includes('AGENT'))))
    assert.deepEqual(await caret(b), selection)
    assert.equal((await inspect(a)).focused, true)
    await a.keyboard.sendCharacter(' A-after')
    await b.bringToFront(); await b.keyboard.sendCharacter(' B-after')
    await Promise.all(pages.map(page => page.waitForFunction(() => {
      const text = (window as any).ProseMirror.state.doc.textContent
      return text.includes('A-after') && text.includes('B-after')
    })))
    assert.deepEqual(await tool('patch_doc', request), receipt)
    const current = await tool('get_doc', { docId: fixture.docId })
    assert.match(JSON.stringify(current.content), /A-before A-during A-after/)
    assert.match(JSON.stringify(current.content), /B-before B-after/)
    const durable = await command('inspect', fixture.docId)
    assert.equal(durable.evidence, null)
    assert.equal(durable.receipts, 1)
    assert.deepEqual(browserErrors, [])
    for (const page of pages) {
      const state = await inspect(page)
      assert.equal(state.sameView, true); assert.equal(state.sameUndo, true); assert.equal(state.destroys, 0)
      assert.equal(state.editable, true); assert.deepEqual(state.binary, durable.snapshot)
       assert.match(state.text, /before AGENT after/); assert.ok(!state.text.includes('TARGET'))
       assert.ok(!state.sentTypes.includes('doc.snapshot')); assert.ok(!state.sentTypes.includes('doc.evidence.request'))
    }
    // Issue before checkpoint/reconnect, then use the same reference afterwards.
    const reconnectRef = (await tool('search_doc', { docId: fixture.docId, query: 'AGENT' })).matches[0].targetRef
    await command('compact', fixture.docId)
    console.log('Workflow: checkpoint complete; reconnecting')
    const connections = (await inspect(a)).connections
    await a.evaluate(() => (window as any).reconnectTest.reconnect())
    await a.waitForFunction(count => (window as any).reconnectTest.inspect().connections > count
      && document.querySelector('.tiptap[contenteditable="true"]'), {}, connections)
    await append(a, 'writer-a', ' RECONNECTED')
    await b.waitForFunction(() => (window as any).ProseMirror.state.doc.textContent.includes('RECONNECTED'))
    await tool('patch_doc', { docId: fixture.docId, idempotencyKey: crypto.randomUUID(), operations: [
      { type: 'replace_text', targetRef: reconnectRef, text: 'FINAL' },
    ] })
    await Promise.all(pages.map(page => page.waitForFunction(() => (window as any).ProseMirror.state.doc.textContent.includes('FINAL'))))
    const deletedRef = (await tool('search_doc', { docId: fixture.docId, query: 'FINAL' })).matches[0].targetRef
    await a.evaluate(() => {
      const editor = (window as any).ProseMirror
      let original: any, position = -1
      editor.state.doc.descendants((node: any, pos: number) => { if (node.attrs.id === 'target') { original = node; position = pos } })
      editor.view.dispatch(editor.state.tr.delete(position, position + original.nodeSize))
      editor.view.dispatch(editor.state.tr.insert(position, original))
    })
    // Wait for durable replacement, not merely a local identical-looking paragraph.
    await append(a, 'writer-a', ' RECREATED')
    await b.waitForFunction(() => (window as any).ProseMirror.state.doc.textContent.includes('RECREATED'))
    const rejected = await rpc('tools/call', { name: 'patch_doc', arguments: { docId: fixture.docId,
      idempotencyKey: crypto.randomUUID(), operations: [{ type: 'replace_text', targetRef: deletedRef, text: 'RESURRECTED' }] } })
    assert.equal(rejected.isError, true); assert.match(JSON.stringify(rejected), /TARGET_GONE/)
    const final = await command('inspect', fixture.docId)
    for (const page of pages) {
      const state = await inspect(page)
      assert.equal(state.sameView, true); assert.equal(state.sameUndo, true); assert.equal(state.destroys, 0)
      assert.equal(state.editable, true); assert.deepEqual(state.binary, final.snapshot)
      assert.ok(!state.text.includes('RESURRECTED'))
    }
    assert.deepEqual(browserErrors, [])
    console.log(`PASS live workflow ${viewport.width}x${viewport.height}: public MCP, changed target, 110 typing transactions, formatting/undo, checkpoint/reconnect, deleted identity refused, no remount/reload`)
    await Promise.all(contexts.map(context => context.close()))
  }
} finally {
  await browser?.close(); await vite.close()
  backend.stdin.end(`${JSON.stringify({ id: ++commandId, action: 'stop' })}\n`)
  await new Promise<void>(resolve => { if (backend.exitCode !== null) resolve(); else backend.once('exit', () => resolve()) })
  lines.close(); await rm(temp, { recursive: true, force: true })
}
