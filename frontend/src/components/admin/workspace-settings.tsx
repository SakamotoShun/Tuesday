import { useEffect, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useAdminSettings } from "@/hooks/use-admin"

export function WorkspaceSettings() {
  const { settings, isLoading, updateSettings } = useAdminSettings()
  const [workspaceName, setWorkspaceName] = useState(settings?.workspaceName ?? "")

  useEffect(() => {
    setWorkspaceName(settings?.workspaceName ?? "")
  }, [settings?.workspaceName])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>
  }

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
