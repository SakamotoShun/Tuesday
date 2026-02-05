import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserCombobox } from "@/components/ui/user-combobox"
import { useTeams, useTeamMembers, useTeamProjects } from "@/hooks/use-teams"
import { useProjects } from "@/hooks/use-projects"
import { useWorkspaceUsers } from "@/hooks/use-project-members"
import { useAuth } from "@/hooks/use-auth"
import { ApiErrorResponse } from "@/api/client"
import type { Team } from "@/api/types"

export function TeamManagement() {
  const { teams, isLoading, createTeam, deleteTeam, updateTeam } = useTeams()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async (teamId: string) => {
    setError(null)
    const confirmDelete = window.confirm("Delete this team? This will remove team access from all assigned projects.")
    if (!confirmDelete) return
    try {
      await deleteTeam.mutateAsync(teamId)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to delete team")
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Teams</div>
          <div className="text-sm text-muted-foreground">Group members and grant project access in bulk.</div>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New team
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="text-sm text-muted-foreground">No teams yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="text-sm font-medium">{team.name}</div>
                {team.description && (
                  <div className="text-xs text-muted-foreground">{team.description}</div>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{team.memberCount ?? 0} members</span>
                  <span>•</span>
                  <span>{team.projectCount ?? 0} projects</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedTeam(team)}>
                  Manage
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(team.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateTeamDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={createTeam.mutateAsync}
        isCreating={createTeam.isPending}
      />

      {selectedTeam && (
        <TeamDetailDialog
          team={selectedTeam}
          onOpenChange={(open) => !open && setSelectedTeam(null)}
          updateTeam={updateTeam}
        />
      )}
    </div>
  )
}

interface CreateTeamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: { name: string; description?: string | null }) => Promise<Team>
  isCreating: boolean
}

function CreateTeamDialog({ open, onOpenChange, onCreate, isCreating }: CreateTeamDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setName("")
      setDescription("")
      setError(null)
    }
  }, [open])

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      setError(null)
      await onCreate({ name: name.trim(), description: description.trim() || null })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to create team")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>Teams group users and grant access to assigned projects.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Design" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? "Creating..." : "Create team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface TeamDetailDialogProps {
  team: Team
  onOpenChange: (open: boolean) => void
  updateTeam: {
    mutateAsync: (input: { id: string; data: { name?: string; description?: string | null } }) => Promise<Team>
    isPending: boolean
  }
}

function TeamDetailDialog({ team, onOpenChange, updateTeam }: TeamDetailDialogProps) {
  const { user } = useAuth()
  const { members, addMember, updateMemberRole, removeMember, isLoading: membersLoading } = useTeamMembers(team.id)
  const { projects, assignProject, unassignProject, isLoading: projectsLoading } = useTeamProjects(team.id)
  const usersQuery = useWorkspaceUsers()
  const { projects: allProjects } = useProjects()

  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? "")
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [newRole, setNewRole] = useState<"lead" | "member">("member")
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [activeTab, setActiveTab] = useState("members")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(team.name)
    setDescription(team.description ?? "")
  }, [team])

  const leadCount = useMemo(
    () => members.filter((member) => member.role === "lead").length,
    [members]
  )

  const availableUsers = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.userId))
    return (usersQuery.data ?? []).filter((user) => !memberIds.has(user.id) && !user.isDisabled)
  }, [members, usersQuery.data])

  const availableProjects = useMemo(() => {
    const assignedIds = new Set(projects.map((project) => project.projectId))
    return allProjects.filter((project) => !assignedIds.has(project.id))
  }, [projects, allProjects])

  const isSaving = updateTeam.isPending
  const isMutatingMembers = addMember.isPending || updateMemberRole.isPending || removeMember.isPending
  const isMutatingProjects = assignProject.isPending || unassignProject.isPending

  const selectedUserId = selectedUserIds[0]

  const handleSave = async () => {
    try {
      setError(null)
      await updateTeam.mutateAsync({
        id: team.id,
        data: { name: name.trim(), description: description.trim() || null },
      })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update team")
      }
    }
  }

  const handleAddMember = async () => {
    if (!selectedUserId) return
    try {
      setError(null)
      await addMember.mutateAsync({ userId: selectedUserId, role: newRole })
      setSelectedUserIds([])
      setNewRole("member")
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to add member")
      }
    }
  }

  const handleRoleChange = async (userId: string, role: "lead" | "member") => {
    try {
      setError(null)
      await updateMemberRole.mutateAsync({ userId, role })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to update member role")
      }
    }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      setError(null)
      await removeMember.mutateAsync(userId)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to remove member")
      }
    }
  }

  const handleAssignProject = async () => {
    if (!selectedProjectId) return
    try {
      setError(null)
      await assignProject.mutateAsync(selectedProjectId)
      setSelectedProjectId("")
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to assign project")
      }
    }
  }

  const handleUnassignProject = async (projectId: string) => {
    try {
      setError(null)
      await unassignProject.mutateAsync(projectId)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("Failed to unassign project")
      }
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Manage team</DialogTitle>
          <DialogDescription>Update details, members, and project access.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Description</label>
              <Input value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!name.trim() || isSaving}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="text-sm font-semibold">Add member</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <UserCombobox
                  users={availableUsers}
                  selectedIds={selectedUserIds}
                  onChange={setSelectedUserIds}
                  mode="single"
                  placeholder="Select a user"
                  searchPlaceholder="Search users..."
                  emptyLabel="No available users"
                  allowClear
                  disabled={isMutatingMembers || usersQuery.isLoading}
                  className="w-full sm:flex-1"
                  contentClassName="w-[360px]"
                />
                <Select value={newRole} onValueChange={(value) => setNewRole(value as "lead" | "member")}> 
                  <SelectTrigger className="w-full sm:w-[140px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={handleAddMember}
                  disabled={!selectedUserId || isMutatingMembers}
                  className="w-full sm:w-auto"
                >
                  {addMember.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Leads can manage team members and project assignments.</p>
            </div>

            {membersLoading ? (
              <div className="text-sm text-muted-foreground">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="text-sm text-muted-foreground">No members yet.</div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const isLead = member.role === "lead"
                  const isLastLead = isLead && leadCount === 1
                  const isSelf = member.userId === user?.id
                  return (
                    <div
                      key={member.userId}
                      className="flex flex-col gap-3 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{member.user?.name ?? "Unknown"}</span>
                          {isSelf && <Badge variant="secondary">You</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{member.user?.email ?? ""}</div>
                      </div>

                      <div className="flex items-center gap-2 sm:justify-end">
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.userId, value as "lead" | "member")}
                          disabled={isMutatingMembers || isLastLead}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="lead">Lead</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isMutatingMembers || isLastLead}
                          onClick={() => handleRemoveMember(member.userId)}
                          className={(isLastLead ? "opacity-60" : undefined)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="text-sm font-semibold">Assign project</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-full sm:flex-1">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={handleAssignProject}
                  disabled={!selectedProjectId || isMutatingProjects}
                  className="w-full sm:w-auto"
                >
                  {assignProject.isPending ? "Assigning..." : "Assign"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">All team members will be added to the project.</p>
            </div>

            {projectsLoading ? (
              <div className="text-sm text-muted-foreground">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-muted-foreground">No projects assigned yet.</div>
            ) : (
              <div className="space-y-2">
                {projects.map((teamProject) => (
                  <div
                    key={teamProject.projectId}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div className="text-sm font-medium">{teamProject.project?.name ?? "Untitled project"}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isMutatingProjects}
                      onClick={() => handleUnassignProject(teamProject.projectId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
