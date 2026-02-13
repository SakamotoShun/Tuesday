import { Fragment, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Download, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  useAdminPayrollBreakdown,
  useAdminPayrollSummary,
  useExportAdminPayroll,
  useAdminUsers,
} from "@/hooks/use-admin"
import { useProjects } from "@/hooks/use-projects"
import { useTeams } from "@/hooks/use-teams"
import { useAuth } from "@/hooks/use-auth"

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatMoney(value: number | null) {
  if (value === null) return "-"
  return `$${value.toFixed(2)}`
}

function formatHours(value: number) {
  return value.toFixed(2)
}

function formatWeekLabel(weekStart: string, weekEnd: string) {
  return `${weekStart} to ${weekEnd}`
}

export function AdminPayrollPage() {
  const { user } = useAuth()
  const [start, setStart] = useState(() => isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [end, setEnd] = useState(() => isoDate(new Date()))
  const [employeeId, setEmployeeId] = useState<string>("")
  const [projectId, setProjectId] = useState<string>("")
  const [teamId, setTeamId] = useState<string>("")
  const [employmentType, setEmploymentType] = useState<string>("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [expandedProjectRows, setExpandedProjectRows] = useState<Record<string, boolean>>({})

  const { users } = useAdminUsers()
  const { projects } = useProjects()
  const { teams } = useTeams()

  const query = useMemo(() => ({
    start,
    end,
    employeeId: employeeId || undefined,
    projectId: projectId || undefined,
    teamId: teamId || undefined,
    employmentType: (employmentType || undefined) as "hourly" | "full_time" | undefined,
    search: search || undefined,
    page,
    pageSize,
  }), [start, end, employeeId, projectId, teamId, employmentType, search, page, pageSize])

  const summaryQuery = useAdminPayrollSummary(query)
  const breakdownQuery = useAdminPayrollBreakdown(query)
  const exportPayroll = useExportAdminPayroll()

  if (user?.role !== "admin") {
    return <div className="p-6 text-sm text-muted-foreground">Admin access required.</div>
  }

  const summary = summaryQuery.data
  const breakdown = breakdownQuery.data ?? []
  const breakdownByUser = new Map(breakdown.map((item) => [item.userId, item.projects]))

  const totalPages = summary ? Math.max(1, Math.ceil(summary.total / summary.pageSize)) : 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[32px] font-bold">Payroll</h1>
          <p className="text-sm text-muted-foreground">Hours, contribution, and payroll-ready summaries.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/admin">Back to Admin</Link>
          </Button>
          <Button
            onClick={() => exportPayroll.mutate({
              start,
              end,
              employeeId: employeeId || undefined,
              projectId: projectId || undefined,
              teamId: teamId || undefined,
              employmentType: (employmentType || undefined) as "hourly" | "full_time" | undefined,
              search: search || undefined,
            })}
            disabled={exportPayroll.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <Input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPage(1) }} />
          <Input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPage(1) }} />
          <Select value={employeeId || "all"} onValueChange={(value) => { setEmployeeId(value === "all" ? "" : value); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {users.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectId || "all"} onValueChange={(value) => { setProjectId(value === "all" ? "" : value); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={teamId || "all"} onValueChange={(value) => { setTeamId(value === "all" ? "" : value); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={employmentType || "all"} onValueChange={(value) => { setEmploymentType(value === "all" ? "" : value); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="full_time">Full time</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="lg:col-span-2"
            placeholder="Search employee/project"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total Hours</div>
              <div className="text-xl font-semibold tabular-nums">{summary ? formatHours(summary.totals.totalHours) : "0.00"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total Cost (rated users)</div>
              <div className="text-xl font-semibold tabular-nums">{formatMoney(summary?.totals.totalCost ?? 0)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Billable Employees</div>
              <div className="text-xl font-semibold">{summary?.totals.billableEmployees ?? 0}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Hourly Rate</TableHead>
                  <TableHead className="text-right">Total Hours</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">Loading payroll data...</TableCell>
                  </TableRow>
                ) : (summary?.items.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">No payroll rows for this filter.</TableCell>
                  </TableRow>
                ) : (
                  summary?.items.map((row) => {
                    const expanded = !!expandedRows[row.userId]
                    const projectsForUser = breakdownByUser.get(row.userId) ?? []
                    return (
                      <Fragment key={row.userId}>
                        <TableRow key={row.userId}>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setExpandedRows((prev) => ({ ...prev, [row.userId]: !expanded }))}
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{row.userName}</div>
                            <div className="text-xs text-muted-foreground">{row.userEmail}</div>
                          </TableCell>
                          <TableCell>{row.employmentType === "full_time" ? "Full Time" : "Hourly"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(row.hourlyRate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatHours(row.totalHours)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(row.totalCost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.projectCount}</TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/20">
                              {projectsForUser.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No project rows.</div>
                              ) : (
                                <div className="overflow-x-auto rounded border bg-background">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Project</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead className="text-right">Hours</TableHead>
                                        <TableHead className="text-right">Cost</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {projectsForUser.map((project) => {
                                        const projectKey = `${row.userId}:${project.projectId}`
                                        const projectExpanded = !!expandedProjectRows[projectKey]

                                        return (
                                          <Fragment key={project.projectId}>
                                            <TableRow>
                                              <TableCell className="font-medium">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 px-2"
                                                  onClick={() =>
                                                    setExpandedProjectRows((prev) => ({
                                                      ...prev,
                                                      [projectKey]: !projectExpanded,
                                                    }))
                                                  }
                                                >
                                                  {projectExpanded ? (
                                                    <ChevronDown className="mr-1 h-4 w-4" />
                                                  ) : (
                                                    <ChevronRight className="mr-1 h-4 w-4" />
                                                  )}
                                                  {project.projectName}
                                                </Button>
                                              </TableCell>
                                              <TableCell className="text-muted-foreground">Total</TableCell>
                                              <TableCell className="text-right tabular-nums font-medium">{formatHours(project.hours)}</TableCell>
                                              <TableCell className="text-right tabular-nums font-medium">{formatMoney(project.cost)}</TableCell>
                                            </TableRow>
                                            {projectExpanded && project.weeks.map((week) => (
                                              <TableRow key={`${project.projectId}-${week.weekStart}`}>
                                                <TableCell className="pl-8 text-muted-foreground">Weekly</TableCell>
                                                <TableCell className="text-muted-foreground">{formatWeekLabel(week.weekStart, week.weekEnd)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{formatHours(week.hours)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{formatMoney(week.cost)}</TableCell>
                                              </TableRow>
                                            ))}
                                          </Fragment>
                                        )
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Page {summary?.page ?? page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1) }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
              <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
