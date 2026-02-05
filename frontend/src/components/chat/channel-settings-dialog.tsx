import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import type { Channel } from "@/api/types"
import { ApiErrorResponse } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface ChannelSettingsDialogProps {
  channel: Channel | null
  canManage: boolean
  onUpdate: (input: { name?: string; description?: string | null }) => Promise<unknown>
  onArchive: () => Promise<unknown>
}

export function ChannelSettingsDialog({ channel, canManage, onUpdate, onArchive }: ChannelSettingsDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!open || !channel) return
    setName(channel.name)
    setDescription(channel.description ?? "")
    setConfirmArchive(false)
    setError(null)
  }, [channel, open])

  if (!channel || !canManage) return null

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!channel) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Channel name is required")
      return
    }

    const nextDescription = description.trim()
    const payload: { name?: string; description?: string | null } = {}
    if (trimmedName !== channel.name) payload.name = trimmedName
    if (nextDescription !== (channel.description ?? "")) {
      payload.description = nextDescription.length > 0 ? nextDescription : null
    }

    if (Object.keys(payload).length === 0) {
      setOpen(false)
      return
    }

    try {
      setIsSaving(true)
      setError(null)
      await onUpdate(payload)
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update channel")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleArchive = async () => {
    try {
      setIsSaving(true)
      setError(null)
      await onArchive()
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to archive channel")
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Channel settings</DialogTitle>
          <DialogDescription>Update channel details or archive it when the work is done.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Channel name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="channel-description">Description</Label>
            <Textarea
              id="channel-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a short topic or purpose"
              className="min-h-[88px]"
            />
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>

        <div className="border-t border-border pt-4 space-y-3">
          <div className="text-sm font-semibold">Archive channel</div>
          <div className="text-xs text-muted-foreground">
            Archiving hides the channel from the list and blocks new messages.
          </div>
          {confirmArchive ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <div className="text-sm text-destructive">Are you sure you want to archive this channel?</div>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmArchive(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={handleArchive} disabled={isSaving}>
                  {isSaving ? "Archiving..." : "Archive"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirmArchive(true)} disabled={isSaving}>
              Archive Channel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
