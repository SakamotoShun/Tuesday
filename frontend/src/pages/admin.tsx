import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { WorkspaceSettings } from "@/components/admin/workspace-settings"
import { UserManagement } from "@/components/admin/user-management"
import { StatusManager } from "@/components/admin/status-manager"
import { TeamManagement } from "@/components/admin/team-management"
import { TemplateManagement } from "@/components/admin/template-management"
import { BotManagement } from "@/components/admin/bot-management"
import { GlobalTimeReport } from "@/components/admin/global-time-report"

export function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-[32px] font-bold">Admin Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkspaceSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <UserManagement />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamManagement />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateManagement />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status Management</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusManager />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bots</CardTitle>
        </CardHeader>
        <CardContent>
          <BotManagement />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Timesheet</CardTitle>
        </CardHeader>
        <CardContent>
          <GlobalTimeReport />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Reporting</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Use the dedicated payroll page for HR and salary tabulation.</p>
          <Button asChild>
            <Link to="/admin/payroll">Open Payroll</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
