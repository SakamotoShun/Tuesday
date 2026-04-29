import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AccountInfo } from "@/components/profile/account-info"
import { ProfileForm } from "@/components/profile/profile-form"
import { ChangeEmailForm } from "@/components/profile/change-email-form"
import { ChangePasswordForm } from "@/components/profile/change-password-form"
import { Separator } from "@/components/ui/separator"

export function ProfilePage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading profile...</div>
  }

  if (!user) {
    return <div className="text-sm text-muted-foreground">Profile not available.</div>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-[32px] font-bold">Profile Settings</h1>
        <p className="text-sm text-muted-foreground">
          Update your personal details, avatar, and security preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Info</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountInfo user={user} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm user={user} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-medium">Email</h2>
              <p className="text-sm text-muted-foreground">Confirm your current password before changing your sign-in email.</p>
            </div>
            <ChangeEmailForm user={user} />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-medium">Password</h2>
              <p className="text-sm text-muted-foreground">Use your current password to set a new one.</p>
            </div>
            <ChangePasswordForm />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
