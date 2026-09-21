import { useEffect, useRef, useState } from "react"
import { Download, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { downloadExport, exportFilename, type DocumentSnapshot } from "@/lib/doc-export"

interface DocExportMenuProps {
  ready: boolean
  getSnapshot: () => DocumentSnapshot | null
}

export function DocExportMenu({ ready, getSnapshot }: DocExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const mounted = useRef(true)
  const [notice, setNotice] = useState<{ error: boolean; messages: string[] } | null>(null)
  const [status, setStatus] = useState("")
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const handleExport = async (format: "md" | "pdf") => {
    if (!ready || running.current) return
    running.current = true
    setBusy(true)
    setOpen(false)
    setNotice(null)
    setStatus(`Preparing ${format === "pdf" ? "PDF" : "Markdown"} export`)
    try {
      // Capture before loading libraries or images so one download is one coherent version.
      const snapshot = getSnapshot()
      if (!snapshot) throw new Error("The document is still loading. Try again when it is ready.")
      const baseUrl = window.location.href
      let blob: Blob
      let warnings: string[] = []
      if (format === "md") {
        const { documentToMarkdown } = await import("@/lib/doc-export-markdown")
        blob = new Blob([documentToMarkdown(snapshot, baseUrl)], { type: "text/markdown;charset=utf-8" })
      } else {
        const { documentToPdf } = await import("@/lib/doc-export-pdf")
        ;({ blob, warnings } = await documentToPdf(snapshot, baseUrl))
      }
      if (!mounted.current) return
      downloadExport(blob, exportFilename(snapshot.title, format))
      setStatus("Export download started")
      if (warnings.length) setNotice({ error: false, messages: warnings })
    } catch (error) {
      if (mounted.current) {
        setStatus("Export failed")
        setNotice({ error: true, messages: [error instanceof Error ? error.message : "The document could not be exported. Please try again."] })
      }
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={!ready || busy} title={!ready ? "Waiting for document content" : undefined} aria-label={busy ? "Exporting document" : "Export document"}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {busy ? "Exporting..." : "Export"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2" aria-label="Export document">
          <Button variant="ghost" className="w-full justify-start" disabled={busy || !ready} onClick={() => void handleExport("pdf")}>Download PDF (.pdf)</Button>
          <Button variant="ghost" className="w-full justify-start" disabled={busy || !ready} onClick={() => void handleExport("md")}>Download Markdown (.md)</Button>
          <p className="px-3 py-2 text-xs text-muted-foreground">Markdown uses HTML for rich formatting and merged tables. Appearance depends on your Markdown viewer.</p>
        </PopoverContent>
      </Popover>
      <span className="sr-only" role="status">{status}</span>
      <Dialog open={notice !== null} onOpenChange={(value) => { if (!value) setNotice(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{notice?.error ? "Export failed" : "Export completed with notes"}</DialogTitle>
            <DialogDescription>{notice?.error ? "No download was created. You can try exporting again." : "The download has started. Review these formatting limitations."}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm" role={notice?.error ? "alert" : undefined}>
            {notice?.messages.map((message) => <li key={message}>{message}</li>)}
          </ul>
          <DialogFooter><Button onClick={() => setNotice(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
