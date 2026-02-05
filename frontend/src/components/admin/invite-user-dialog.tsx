import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAdminUsers } from "@/hooks/use-admin"

export function InviteUserDialog() {
  const { createUser } = useAdminUsers()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<"admin" | "member">("member")
  const [password, setPassword] = useState("")
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  const handleSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (createUser.isPending || !email || !name) return
    const response = await createUser.mutateAsync({
      email,
      name,
      role,
      password: password || undefined,
    })
    if (response.temporaryPassword) {
      setTempPassword(response.temporaryPassword)
      return
    }
    setOpen(false)
    setEmail("")
    setName("")
    setPassword("")
    setTempPassword(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setTempPassword(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Invite User</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Add a workspace member and optionally set a temporary password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as "admin" | "member")}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-password">Temporary password (optional)</Label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Leave blank to auto-generate"
            />
          </div>
          {tempPassword && (
            <div className="text-sm text-muted-foreground">
              Temporary password: <span className="font-semibold text-foreground">{tempPassword}</span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isPending || !email || !name}>
              {createUser.isPending ? "Inviting..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
