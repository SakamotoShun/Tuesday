import { useState } from "react"
import { ApiErrorResponse } from "@/api/client"
import type { NotificationEmailType } from "@/api/types"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useNotificationEmailPreferences } from "@/hooks/use-notification-email-preferences"

const labels: Record<NotificationEmailType, { title: string; description: string }> = {
  mention: { title: "Mentions", description: "When someone mentions you in chat." },
  task_assignment: { title: "Task assignments", description: "When a task is assigned to you." },
  notice_assignment: { title: "Notice assignments", description: "When a notice-board item is assigned to you." },
  meeting_invite: { title: "Meeting invitations", description: "When you are invited to a meeting." },
  project_invite: { title: "Project invitations", description: "When you are added directly to a project." },
}

export function NotificationEmailPreferences() {
  const { data, isLoading, error, updatePreference } = useNotificationEmailPreferences()
  const [message, setMessage] = useState<string | null>(null)

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading email preferences...</div>
  if (error || !data) return <div className="text-sm text-destructive">Email preferences are unavailable.</div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Email is sent to your current account address only when workspace delivery is also enabled.
      </p>
      {data.types.map((type) => (
        <div key={type} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <Label htmlFor={`email-${type}`} className="flex flex-col gap-1">
            <span>{labels[type].title}</span>
            <span className="font-normal text-sm text-muted-foreground">{labels[type].description}</span>
          </Label>
          <Switch
            id={`email-${type}`}
            checked={data.preferences[type]}
            disabled={updatePreference.isPending}
            onCheckedChange={(enabled) => {
              setMessage(null)
              updatePreference.mutate({ [type]: enabled }, {
                onSuccess: () => setMessage("Email preference saved."),
                onError: (mutationError) => setMessage(
                  mutationError instanceof ApiErrorResponse ? mutationError.message : "Failed to save email preference.",
                ),
              })
            }}
          />
        </div>
      ))}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
