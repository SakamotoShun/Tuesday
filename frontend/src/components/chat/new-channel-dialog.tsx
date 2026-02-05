import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { chatApi } from "@/api/chat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"

interface NewChannelDialogProps {
  projectId?: string
  onCreated?: (channelId: string) => void
}

export function NewChannelDialog({ projectId, onCreated }: NewChannelDialogProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")

  const createChannel = useMutation({
    mutationFn: () =>
      chatApi.createChannel({
        name,
        projectId: projectId ?? null,
        type: projectId ? "project" : "workspace",
      }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["channels"] })
      setName("")
      setOpen(false)
      onCreated?.(channel.id)
    },
  })

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createChannel.isPending || !name.trim()) return
    createChannel.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          New Channel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
          <DialogDescription>
            Set up a new channel to organize conversations.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Channel name"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createChannel.isPending || !name.trim()}>
              {createChannel.isPending ? "Creating..." : "Create Channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
