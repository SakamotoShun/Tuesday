import { timeEntryRepository, projectMemberRepository, teamMemberRepository } from '../repositories';
import { projectService } from './project';
import { type TimeEntry, type NewTimeEntry, UserRole } from '../db/schema';
import type { User } from '../types';

export interface UpsertTimeEntryInput {
  projectId: string;
  date: string;
  hours: number;
  note?: string;
}

export interface WeeklyTimesheet {
  entries: TimeEntry[];
  weekStart: string;
  weekEnd: string;
}

export interface MonthlyOverview {
  year: number;
  month: number;
  weeks: Array<{
    weekNumber: number;
    weekStart: string;
    weekEnd: string;
    projectTotals: Array<{ projectId: string; projectName: string; hours: number }>;
    totalHours: number;
  }>;
  projectTotals: Array<{ projectId: string; projectName: string; hours: number }>;
  grandTotal: number;
}

export interface WorkspaceMonthlyOverview {
  year: number;
  month: number;
  weeks: Array<{
    weekNumber: number;
    weekStart: string;
    weekEnd: string;
    userTotals: Array<{ userId: string; userName: string; hours: number }>;
    totalHours: number;
  }>;
  userTotals: Array<{ userId: string; userName: string; hours: number }>;
  grandTotal: number;
}

export interface PayrollQueryInput {
  start: string;
  end: string;
  employeeId?: string;
  projectId?: string;
  teamId?: string;
  employmentType?: 'hourly' | 'full_time';
  search?: string;
  page?: number;
  pageSize?: number;
}

