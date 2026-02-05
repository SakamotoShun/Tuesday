import { useEffect, useRef, useState } from "react"
import { ApiErrorResponse } from "@/api/client"
import type { User } from "@/api/types"
import { useProfile } from "@/hooks/use-profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ProfileFormProps {
  user: User
}

export function ProfileForm({ user }: ProfileFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { updateProfile, uploadAvatar, removeAvatar } = useProfile()
  const [name, setName] = useState(user.name)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileNotice, setProfileNotice] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null)

  useEffect(() => {
    setName(user.name)
  }, [user.name])

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  const normalizedName = name.trim()
  const isNameDirty = normalizedName !== user.name

  const handleSave = async () => {
    if (!normalizedName) {
      setProfileError("Name is required")
      return
    }

    try {
      setProfileError(null)
      setProfileNotice(null)
      await updateProfile.mutateAsync({ name: normalizedName })
      setProfileNotice("Profile updated")
    } catch (error) {
      if (error instanceof ApiErrorResponse) {
        setProfileError(error.message)
      } else {
        setProfileError("An unexpected error occurred")
      }
    }
  }

  const handleAvatarSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setAvatarError(null)
    setAvatarNotice(null)

    if (!file.type.startsWith("image/")) {
      setAvatarError("Avatar must be an image file")
      event.target.value = ""
      return
    }

    try {
      await uploadAvatar.mutateAsync(file)
      setAvatarNotice("Avatar updated")
    } catch (error) {
      if (error instanceof ApiErrorResponse) {
        setAvatarError(error.message)
      } else {
        setAvatarError("An unexpected error occurred")
      }
    } finally {
      event.target.value = ""
    }
  }

  const handleRemoveAvatar = async () => {
    try {
      setAvatarError(null)
      setAvatarNotice(null)
      await removeAvatar.mutateAsync()
      setAvatarNotice("Avatar removed")
    } catch (error) {
      if (error instanceof ApiErrorResponse) {
        setAvatarError(error.message)
      } else {
        setAvatarError("An unexpected error occurred")
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>Avatar</Label>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <Avatar className="h-20 w-20">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.name} />
            ) : (
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadAvatar.isPending || removeAvatar.isPending}
              >
                {uploadAvatar.isPending ? "Uploading..." : "Upload"}
              </Button>
              {user.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRemoveAvatar}
                  disabled={uploadAvatar.isPending || removeAvatar.isPending}
                >
                  {removeAvatar.isPending ? "Removing..." : "Remove"}
                </Button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">Image files only.</div>
            {avatarError && <div className="text-sm text-destructive">{avatarError}</div>}
            {avatarNotice && <div className="text-sm text-primary">{avatarNotice}</div>}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarSelected}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-name">Display name</Label>
        <div className="flex flex-col gap-2 md:flex-row">
          <Input
            id="profile-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={updateProfile.isPending}
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isNameDirty || updateProfile.isPending}
          >
            {updateProfile.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
        {profileError && <div className="text-sm text-destructive">{profileError}</div>}
        {profileNotice && <div className="text-sm text-primary">{profileNotice}</div>}
      </div>
    </div>
  )
}
