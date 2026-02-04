import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { chatApi } from "@/api/chat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          New Channel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Channel name"
          />
          <Button
            onClick={() => createChannel.mutate()}
            disabled={createChannel.isPending || !name.trim()}
          >
            {createChannel.isPending ? "Creating..." : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
