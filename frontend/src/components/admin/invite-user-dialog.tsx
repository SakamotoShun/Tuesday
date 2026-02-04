import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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

  const handleSubmit = async () => {
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
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next)
      if (!next) {
        setTempPassword(null)
      }
    }}>
      <DialogTrigger asChild>
        <Button size="sm">Invite User</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as "admin" | "member")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Temporary password (optional)</Label>
            <Input
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
          <Button
            onClick={handleSubmit}
            disabled={createUser.isPending || !email || !name}
          >
            {createUser.isPending ? "Inviting..." : "Send Invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
