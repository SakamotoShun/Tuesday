import { useEffect, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useAdminSettings } from "@/hooks/use-admin"

export function WorkspaceSettings() {
  const { settings, isLoading, updateSettings } = useAdminSettings()
  const [workspaceName, setWorkspaceName] = useState(settings?.workspaceName ?? "")
  const [siteUrl, setSiteUrl] = useState(settings?.siteUrl ?? "")
  const [openaiApiKey, setOpenaiApiKey] = useState("")

  useEffect(() => {
    setWorkspaceName(settings?.workspaceName ?? "")
  }, [settings?.workspaceName])

  useEffect(() => {
    setSiteUrl(settings?.siteUrl ?? "")
  }, [settings?.siteUrl])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>
  }

  const hasApiKey = Boolean(settings?.openaiApiKey)

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold">Workspace</div>
        <div className="text-sm text-muted-foreground">Control workspace-level settings.</div>
      </div>
      <div className="space-y-2">
        <Label>Workspace name</Label>
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
          <Button
            onClick={() => updateSettings.mutate({ workspaceName })}
            disabled={updateSettings.isPending}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-url">Site URL</Label>
        <div className="text-sm text-muted-foreground">
          The public URL used to access this instance. Used for generating webhook URLs.
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            id="site-url"
            value={siteUrl}
            onChange={(event) => setSiteUrl(event.target.value)}
            placeholder="https://workhub.example.com"
          />
          <Button
            onClick={() => updateSettings.mutate({ siteUrl: siteUrl.trim().replace(/\/+$/, "") })}
            disabled={updateSettings.isPending}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="openai-api-key">OpenAI API Key</Label>
        <div className="text-sm text-muted-foreground">
          Required for AI bots. Get your API key from platform.openai.com.
          {hasApiKey && (
            <span className="ml-1 font-medium text-foreground">
              Current key: {settings?.openaiApiKey}
            </span>
          )}
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            id="openai-api-key"
            type="password"
            value={openaiApiKey}
            onChange={(event) => setOpenaiApiKey(event.target.value)}
            placeholder={hasApiKey ? "Enter new key to replace" : "sk-..."}
          />
          <Button
            onClick={() => {
              updateSettings.mutate({ openaiApiKey: openaiApiKey.trim() })
              setOpenaiApiKey("")
            }}
            disabled={updateSettings.isPending || !openaiApiKey.trim()}
          >
            Save
          </Button>
          {hasApiKey && (
            <Button
              variant="outline"
              onClick={() => {
                updateSettings.mutate({ openaiApiKey: "" })
                setOpenaiApiKey("")
              }}
              disabled={updateSettings.isPending}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border border-border rounded-lg p-3">
        <Label htmlFor="allow-registration" className="flex flex-col gap-1">
          <span>Allow self-registration</span>
          <span className="font-normal text-sm text-muted-foreground">
            When enabled, anyone can create an account at /register
          </span>
        </Label>
        <Switch
          id="allow-registration"
          checked={settings?.allowRegistration ?? false}
          onCheckedChange={(checked) => updateSettings.mutate({ allowRegistration: checked })}
          disabled={updateSettings.isPending}
        />
      </div>
    </div>
  )
}
