import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import puppeteer from 'puppeteer-core'
import { BlockNoteEditor } from '@blocknote/core'
import { blocksToYDoc } from '@blocknote/core/yjs'
import * as Y from 'yjs'
import type { ServerWebSocket } from 'bun'
import { blockNoteSchema } from '../src/components/docs/block-note-schema'

// Run: bun run e2e/doc-reconnect.ts (requires local Chromium).
// Tests the real frontend against a controlled relay; backend authorization,
// adapter identity and database persistence have separate regression suites.
const frontend = fileURLToPath(new URL('../', import.meta.url))
await mkdir('/tmp/opencode', { recursive: true })
const temp = await mkdtemp('/tmp/opencode/doc-reconnect-')
const editor = BlockNoteEditor.create({ schema: blockNoteSchema })
const durable = blocksToYDoc(editor, [
  { id: 'paragraph', type: 'paragraph', content: 'Start' },
  { id: 'link', type: 'paragraph', content: [{ type: 'link', href: '#outside', content: 'Readable link' }] },
  { id: 'table', type: 'table', content: { type: 'tableContent', rows: [
    { cells: ['Cell A', 'Cell B'] }, { cells: ['Cell C', 'Cell D'] },
  ] } },
], 'prosemirror')
const clients = new Set<ServerWebSocket<undefined>>()
const errors: string[] = []
let seq = 0
const generation = crypto.randomUUID()
const receipts = new Map<string, { update: string; seq: number }>()
let holdAcks = false
let deferredAcks: Array<() => void> = []
let snapshots = 0
let connections = 0
let holdSync = false
let dropUpdates = false
let droppedUpdates = 0
let staleSnapshots = 0
let raceSnapshot = false
const sync = (ws: ServerWebSocket<undefined>) => ws.send(JSON.stringify({
  type: 'doc.sync', generation, acknowledgement: 'operation_id', snapshot: Buffer.from(Y.encodeStateAsUpdate(durable)).toString('base64'), updates: [], latestSeq: seq,
}))
function remoteInsert(text: string, deliver = true) {
  const findText = (node: Y.XmlFragment): Y.XmlText | undefined => {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText) return child
      if (child instanceof Y.XmlElement) {
        const found = findText(child)
        if (found) return found
      }
    }
  }
  const before = Y.encodeStateVector(durable)
  findText(durable.getXmlFragment('prosemirror'))!.insert(0, text)
  const update = Buffer.from(Y.encodeStateAsUpdate(durable, before)).toString('base64')
  seq += 1
  const broadcast = () => { for (const client of clients) client.send(JSON.stringify({ type: 'doc.update', update, seq, generation })) }
  if (deliver) broadcast()
  return broadcast
}
const relay = Bun.serve<undefined>({
  hostname: '127.0.0.1', port: 0,
  fetch(req, server) {
    if (server.upgrade(req, { data: undefined })) return
    return new Response('Expected WebSocket', { status: 400 })
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      connections += 1
      if (!holdSync) sync(ws)
    },
    message(ws, raw) {
      const message = JSON.parse(String(raw))
      if (message.type === 'doc.update') {
        if (dropUpdates) { droppedUpdates += 1; return }
        assert.equal(message.generation, generation)
        assert.equal(typeof message.operationId, 'string')
        let receipt = receipts.get(message.operationId)
        if (receipt) assert.equal(receipt.update, message.update)
        else {
          Y.applyUpdate(durable, Buffer.from(message.update, 'base64'))
          receipt = { update: message.update, seq: ++seq }
          receipts.set(message.operationId, receipt)
        }
        const acknowledgedSeq = receipt.seq
        const ack = () => ws.send(JSON.stringify({ type: 'doc.ack', seq: acknowledgedSeq, generation, operationId: message.operationId }))
        if (holdAcks) deferredAcks.push(ack)
        else ack()
      }
      if (message.type === 'doc.snapshot') {
        if (raceSnapshot) { raceSnapshot = false; remoteInsert('race ') }
        // Match the production route: an older checkpoint is nonfatal.
        if (message.seq < seq) { staleSnapshots += 1; return }
        snapshots += 1
        const candidate = new Y.Doc()
        try {
          Y.applyUpdate(candidate, Buffer.from(message.snapshot, 'base64'))
          if (message.seq !== seq || !Buffer.from(Y.encodeStateAsUpdate(candidate)).equals(Y.encodeStateAsUpdate(durable))) {
            errors.push('Snapshot did not match its acknowledged durable state')
          }
        } finally { candidate.destroy() }
      }
    },
    close(ws) { clients.delete(ws) },
  },
})
// Vite's default-port retry can stall under Bun when another local runner owns
// 5173. Select an OS-assigned port and fail explicitly if it is taken meanwhile.
const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
const vitePort = portProbe.port!
portProbe.stop(true)
const vite = await createServer({
  configFile: false, root: frontend, cacheDir: join(temp, 'vite'), plugins: [react({ exclude: /node_modules|\/vite\/deps\// })],
  resolve: { alias: { '@': join(frontend, 'src') } },
  server: { host: '127.0.0.1', port: vitePort, strictPort: true },
})
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
async function until(predicate: () => boolean, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    assert(Date.now() < deadline, 'Timed out waiting for relay state')
    await Bun.sleep(10)
  }
}
try {
  await vite.listen()
  console.log('Reconnect regression: local Vite ready')
  browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
    userDataDir: join(temp, 'chromium'), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  console.log('Reconnect regression: Chromium ready')
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${vite.resolvedUrls!.local[0]}e2e/doc-reconnect.html?relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`)
  await page.waitForSelector('.tiptap[contenteditable="true"]', { timeout: 60_000 })
  console.log('Reconnect regression: production editor mounted')
  await page.evaluate(() => (window as any).reconnectTest.remember())
  await page.click('[data-id="paragraph"] .bn-inline-content')
  await page.keyboard.press('End')
  await page.keyboard.type(' before')
  await until(() => seq > 0)
  await page.evaluate(() => (window as any).reconnectTest.stopCapturing())

  // Force blur/debounce while ACKs are withheld. Neither may snapshot ahead.
  holdAcks = true
  await page.keyboard.type(' pending')
  await until(() => deferredAcks.length > 0)
  const beforeSnapshots = snapshots
  await page.click('#outside')
  await page.evaluate(() => (window as any).reconnectTest.rerender())
  await Bun.sleep(850)
  assert.equal(snapshots, beforeSnapshots, 'Snapshot escaped before ACKs')
  holdAcks = false
  deferredAcks.forEach(ack => ack())
  deferredAcks = []
  await until(() => snapshots > beforeSnapshots)

  // A pending debounce must survive an unrelated parent render.
  await page.click('[data-id="paragraph"] .bn-inline-content')
  await page.keyboard.press('End')
  await page.keyboard.type(' timer')
  const timerSnapshots = snapshots
  await page.evaluate(() => (window as any).reconnectTest.rerender())
  await until(() => snapshots > timerSnapshots)

  const inspect = () => page.evaluate(() => (window as any).reconnectTest.inspect())
  const separate = () => page.evaluate(() => (window as any).reconnectTest.stopCapturing())
  const shortcut = async (redo = false) => {
    await page.keyboard.down('Control')
    if (redo) await page.keyboard.down('Shift')
    await page.keyboard.press('z')
    if (redo) await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
  }
  const disconnect = async () => {
    holdSync = true
    for (const client of clients) client.close(1012, 'Regression reconnect')
    await page.waitForFunction(() => document.body.textContent?.includes('Reconnecting...'))
    assert.equal((await inspect()).editable, false)
  }
  const recover = async () => {
    await until(() => clients.size > 0)
    holdSync = false
    for (const client of clients) sync(client)
    await page.waitForSelector('.tiptap[contenteditable="true"]')
    const identity = await inspect()
    assert.equal(identity.sameView, true)
    assert.equal(identity.sameUndo, true)
    assert.equal(identity.destroys, 0)
  }
  const converge = async () => {
    await page.waitForFunction(binary => JSON.stringify((window as any).reconnectTest.inspect().binary) === binary,
      {}, JSON.stringify(Array.from(Y.encodeStateAsUpdate(durable))))
  }
  const openTableMenu = async (cell = 'td') => {
    await page.hover(cell)
    await page.waitForSelector('.bn-table-handle:not([style*="rotate"])', { visible: true })
    await page.click('.bn-table-handle:not([style*="rotate"])')
    await page.waitForSelector('[role="menuitem"]', { visible: true })
  }

  // Pre-disconnect history and a mid-paragraph caret must survive without a click.
  await separate()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  const original = (await inspect()).text
  await page.keyboard.type('X')
  const inserted = await inspect()
  await disconnect()
  await recover()
  assert.equal((await inspect()).focused, true)
  assert.deepEqual((await inspect()).selection, inserted.selection)
  await shortcut()
  assert.equal((await inspect()).text, original, 'Pre-disconnect insertion undo failed')
  assert((await inspect()).redoSize > 0)
  await disconnect()
  await recover()
  await shortcut(true)
  assert.equal((await inspect()).text, inserted.text, 'Pre-disconnect redo stack was lost')
  await separate()
  await page.keyboard.press('Backspace')
  assert.equal((await inspect()).text, original)
  await disconnect()
  await recover()
  await shortcut()
  assert.equal((await inspect()).text, inserted.text, 'Pre-disconnect deletion undo failed')
  await separate()
  const caret = (await inspect()).selection.from
  await disconnect()
  await recover()
  await page.keyboard.type('Z')
  assert.equal((await inspect()).selection.from, caret + 1, 'Typing did not resume at the saved caret')
  assert.notEqual((await inspect()).text, inserted.text)
  console.log('PASS: mounted view, focused caret, pre-disconnect insertion/deletion undo and redo stack')

  // A deliberate move to another control must win over reconnect restoration.
  await disconnect()
  await page.click('#outside')
  await recover()
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'outside')
  assert.equal((await inspect()).focused, false)

  // Dismiss a genuinely open portaled table menu, then prove it works after recovery.
  await openTableMenu()
  const tableBefore = (await inspect()).document
  await disconnect()
  assert.equal(await page.$('[role="menuitem"]'), null)
  await page.keyboard.press('Enter')
  assert.deepEqual((await inspect()).document, tableBefore)
  await recover()
  await openTableMenu('tr:nth-child(2) td')
  await separate()
  const items = await page.$$('[role="menuitem"]')
  let deletedRow = false
  for (const item of items) {
    if ((await item.evaluate(element => element.textContent))?.includes('Delete row')) {
      await item.click()
      deletedRow = true
      break
    }
  }
  assert(deletedRow, 'Missing Delete row command')
  assert((await inspect()).text.includes('Cell A'), 'Recovered handle targeted the previously frozen row')
  assert(!(await inspect()).text.includes('Cell C'), 'Recovered row menu did not delete the newly hovered row')
  await shortcut()
  assert.deepEqual((await inspect()).document, tableBefore)
  console.log('PASS: open table menu dismissed during recovery; outside focus respected')

  // Model both an update never admitted by the server and a durable update whose
  // ACK was lost. Merge a remote edit on recovery, then replay before snapshots.
  for (const lostAck of [false, true]) {
    await page.click('[data-id="paragraph"] .bn-inline-content')
    await page.keyboard.press('End')
    await separate()
    holdAcks = true
    dropUpdates = !lostAck
    const oldDropped = droppedUpdates
    await page.keyboard.type(lostAck ? ' ack-lost' : ' undelivered')
    await until(() => lostAck ? deferredAcks.length > 0 : droppedUpdates > oldDropped)
    await disconnect()
    deferredAcks = [] // ACKs belong to the closed transport, never the new one.
    dropUpdates = false
    remoteInsert(lostAck ? 'remote-B ' : 'remote-A ', false)
    const replaySnapshots = snapshots
    await recover()
    await until(() => deferredAcks.length > 0)
    for (const client of clients) client.send(JSON.stringify({ type: 'doc.snapshot.request', seq }))
    await Bun.sleep(850)
    assert.equal(snapshots, replaySnapshots, 'Snapshot escaped while replay ACKs were outstanding')
    holdAcks = false
    deferredAcks.forEach(ack => ack())
    deferredAcks = []
    await until(() => snapshots > replaySnapshots)
    await converge()
    const text = (await inspect()).text
    assert.equal(text.split(lostAck ? ' ack-lost' : ' undelivered').length, 2, 'Replay lost or duplicated visible text')
    assert(text.includes(lostAck ? 'remote-B ' : 'remote-A '))
  }
  console.log('PASS: unadmitted and ACK-lost replay merge remote edits before checkpointing')

  // A request for unseen content must wait for its corresponding remote update.
  const deliver = remoteInsert('requested ', false)
  const requestedSnapshots = snapshots
  for (const client of clients) client.send(JSON.stringify({ type: 'doc.snapshot.request', seq }))
  await Bun.sleep(100)
  assert.equal(snapshots, requestedSnapshots)
  deliver()
  await until(() => snapshots > requestedSnapshots)
  await converge()
  // Server receives a valid-but-now-stale candidate: continued editing must work.
  raceSnapshot = true
  for (const client of clients) client.send(JSON.stringify({ type: 'doc.snapshot.request', seq }))
  await until(() => staleSnapshots === 1)
  await converge()
  await page.click('[data-id="paragraph"] .bn-inline-content')
  await page.keyboard.press('End')
  await page.keyboard.type(' still-editing')
  await until(() => snapshots > requestedSnapshots + 1)
  await converge()
  assert.equal(await page.$('[role="alert"]'), null)

  // Lose the application ACK while the socket stays open. The hook must recover
  // autonomously even while newer edits receive ACKs on that same connection.
  holdAcks = true
  const timeoutStarted = performance.now()
  await page.keyboard.type(' timeout-replay')
  await until(() => deferredAcks.length > 0)
  const timeoutSeq = seq
  const timeoutConnections = connections
  deferredAcks = []
  holdAcks = false
  for (let i = 0; i < 4; i++) {
    await Bun.sleep(2000)
    await page.keyboard.type('.')
    await until(() => seq === timeoutSeq + i + 1)
  }
  await until(() => connections > timeoutConnections, Math.max(1, 15_000 - (performance.now() - timeoutStarted)))
  await page.waitForSelector('.tiptap[contenteditable="true"]')
  assert.equal(seq, timeoutSeq + 4, 'Lost-ACK recovery appended the same operations twice')
  await converge()
  assert.equal((await inspect()).sameView, true)
  assert.equal((await inspect()).sameUndo, true)
  assert.equal((await inspect()).destroys, 0)
  console.log('PASS: oldest lost ACK recovers despite newer ACKs, without another durable append')

  const reader = await browser.newPage()
  await reader.goto(`${page.url()}&readonly`)
  await reader.waitForSelector('.tiptap[contenteditable="false"]')
  await reader.waitForFunction(() => document.body.textContent?.includes('Readable link'))
  const readOnlyBefore = await reader.evaluate(() => (window as any).reconnectTest.inspect().document)
  await reader.evaluate(() => {
    const text = document.querySelector('[data-id="paragraph"] .bn-inline-content')!
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  })
  const selected = await reader.evaluate(() => window.getSelection()!.toString())
  assert(selected.includes('timeout-replay'), `Read-only text could not be selected: ${JSON.stringify(selected)}`)
  await browser.defaultBrowserContext().overridePermissions(new URL(page.url()).origin, ['clipboard-read', 'clipboard-write'])
  await reader.keyboard.down('Control')
  await reader.keyboard.press('c')
  await reader.keyboard.up('Control')
  assert.equal(await reader.evaluate(() => navigator.clipboard.readText()), selected)
  const accessibility = await reader.createCDPSession()
  const tree = await accessibility.send('Accessibility.getFullAXTree')
  assert(tree.nodes.some(node => !node.ignored && node.name?.value === 'Readable link'), 'Read-only content missing from accessibility tree')
  await reader.evaluate(() => {
    const link = document.querySelector('[data-id="link"] a') as HTMLAnchorElement
    link.addEventListener('click', event => { event.preventDefault(); link.dataset.clicked = 'true' })
    link.focus()
  })
  assert.equal(await reader.evaluate(() => document.activeElement?.textContent), 'Readable link')
  await reader.click('[data-id="link"] a')
  assert.equal(await reader.$eval('[data-id="link"] a', element => (element as HTMLElement).dataset.clicked), 'true')
  await reader.click('[data-id="paragraph"] .bn-inline-content')
  await reader.keyboard.type('must-not-edit')
  assert.deepEqual(await reader.evaluate(() => (window as any).reconnectTest.inspect().document), readOnlyBefore)
  await reader.close()
  await page.bringToFront()
  console.log('PASS: read-only selection, clipboard copy, links and accessibility without mutation')

  // Fatal errors also remove already-open portal commands without losing the view.
  dropUpdates = true
  await page.click('[data-id="paragraph"] .bn-inline-content')
  await page.keyboard.press('End')
  const beforeDropped = droppedUpdates
  await page.keyboard.type(' recover-this-local-edit')
  await until(() => droppedUpdates > beforeDropped)
  await openTableMenu()
  const fatalBefore = await inspect()
  for (const client of clients) client.send(JSON.stringify({ type: 'doc.sync', generation: crypto.randomUUID(), acknowledgement: 'operation_id',
    snapshot: Buffer.from(Y.encodeStateAsUpdate(durable)).toString('base64'), updates: [], latestSeq: seq }))
  await page.waitForSelector('[role="alert"]')
  assert.equal(await page.$('[role="menuitem"]'), null)
  assert.equal((await inspect()).editable, false)
  await page.keyboard.press('Enter')
  await page.keyboard.type('must-not-edit')
  assert.deepEqual((await inspect()).document, fatalBefore.document)
  assert.equal((await inspect()).sameView, true)
  assert.equal((await inspect()).destroys, 0)
  const reloadDisabled = () => page.evaluate(() => (Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Reload page')!).disabled)
  assert.equal(await reloadDisabled(), true)
  const downloadPath = join(temp, 'downloads')
  await mkdir(downloadPath)
  const session = await page.createCDPSession()
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath })
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Download recovery copy')!.click())
  const filename = 'tuesday-doc-reconnect-regression-recovery.json'
  let saved = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await readdir(downloadPath)).includes(filename)) { saved = true; break }
    await Bun.sleep(50)
  }
  assert(saved, 'Recovery download did not complete')
  const recovery = JSON.parse(await readFile(join(downloadPath, filename), 'utf8'))
  assert.equal(recovery.generation, generation)
  assert(recovery.pendingUpdates.length > 0)
  assert(JSON.stringify(recovery.blocks).includes('recover-this-local-edit'))
  const restored = new Y.Doc()
  Y.applyUpdate(restored, Buffer.from(recovery.snapshot, 'base64'))
  assert.deepEqual(Array.from(Y.encodeStateAsUpdate(restored)), fatalBefore.binary)
  restored.destroy()
  assert.equal(await reloadDisabled(), false)
  assert(!durable.getXmlFragment('prosemirror').toString().includes('recover-this-local-edit'))
  assert.deepEqual(errors, [])
  console.log(`PASS: changed-generation recovery download, fatal portal lock, requested-sequence snapshots, stale snapshot recovery; ${connections} connections, ${snapshots} valid snapshots`)
} finally {
  await browser?.close()
  await vite.close()
  relay.stop(true)
  durable.destroy()
  await rm(temp, { recursive: true, force: true })
}