export class TimeEntryService {
  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async getPayrollEntries(input: PayrollQueryInput): Promise<Array<TimeEntry & {
    user?: {
      id: string;
      name: string;
      email: string;
      employmentType: 'hourly' | 'full_time';
      hourlyRate: string | null;
    };
    project?: {
      id: string;
      name: string;
    };
  }>> {
    if (input.start > input.end) {
      throw new Error('Start date must be before or equal to end date');
    }

    const entries = await timeEntryRepository.findAllByDateRange(input.start, input.end) as Array<TimeEntry & {
      user?: {
        id: string;
        name: string;
        email: string;
        employmentType: 'hourly' | 'full_time';
        hourlyRate: string | null;
      };
      project?: {
        id: string;
        name: string;
      };
    }>;

    let teamUserIds: Set<string> | null = null;
    if (input.teamId) {
      const members = await teamMemberRepository.findByTeamId(input.teamId);
      teamUserIds = new Set(members.map((member) => member.userId));
    }

    const search = input.search?.trim().toLowerCase();

    return entries.filter((entry) => {
      if (input.employeeId && entry.userId !== input.employeeId) return false;
      if (input.projectId && entry.projectId !== input.projectId) return false;
      if (input.employmentType && entry.user?.employmentType !== input.employmentType) return false;
      if (teamUserIds && !teamUserIds.has(entry.userId)) return false;
      if (!search) return true;

      const haystack = [
        entry.user?.name ?? '',
        entry.user?.email ?? '',
        entry.project?.name ?? '',
        entry.note ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }

  private getWeekRange(dateString: string): { weekStart: string; weekEnd: string } {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    const day = date.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const weekStart = new Date(date);
    weekStart.setUTCDate(date.getUTCDate() + diffToMonday);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
    };
  }

  async getPayrollSummary(input: PayrollQueryInput): Promise<{
    items: Array<{
      userId: string;
      userName: string;
      userEmail: string;
      employmentType: 'hourly' | 'full_time';
      hourlyRate: number | null;
      totalHours: number;
      totalCost: number | null;
      projectCount: number;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totals: {
      totalHours: number;
      totalCost: number;
      billableEmployees: number;
    };
  }> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const entries = await this.getPayrollEntries(input);

    const grouped = new Map<string, {
      userId: string;
      userName: string;
      userEmail: string;
      employmentType: 'hourly' | 'full_time';
      hourlyRate: number | null;
      totalHours: number;
      totalCost: number | null;
      projects: Set<string>;
    }>();

    for (const entry of entries) {
      if (!entry.user) continue;
      const key = entry.user.id;
      const hours = this.toNumber(entry.hours) ?? 0;
      const hourlyRate = this.toNumber(entry.user.hourlyRate);

      if (!grouped.has(key)) {
        grouped.set(key, {
          userId: entry.user.id,
          userName: entry.user.name,
          userEmail: entry.user.email,
          employmentType: entry.user.employmentType,
          hourlyRate,
          totalHours: 0,
          totalCost: hourlyRate !== null ? 0 : null,
          projects: new Set(),
        });
      }

      const item = grouped.get(key)!;
      item.totalHours += hours;
      if (entry.project?.id) item.projects.add(entry.project.id);
      if (item.hourlyRate !== null && item.totalCost !== null) {
        item.totalCost += hours * item.hourlyRate;
      }
    }

    const allItems = Array.from(grouped.values())
      .map((row) => ({
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        employmentType: row.employmentType,
        hourlyRate: row.hourlyRate,
        totalHours: row.totalHours,
        totalCost: row.totalCost,
        projectCount: row.projects.size,
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName));

    const total = allItems.length;
    const startIdx = (page - 1) * pageSize;
    const items = allItems.slice(startIdx, startIdx + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totals: {
        totalHours: allItems.reduce((sum, item) => sum + item.totalHours, 0),
        totalCost: allItems.reduce((sum, item) => sum + (item.totalCost ?? 0), 0),
        billableEmployees: allItems.filter((item) => item.totalCost !== null).length,
      },
    };
  }

  async getPayrollBreakdown(input: PayrollQueryInput): Promise<Array<{
    userId: string;
    userName: string;
    userEmail: string;
    employmentType: 'hourly' | 'full_time';
    hourlyRate: number | null;
    projects: Array<{
      projectId: string;
      projectName: string;
      hours: number;
      cost: number | null;
      weeks: Array<{ weekStart: string; weekEnd: string; hours: number; cost: number | null }>;
    }>;
  }>> {
    const entries = await this.getPayrollEntries(input);

    const usersMap = new Map<string, {
      userId: string;
      userName: string;
      userEmail: string;
      employmentType: 'hourly' | 'full_time';
      hourlyRate: number | null;
      projects: Map<string, {
        projectId: string;
        projectName: string;
        hours: number;
        cost: number | null;
        weeks: Map<string, { weekStart: string; weekEnd: string; hours: number; cost: number | null }>;
      }>;
    }>();

    for (const entry of entries) {
      if (!entry.user || !entry.project) continue;
      const hours = this.toNumber(entry.hours) ?? 0;
      const hourlyRate = this.toNumber(entry.user.hourlyRate);

      if (!usersMap.has(entry.user.id)) {
        usersMap.set(entry.user.id, {
          userId: entry.user.id,
          userName: entry.user.name,
          userEmail: entry.user.email,
          employmentType: entry.user.employmentType,
          hourlyRate,
          projects: new Map(),
        });
      }

      const user = usersMap.get(entry.user.id)!;
      if (!user.projects.has(entry.project.id)) {
        user.projects.set(entry.project.id, {
          projectId: entry.project.id,
          projectName: entry.project.name,
          hours: 0,
          cost: user.hourlyRate !== null ? 0 : null,
          weeks: new Map(),
        });
      }

      const project = user.projects.get(entry.project.id)!;
      project.hours += hours;
      if (project.cost !== null && user.hourlyRate !== null) {
        project.cost += hours * user.hourlyRate;
      }

      const { weekStart, weekEnd } = this.getWeekRange(entry.date);
      const weekKey = `${weekStart}:${entry.project.id}`;
      if (!project.weeks.has(weekKey)) {
        project.weeks.set(weekKey, {
          weekStart,
          weekEnd,
          hours: 0,
          cost: user.hourlyRate !== null ? 0 : null,
        });
      }

      const week = project.weeks.get(weekKey)!;
      week.hours += hours;
      if (week.cost !== null && user.hourlyRate !== null) {
        week.cost += hours * user.hourlyRate;
      }
    }

    return Array.from(usersMap.values())
      .map((user) => ({
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        employmentType: user.employmentType,
        hourlyRate: user.hourlyRate,
        projects: Array.from(user.projects.values())
          .map((project) => ({
            projectId: project.projectId,
            projectName: project.projectName,
            hours: project.hours,
            cost: project.cost,
            weeks: Array.from(project.weeks.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
          }))
          .sort((a, b) => a.projectName.localeCompare(b.projectName)),
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName));
  }

  async exportPayrollCsv(input: Omit<PayrollQueryInput, 'page' | 'pageSize'>): Promise<string> {
    const rows = await this.getPayrollBreakdown(input);
    const header = 'Employee,Email,Employment Type,Hourly Rate,Project,Hours,Cost';
    const lines: string[] = [];

    for (const user of rows) {
      for (const project of user.projects) {
        const hourlyRate = user.hourlyRate !== null ? user.hourlyRate.toFixed(2) : '';
        const cost = project.cost !== null ? project.cost.toFixed(2) : '';
        lines.push(
          `"${user.userName}","${user.userEmail}","${user.employmentType}","${hourlyRate}","${project.projectName}","${project.hours.toFixed(2)}",` +
          `"${cost}"`
        );
      }
    }

    return [header, ...lines].join('\n');
  }

  async getMyWeeklyTimesheet(userId: string, weekStartDate: string): Promise<WeeklyTimesheet> {
    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const entries = await timeEntryRepository.findByUserAndDateRange(
      userId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    return {
      entries,
      weekStart: startDate.toISOString().split('T')[0],
      weekEnd: endDate.toISOString().split('T')[0],
    };
  }

  async getMyMonthlyOverview(userId: string, year: number, month: number): Promise<MonthlyOverview> {
    const rawData = await timeEntryRepository.getMonthlyOverview(userId, year, month);
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const weeksMap = new Map<number, Map<string, { projectId: string; projectName: string; hours: number }>>();
    const projectTotalsMap = new Map<string, { projectId: string; projectName: string; hours: number }>();
    
    for (const row of rawData) {
      if (!weeksMap.has(row.weekNumber)) {
        weeksMap.set(row.weekNumber, new Map());
      }
      const weekData = weeksMap.get(row.weekNumber)!;
      const hours = parseFloat(row.totalHours) || 0;
      
      if (weekData.has(row.projectId)) {
        weekData.get(row.projectId)!.hours += hours;
      } else {
        weekData.set(row.projectId, {
          projectId: row.projectId,
          projectName: row.projectName,
          hours,
        });
      }
      
      if (projectTotalsMap.has(row.projectId)) {
        projectTotalsMap.get(row.projectId)!.hours += hours;
      } else {
        projectTotalsMap.set(row.projectId, {
          projectId: row.projectId,
          projectName: row.projectName,
          hours,
        });
      }
    }
    
    const weeks = Array.from(weeksMap.entries()).map(([weekNumber, projects]) => {
      const weekDate = this.getWeekDate(weekNumber, year);
      return {
        weekNumber,
        weekStart: weekDate.start,
        weekEnd: weekDate.end,
        projectTotals: Array.from(projects.values()),
        totalHours: Array.from(projects.values()).reduce((sum, p) => sum + p.hours, 0),
      };
    }).sort((a, b) => a.weekNumber - b.weekNumber);
    
    const projectTotals = Array.from(projectTotalsMap.values());
    const grandTotal = projectTotals.reduce((sum, p) => sum + p.hours, 0);
    
    return {
      year,
      month,
      weeks,
      projectTotals,
      grandTotal,
    };
  }

  async upsertEntry(userId: string, input: UpsertTimeEntryInput, user: User): Promise<TimeEntry> {
    const hasAccess = await projectService.hasAccess(input.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    if (input.hours < 0 || input.hours > 24) {
      throw new Error('Hours must be between 0 and 24');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(input.date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    const data: NewTimeEntry = {
      projectId: input.projectId,
      userId,
      date: input.date,
      hours: input.hours.toString(),
      note: input.note || null,
    };

    return timeEntryRepository.upsert(data);
  }

  async deleteEntry(userId: string, entryId: string): Promise<boolean> {
    const entry = await timeEntryRepository.findById(entryId);
    if (!entry) {
      throw new Error('Time entry not found');
    }

    if (entry.userId !== userId) {
      throw new Error('You can only delete your own time entries');
    }

    return timeEntryRepository.delete(entryId);
  }

  async getProjectWeeklyTimesheet(
    projectId: string,
    weekStartDate: string,
    user: User
  ): Promise<WeeklyTimesheet & { entries: Array<TimeEntry & { user?: { id: string; name: string; email: string } }> }> {
    const isOwner = await projectService.isOwner(projectId, user);
    if (!isOwner) {
      throw new Error('Only project owners and admins can view project timesheets');
    }

    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const entries = await timeEntryRepository.findByProjectAndDateRange(
      projectId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    return {
      entries,
      weekStart: startDate.toISOString().split('T')[0],
      weekEnd: endDate.toISOString().split('T')[0],
    };
  }

  async getWorkspaceWeeklyTimesheet(
    weekStartDate: string
  ): Promise<WeeklyTimesheet & { entries: Array<TimeEntry & { user?: { id: string; name: string; email: string }; project?: { id: string; name: string } }> }> {
    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const entries = await timeEntryRepository.findAllByDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    return {
      entries,
      weekStart: startDate.toISOString().split('T')[0],
      weekEnd: endDate.toISOString().split('T')[0],
    };
  }

  async getProjectMonthlyOverview(
    projectId: string,
    year: number,
    month: number,
    user: User
  ): Promise<{ year: number; month: number; weeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string; userTotals: Array<{ userId: string; userName: string; hours: number }>; totalHours: number }>; userTotals: Array<{ userId: string; userName: string; hours: number }>; grandTotal: number }> {
    const isOwner = await projectService.isOwner(projectId, user);
    if (!isOwner) {
      throw new Error('Only project owners and admins can view project timesheets');
    }

    const rawData = await timeEntryRepository.getProjectMonthlyOverview(projectId, year, month);
    
    const weeksMap = new Map<number, Map<string, { userId: string; userName: string; hours: number }>>();
    const userTotalsMap = new Map<string, { userId: string; userName: string; hours: number }>();
    
    for (const row of rawData) {
      if (!weeksMap.has(row.weekNumber)) {
        weeksMap.set(row.weekNumber, new Map());
      }
      const weekData = weeksMap.get(row.weekNumber)!;
      const hours = parseFloat(row.totalHours) || 0;
      
      if (weekData.has(row.userId)) {
        weekData.get(row.userId)!.hours += hours;
      } else {
        weekData.set(row.userId, {
          userId: row.userId,
          userName: row.userName,
          hours,
        });
      }
      
      if (userTotalsMap.has(row.userId)) {
        userTotalsMap.get(row.userId)!.hours += hours;
      } else {
        userTotalsMap.set(row.userId, {
          userId: row.userId,
          userName: row.userName,
          hours,
        });
      }
    }
    
    const weeks = Array.from(weeksMap.entries()).map(([weekNumber, users]) => {
      const weekDate = this.getWeekDate(weekNumber, year);
      return {
        weekNumber,
        weekStart: weekDate.start,
        weekEnd: weekDate.end,
        userTotals: Array.from(users.values()),
        totalHours: Array.from(users.values()).reduce((sum, u) => sum + u.hours, 0),
      };
    }).sort((a, b) => a.weekNumber - b.weekNumber);
    
    const userTotals = Array.from(userTotalsMap.values());
    const grandTotal = userTotals.reduce((sum, u) => sum + u.hours, 0);
    
    return {
      year,
      month,
      weeks,
      userTotals,
      grandTotal,
    };
  }

  async exportUserCsv(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<string> {
    const entries = await timeEntryRepository.findByUserAndDateRange(userId, startDate, endDate);
    
    const header = 'Project,Date,Hours,Note';
    const rows = entries.map(entry => {
      const projectName = (entry as any).project?.name || 'Unknown Project';
      const note = entry.note || '';
      return `"${projectName}","${entry.date}","${entry.hours}","${note.replace(/"/g, '""')}"`;
    });
    
    return [header, ...rows].join('\n');
  }

  async exportProjectCsv(
    projectId: string,
    startDate: string,
    endDate: string,
    user: User
  ): Promise<string> {
    const isOwner = await projectService.isOwner(projectId, user);
    if (!isOwner) {
      throw new Error('Only project owners and admins can export project timesheets');
    }

    const entries = await timeEntryRepository.findByProjectAndDateRange(projectId, startDate, endDate);
    
    const header = 'User,Email,Date,Hours,Note';
    const rows = entries.map(entry => {
      const userName = (entry as any).user?.name || 'Unknown User';
      const userEmail = (entry as any).user?.email || '';
      const note = entry.note || '';
      return `"${userName}","${userEmail}","${entry.date}","${entry.hours}","${note.replace(/"/g, '""')}"`;
    });
    
    return [header, ...rows].join('\n');
  }

  async getWorkspaceMonthlyOverview(year: number, month: number): Promise<WorkspaceMonthlyOverview> {
    const rawData = await timeEntryRepository.getWorkspaceMonthlyOverview(year, month);

    const weeksMap = new Map<number, Map<string, { userId: string; userName: string; hours: number }>>();
    const userTotalsMap = new Map<string, { userId: string; userName: string; hours: number }>();

    for (const row of rawData) {
      if (!weeksMap.has(row.weekNumber)) {
        weeksMap.set(row.weekNumber, new Map());
      }
      const weekData = weeksMap.get(row.weekNumber)!;
      const hours = parseFloat(row.totalHours) || 0;

      if (weekData.has(row.userId)) {
        weekData.get(row.userId)!.hours += hours;
      } else {
        weekData.set(row.userId, {
          userId: row.userId,
          userName: row.userName,
          hours,
        });
      }

      if (userTotalsMap.has(row.userId)) {
        userTotalsMap.get(row.userId)!.hours += hours;
      } else {
        userTotalsMap.set(row.userId, {
          userId: row.userId,
          userName: row.userName,
          hours,
        });
      }
    }

    const weeks = Array.from(weeksMap.entries()).map(([weekNumber, users]) => {
      const weekDate = this.getWeekDate(weekNumber, year);
      return {
        weekNumber,
        weekStart: weekDate.start,
        weekEnd: weekDate.end,
        userTotals: Array.from(users.values()),
        totalHours: Array.from(users.values()).reduce((sum, u) => sum + u.hours, 0),
      };
    }).sort((a, b) => a.weekNumber - b.weekNumber);

    const userTotals = Array.from(userTotalsMap.values());
    const grandTotal = userTotals.reduce((sum, u) => sum + u.hours, 0);

    return {
      year,
      month,
      weeks,
      userTotals,
      grandTotal,
    };
  }

  async exportWorkspaceCsv(startDate: string, endDate: string): Promise<string> {
    const entries = await timeEntryRepository.findAllByDateRange(startDate, endDate);

    const header = 'User,Email,Project,Date,Hours,Note';
    const rows = entries.map(entry => {
      const userName = (entry as any).user?.name || 'Unknown User';
      const userEmail = (entry as any).user?.email || '';
      const projectName = (entry as any).project?.name || 'Unknown Project';
      const note = entry.note || '';
      return `"${userName}","${userEmail}","${projectName}","${entry.date}","${entry.hours}","${note.replace(/"/g, '""')}"`;
    });

    return [header, ...rows].join('\n');
  }

  private getWeekDate(weekNumber: number, year: number): { start: string; end: string } {
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (weekNumber - 1) * 7;
    const firstDayOfWeek = new Date(firstDayOfYear);
    firstDayOfWeek.setDate(firstDayOfYear.getDate() + daysOffset - firstDayOfYear.getDay() + 1);
    
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    
    return {
      start: firstDayOfWeek.toISOString().split('T')[0],
      end: lastDayOfWeek.toISOString().split('T')[0],
    };
  }
}

export const timeEntryService = new TimeEntryService();
