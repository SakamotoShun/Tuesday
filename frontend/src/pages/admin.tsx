import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import * as adminApi from "@/api/admin"

export function AdminPage() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: adminApi.getSettings,
  })

  const updateSettings = useMutation({
    mutationFn: adminApi.updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "settings"], data)
    },
  })

  const handleRegistrationToggle = (checked: boolean) => {
    updateSettings.mutate({ allowRegistration: checked })
  }

  if (error) {
    return (
      <div>
        <h1 className="font-serif text-[32px] font-bold mb-6">Admin Settings</h1>
        <div className="p-6 rounded-lg border border-destructive bg-destructive/10">
          <p className="text-destructive">
            Failed to load settings. Make sure you have admin privileges.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-serif text-[32px] font-bold mb-6">Admin Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
            <CardDescription>
              Control whether new users can create accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <Label htmlFor="allow-registration" className="flex flex-col gap-1">
                  <span>Allow self-registration</span>
                  <span className="font-normal text-sm text-muted-foreground">
                    When enabled, anyone can create an account at /register
                  </span>
                </Label>
                <Switch
                  id="allow-registration"
                  checked={settings?.allowRegistration ?? false}
                  onCheckedChange={handleRegistrationToggle}
                  disabled={updateSettings.isPending}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {settings?.workspaceName && (
          <Card>
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                General workspace information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label className="flex flex-col gap-1">
                  <span>Workspace name</span>
                  <span className="font-normal text-sm text-muted-foreground">
                    {settings.workspaceName}
                  </span>
                </Label>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
