import { useEffect, useState } from "react"
import { AlertTriangle, Bot, Copy, RefreshCcw, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ApiErrorResponse } from "@/api/client"
import { useAdminBotChannels, useAdminBots, useAdminSettings } from "@/hooks/use-admin"
import type { Bot as BotType, BotChannelMember, Channel } from "@/api/types"

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

const formatChannelLabel = (channel: Channel) => {
  if (channel.type === "workspace") {
    return `#${channel.name} (Workspace)`
  }
  if (channel.project?.name) {
    return `#${channel.name} (${channel.project.name})`
  }
  return `#${channel.name}`
}

const buildWebhookUrl = (baseUrl: string, bot: BotType, channelId: string) => {
  if (!baseUrl) return ""
  const normalized = baseUrl.replace(/\/+$/, "")
  return `${normalized}/api/v1/webhooks/${bot.id}/${bot.webhookToken}/channels/${channelId}`
}

export function BotManagement() {
  const {
    bots,
    availableChannels,
    isLoading,
    createBot,
    updateBot,
    deleteBot,
    regenerateToken,
    addBotToChannel,
    removeBotFromChannel,
  } = useAdminBots()

  const { settings } = useAdminSettings()

  const [createOpen, setCreateOpen] = useState(false)
  const [createdBot, setCreatedBot] = useState<BotType | null>(null)
  const [newName, setNewName] = useState("")
  const [newAvatarUrl, setNewAvatarUrl] = useState("")

  const [manageOpen, setManageOpen] = useState(false)
  const [selectedBot, setSelectedBot] = useState<BotType | null>(null)
  const [editName, setEditName] = useState("")
  const [editAvatarUrl, setEditAvatarUrl] = useState("")
  const [editDisabled, setEditDisabled] = useState(false)
  const [channelToAdd, setChannelToAdd] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BotType | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const botChannelsQuery = useAdminBotChannels(selectedBot?.id, manageOpen)
  const botChannels = botChannelsQuery.data ?? []

  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : ""
  const baseUrl = (settings?.siteUrl?.trim() || fallbackOrigin).replace(/\/+$/, "")
  const hasSiteUrl = Boolean(settings?.siteUrl?.trim())

  useEffect(() => {
    if (selectedBot) {
      setEditName(selectedBot.name)
      setEditAvatarUrl(selectedBot.avatarUrl ?? "")
      setEditDisabled(selectedBot.isDisabled)
      setChannelToAdd(null)
    }
  }, [selectedBot])

  useEffect(() => {
    if (selectedBot && !bots.some((bot) => bot.id === selectedBot.id)) {
      setManageOpen(false)
      setSelectedBot(null)
    }
  }, [bots, selectedBot])

  const handleCopy = async (value: string) => {
    if (!value) return
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    }
  }

  const handleCreateBot = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!newName.trim()) return
    const bot = await createBot.mutateAsync({
      name: newName.trim(),
      avatarUrl: newAvatarUrl.trim() ? newAvatarUrl.trim() : null,
    })
    setCreatedBot(bot)
  }

  const handleSaveBot = async () => {
    if (!selectedBot) return
    const updated = await updateBot.mutateAsync({
      botId: selectedBot.id,
      data: {
        name: editName.trim(),
        avatarUrl: editAvatarUrl.trim() ? editAvatarUrl.trim() : null,
        isDisabled: editDisabled,
      },
    })
    setSelectedBot(updated)
  }

  const handleRegenerateToken = async () => {
    if (!selectedBot) return
    const updated = await regenerateToken.mutateAsync(selectedBot.id)
    setSelectedBot(updated)
  }

  const handleAddChannel = async () => {
    if (!selectedBot || !channelToAdd) return
    await addBotToChannel.mutateAsync({ botId: selectedBot.id, channelId: channelToAdd })
    setChannelToAdd(null)
  }

  const handleRemoveChannel = async (channelId: string) => {
    if (!selectedBot) return
    await removeBotFromChannel.mutateAsync({ botId: selectedBot.id, channelId })
  }

  const openDeleteDialog = (bot: BotType) => {
    setDeleteTarget(bot)
    setDeleteError(null)
    setDeleteOpen(true)
  }

  const handleDeleteBot = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteBot.mutateAsync(deleteTarget.id)
      if (selectedBot?.id === deleteTarget.id) {
        setManageOpen(false)
        setSelectedBot(null)
      }
      setDeleteOpen(false)
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setDeleteError(err.message)
      } else if (err instanceof Error) {
        setDeleteError(err.message)
      } else {
        setDeleteError("Failed to delete bot")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const availableForBot = availableChannels.filter(
    (channel) => !botChannels.some((member) => member.channelId === channel.id)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Bots</div>
          <div className="text-sm text-muted-foreground">Create webhook bots and add them to channels.</div>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next)
            if (!next) {
              setNewName("")
              setNewAvatarUrl("")
              setCreatedBot(null)
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Bot className="mr-2 h-4 w-4" />
              Create Bot
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Create Bot</DialogTitle>
              <DialogDescription>Generate a webhook bot to post messages from external services.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateBot} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bot-name">Name</Label>
                <Input id="bot-name" value={newName} onChange={(event) => setNewName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bot-avatar">Avatar URL (optional)</Label>
                <Input
                  id="bot-avatar"
                  value={newAvatarUrl}
                  onChange={(event) => setNewAvatarUrl(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              {createdBot && baseUrl && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="text-sm font-medium">Webhook URL template</div>
                  <div className="text-xs text-muted-foreground">
                    Add the bot to a channel, then replace <code>{"{channelId}"}</code> with the channel ID.
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={buildWebhookUrl(baseUrl, createdBot, "{channelId}")}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        handleCopy(buildWebhookUrl(baseUrl, createdBot, "{channelId}"))
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Close
                </Button>
                <Button type="submit" disabled={createBot.isPending || !newName.trim()}>
                  {createBot.isPending ? "Creating..." : "Create Bot"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!hasSiteUrl && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Site URL is not configured. Webhook URLs will use the current browser origin and may be wrong behind a reverse
          proxy. Set it in Workspace settings.
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading bots...</div>
      ) : bots.length === 0 ? (
        <div className="text-sm text-muted-foreground">No bots yet.</div>
      ) : (
        <div className="space-y-2">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="flex flex-col gap-3 border border-border rounded-lg p-3 bg-background"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={bot.avatarUrl ?? undefined} alt={bot.name} />
                    <AvatarFallback className="text-xs bg-muted">{getInitials(bot.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {bot.name}
                      <Badge variant="secondary" className="text-[10px] px-2 py-0">BOT</Badge>
                      {bot.isDisabled && <Badge variant="outline">Disabled</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">Created {new Date(bot.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedBot(bot)
                      setManageOpen(true)
                    }}
                  >
                    Manage
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => openDeleteDialog(bot)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={manageOpen}
        onOpenChange={(next) => {
          setManageOpen(next)
          if (!next) {
            setSelectedBot(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Bot</DialogTitle>
            <DialogDescription>Update bot settings, regenerate the token, and manage channel access.</DialogDescription>
          </DialogHeader>
          {selectedBot && (
            <div className="space-y-6 py-4">
              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="text-sm font-medium">Identity</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-bot-name">Name</Label>
                    <Input
                      id="edit-bot-name"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-bot-avatar">Avatar URL</Label>
                    <Input
                      id="edit-bot-avatar"
                      value={editAvatarUrl}
                      onChange={(event) => setEditAvatarUrl(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label htmlFor="bot-disabled" className="flex flex-col gap-1">
                    <span>Disabled</span>
                    <span className="font-normal text-sm text-muted-foreground">Stop this bot from accepting webhooks.</span>
                  </Label>
                  <Switch id="bot-disabled" checked={editDisabled} onCheckedChange={setEditDisabled} />
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleSaveBot} disabled={updateBot.isPending}>
                    {updateBot.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="text-sm font-medium">Webhook</div>
                {baseUrl ? (
                  <div className="space-y-2">
                    <Label>Webhook URL template</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={buildWebhookUrl(baseUrl, selectedBot, "{channelId}")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(buildWebhookUrl(baseUrl, selectedBot, "{channelId}"))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Set the Site URL in Workspace settings to generate webhook URLs.
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleRegenerateToken}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Regenerate Token
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="text-sm font-medium">Channel Access</div>
                <div className="flex flex-col md:flex-row gap-2">
                  <Select value={channelToAdd ?? ""} onValueChange={(value) => setChannelToAdd(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableForBot.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {formatChannelLabel(channel)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={handleAddChannel}
                    disabled={!channelToAdd || addBotToChannel.isPending}
                  >
                    Add to Channel
                  </Button>
                </div>

                {botChannelsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading channels...</div>
                ) : botChannels.length === 0 ? (
                  <div className="text-sm text-muted-foreground">This bot is not added to any channels yet.</div>
                ) : (
                  <div className="space-y-2">
                    {botChannels.map((member: BotChannelMember) => {
                      if (!member.channel) return null
                      const memberUrl = buildWebhookUrl(baseUrl, selectedBot, member.channelId)
                      return (
                        <div
                          key={member.channelId}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border rounded-lg p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{formatChannelLabel(member.channel)}</div>
                            {memberUrl && (
                              <div className="text-xs text-muted-foreground break-all">
                                {memberUrl}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopy(memberUrl)}
                              disabled={!memberUrl}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy URL
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRemoveChannel(member.channelId)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManageOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next)
          if (!next) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Bot
            </DialogTitle>
            <DialogDescription>
              This permanently deletes the bot, invalidates its webhook URL, and removes its identity from historical messages.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {deleteTarget && (
              <div className="text-sm">
                You are about to delete <span className="font-semibold">{deleteTarget.name}</span>.
              </div>
            )}
            {deleteError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {deleteError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBot} disabled={isDeleting || !deleteTarget}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
