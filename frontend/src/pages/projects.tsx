import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  Calendar,
  ExternalLink,
  FileText,
  FolderKanban,
  ListTodo,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "@/lib/icons"
import { NewProjectDialog } from "@/components/projects/new-project-dialog"
import { EditProjectDialog } from "@/components/projects/edit-project-dialog"
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog"
import { StatusBadge } from "@/components/projects/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { useProjects, useProjectStatuses } from "@/hooks/use-projects"
import { cn } from "@/lib/utils"
import { PROJECT_TYPE_OPTIONS, normalizeProjectType } from "@/lib/project-types"
import type { Project, UpdateProjectInput } from "@/api/types"

type OwnerFilterMode = "all" | "member" | "owned"
type SortMode = "updated" | "name" | "timeline" | "status"

const QUICK_LINKS = [
  { label: "Tasks", suffix: "/tasks", icon: ListTodo },
  { label: "Docs", suffix: "/docs", icon: FileText },
  { label: "Schedule", suffix: "/schedule", icon: Calendar },
  { label: "Chat", suffix: "/chat", icon: MessageSquare },
] as const

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function parseHours(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatDateRange(startDate: string | null, targetEndDate: string | null) {
  if (!startDate && !targetEndDate) return "No timeline"

  const start = formatDate(startDate) ?? "TBD"
  const end = formatDate(targetEndDate) ?? "Ongoing"

  return `${start} -> ${end}`
}

function getMemberCount(project: Project) {
  if (project.members && project.members.length > 0) {
    return project.members.length
  }
  return 1
}

function isProjectInMyScope(project: Project, userId: string) {
  if (project.ownerId === userId) {
    return true
  }

  return project.members?.some((member) => member.userId === userId) ?? false
}

function toTimestamp(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
}

function canViewProjectBudget(project: Project, userId: string | undefined, role: string | undefined) {
  if (!userId) return false
  if (role === "admin") return true
  if (project.ownerId === userId) return true
  if (project.currentUserRole === "owner") return true

  return project.members?.some((member) => member.userId === userId && member.role === "owner") ?? false
}

export function ProjectsPage() {
  const { user } = useAuth()
  const { projects, isLoading, updateProject, deleteProject } = useProjects()
  const { data: projectStatuses } = useProjectStatuses()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilterMode>("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [sortBy, setSortBy] = useState<SortMode>("updated")

  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const statusOptions = useMemo(() => {
    if (projectStatuses && projectStatuses.length > 0) {
      return projectStatuses.map((status) => ({
        value: status.id,
        label: status.name,
      }))
    }

    const fallback = new Map<string, string>()
    for (const project of projects) {
      if (project.statusId && project.status?.name) {
        fallback.set(project.statusId, project.status.name)
      }
    }

    return Array.from(fallback.entries()).map(([value, label]) => ({ value, label }))
  }, [projectStatuses, projects])

  const statusLabelMap = useMemo(() => {
    return new Map(statusOptions.map((option) => [option.value, option.label]))
  }, [statusOptions])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (statusFilter !== "all" && project.statusId !== statusFilter) {
        return false
      }

      if (ownerFilter === "member") {
        if (!user || !isProjectInMyScope(project, user.id)) {
          return false
        }
      }

      if (ownerFilter === "owned") {
        if (!user || project.ownerId !== user.id) {
          return false
        }
      }

      if (typeFilter !== "all" && normalizeProjectType(project.type) !== typeFilter) {
        return false
      }

      if (normalizedQuery.length > 0) {
        const searchableText = [
          project.name,
          project.client ?? "",
          project.type ?? "",
          project.status?.name ?? "",
        ]
          .join(" ")
          .toLowerCase()

        if (!searchableText.includes(normalizedQuery)) {
          return false
        }
      }

      return true
    })
  }, [projects, statusFilter, ownerFilter, user, typeFilter, normalizedQuery])

  const visibleProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name)
      }

      if (sortBy === "timeline") {
        return toTimestamp(a.startDate) - toTimestamp(b.startDate)
      }

      if (sortBy === "status") {
        const aStatus = a.status?.name ?? ""
        const bStatus = b.status?.name ?? ""
        return aStatus.localeCompare(bStatus)
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [filteredProjects, sortBy])

  const metrics = useMemo(() => {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000

    const toName = (project: Project) => project.status?.name?.toLowerCase() ?? ""

    const activeCount = projects.filter((project) => toName(project) === "active").length
    const completedCount = projects.filter((project) => toName(project) === "completed").length
    const onHoldCount = projects.filter((project) => toName(project) === "on hold").length
    const recentlyUpdatedCount = projects.filter((project) => {
      return new Date(project.updatedAt).getTime() >= weekAgo
    }).length

    return [
      {
        label: "Active",
        value: String(activeCount),
        hint: "Currently in motion",
        icon: FolderKanban,
        className: "border-primary/25 bg-primary/10 text-primary",
      },
      {
        label: "Completed",
        value: String(completedCount),
        hint: "Delivered projects",
        icon: ListTodo,
        className: "border-secondary/25 bg-secondary/10 text-secondary",
      },
      {
        label: "On Hold",
        value: String(onHoldCount),
        hint: "Need follow-up",
        icon: Calendar,
        className: "border-destructive/25 bg-destructive/10 text-destructive",
      },
      {
        label: "Updated (7d)",
        value: String(recentlyUpdatedCount),
        hint: "Recently touched",
        icon: ExternalLink,
        className: "border-border bg-card text-foreground",
      },
    ]
  }, [projects])

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []

    if (statusFilter !== "all") {
      labels.push(`Status: ${statusLabelMap.get(statusFilter) ?? "Unknown"}`)
    }

    if (ownerFilter === "member") {
      labels.push("Scope: My access")
    }

    if (ownerFilter === "owned") {
      labels.push("Scope: Owned by me")
    }

    if (typeFilter !== "all") {
      const selectedType = PROJECT_TYPE_OPTIONS.find(
        (typeOption) => normalizeProjectType(typeOption.value) === typeFilter
      )
      labels.push(`Type: ${selectedType?.label ?? typeFilter}`)
    }

    if (normalizedQuery.length > 0) {
      labels.push(`Search: ${searchQuery.trim()}`)
    }

    return labels
  }, [statusFilter, statusLabelMap, ownerFilter, typeFilter, normalizedQuery, searchQuery])

  const hasActiveFilters = activeFilterLabels.length > 0

  const clearFilters = () => {
    setSearchQuery("")
    setStatusFilter("all")
    setOwnerFilter("all")
    setTypeFilter("all")
  }

  const handleEditClick = (project: Project) => {
    setSelectedProject(project)
    setIsEditDialogOpen(true)
  }

  const handleDeleteClick = (project: Project) => {
    setSelectedProject(project)
    setIsDeleteDialogOpen(true)
  }

  const handleEditSubmit = async (data: UpdateProjectInput) => {
    if (!selectedProject) return
    await updateProject.mutateAsync({ id: selectedProject.id, data })
    setIsEditDialogOpen(false)
    setSelectedProject(null)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedProject) return
    await deleteProject.mutateAsync(selectedProject.id)
    setIsDeleteDialogOpen(false)
    setSelectedProject(null)
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-3xl border border-border bg-card px-5 py-5 shadow-sm md:px-6 md:py-6">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Workspace Delivery
              </p>
              <h1 className="font-serif text-[32px] leading-tight md:text-[38px]">Projects</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Filter quickly, scan health at a glance, then jump straight into docs, tasks,
                schedule, or chat from each project.
              </p>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button asChild variant="outline" className="h-10">
                <Link to="/my-work">Open My Work</Link>
              </Button>
              <NewProjectDialog />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((metric, index) => (
              <article
                key={metric.label}
                className="animate-in fade-in slide-in-from-bottom-1 duration-700"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="rounded-2xl border border-border/80 bg-background/80 p-3 backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {metric.label}
                      </p>
                      <p className="mt-1 text-2xl font-semibold leading-none">{metric.value}</p>
                    </div>
                    <div className={cn("rounded-lg border px-2 py-2", metric.className)}>
                      <metric.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{metric.hint}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,0.8fr))]">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by project, client, status, or type"
              className="h-11 bg-background pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 bg-background">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((statusOption) => (
                <SelectItem key={statusOption.value} value={statusOption.value}>
                  {statusOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ownerFilter} onValueChange={(value) => setOwnerFilter(value as OwnerFilterMode)}>
            <SelectTrigger className="h-11 bg-background">
              <SelectValue placeholder="All ownership" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ownership</SelectItem>
              <SelectItem value="member">My access</SelectItem>
              <SelectItem value="owned">Owned by me</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-11 bg-background">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {PROJECT_TYPE_OPTIONS.map((typeOption) => (
                <SelectItem
                  key={typeOption.value}
                  value={normalizeProjectType(typeOption.value)}
                >
                  {typeOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortMode)}>
            <SelectTrigger className="h-11 bg-background">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Sort: recent updates</SelectItem>
              <SelectItem value="name">Sort: name</SelectItem>
              <SelectItem value="timeline">Sort: timeline start</SelectItem>
              <SelectItem value="status">Sort: status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
              Showing {visibleProjects.length} of {projects.length}
            </span>
            {activeFilterLabels.map((label) => (
              <Badge key={label} variant="outline" className="border-border bg-background text-muted-foreground">
                {label}
              </Badge>
            ))}
          </div>

          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Project navigation</h2>
            <p className="text-xs text-muted-foreground">
              Open a project overview or jump directly into workstreams.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-border/80 bg-background/70 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            title="No matching projects"
            description={
              hasActiveFilters
                ? "Try clearing a filter or broadening your search."
                : "Create your first project to start planning and execution."
            }
            actionLabel={hasActiveFilters ? "Clear filters" : undefined}
            onAction={hasActiveFilters ? clearFilters : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {visibleProjects.map((project, index) => {
                const canViewBudget = canViewProjectBudget(project, user?.id, user?.role)
                const budgetHours = parseHours(project.budgetHours)
                const loggedHours = Math.max(project.totalLoggedHours ?? 0, 0)
                const hasBudget = canViewBudget && budgetHours !== null && budgetHours > 0
                const usedPercent = hasBudget ? (loggedHours / budgetHours) * 100 : 0
                const clampedPercent = Math.min(Math.max(usedPercent, 0), 100)
                const isOverBudget = hasBudget && usedPercent > 100
                const isNearBudget = hasBudget && usedPercent > 75 && usedPercent <= 100

                return (
                  <article
                    key={project.id}
                    className="animate-in fade-in slide-in-from-bottom-1 duration-700"
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <div
                      className="h-full rounded-xl border border-border/80 bg-background/80 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 max-w-[420px]">
                            <Link
                              to={`/projects/${project.id}`}
                              className="line-clamp-1 text-base font-semibold hover:underline"
                            >
                              {project.name}
                            </Link>
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {project.client || "Internal project"}
                            </p>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleEditClick(project)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit project
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteClick(project)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            {project.status?.name ? (
                              <StatusBadge status={project.status.name} />
                            ) : (
                              <Badge variant="outline" className="border-border text-muted-foreground">
                                No status
                              </Badge>
                            )}

                            {project.type && (
                              <Badge variant="outline" className="border-border text-muted-foreground">
                                {project.type}
                              </Badge>
                            )}

                            <Badge variant="outline" className="border-border text-muted-foreground">
                              {getMemberCount(project)} members
                            </Badge>

                            <Badge variant="outline" className="border-border text-muted-foreground">
                              {formatDateRange(project.startDate, project.targetEndDate)}
                            </Badge>

                            <span className="text-xs text-muted-foreground">
                              Updated {formatDate(project.updatedAt) ?? "--"}
                            </span>
                          </div>

                          <div className="w-full lg:w-auto lg:shrink-0">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:justify-self-end">
                              {QUICK_LINKS.map((quickLink) => (
                                <Button
                                  key={quickLink.label}
                                  asChild
                                  variant="outline"
                                  className="h-10 min-w-[90px] justify-start gap-1.5 px-2 text-xs"
                                >
                                  <Link to={`/projects/${project.id}${quickLink.suffix}`}>
                                    <quickLink.icon className="h-3.5 w-3.5" />
                                    {quickLink.label}
                                  </Link>
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {canViewBudget && (
                          <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                            {hasBudget && budgetHours !== null ? (
                              <>
                                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                                  <span
                                    className={cn(
                                      "font-medium",
                                      isOverBudget
                                        ? "text-destructive"
                                        : isNearBudget
                                          ? "text-amber-600"
                                          : "text-foreground"
                                    )}
                                  >
                                    {isOverBudget ? "Over budget" : "Hour budget"}
                                  </span>
                                  <span
                                    className={cn(
                                      "font-medium",
                                      isOverBudget
                                        ? "text-destructive"
                                        : isNearBudget
                                          ? "text-amber-600"
                                          : "text-muted-foreground"
                                    )}
                                  >
                                    {formatHours(loggedHours)}h / {formatHours(budgetHours)}h
                                    {isOverBudget && ` (+${formatHours(loggedHours - budgetHours)}h)`}
                                  </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      isOverBudget
                                        ? "bg-destructive"
                                        : isNearBudget
                                          ? "bg-amber-500"
                                          : "bg-primary"
                                    )}
                                    style={{ width: `${clampedPercent}%` }}
                                  />
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                No allocated hours yet. Edit project to set budget.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
            })}
          </div>
        )}
      </section>

      {/* Edit Project Dialog */}
      <EditProjectDialog
        project={selectedProject}
        statuses={projectStatuses || []}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSubmit={handleEditSubmit}
      />

      {/* Delete Project Dialog */}
      <DeleteProjectDialog
        project={selectedProject}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
