import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { timeEntries } from '../db/schema';
import { notificationRepository, projectStatusRepository, taskRepository, taskStatusRepository } from '../repositories';
import { projectService } from './project';
import type { User } from '../types';

interface StatusCount {
  statusId: string | null;
  statusName: string;
  color: string;
  count: number;
}

export interface DashboardStats {
  tasks: {
    total: number;
    overdue: number;
    dueThisWeek: number;
    completedThisWeek: number;
    byStatus: StatusCount[];
  };
  projects: {
    total: number;
    byStatus: StatusCount[];
  };
  timeTracking: {
    hoursToday: number;
    hoursThisWeek: number;
  };
  unreadNotifications: number;
}

function isCompletedStatus(statusName?: string | null): boolean {
  if (!statusName) {
    return false;
  }
  const normalized = statusName.toLowerCase();
  return normalized.includes('done') || normalized.includes('complete');
}

function parseDateOnly(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export class DashboardService {
  async getStats(user: User): Promise<DashboardStats> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const [myTasks, taskStatuses, projects, projectStatuses, unreadNotifications] = await Promise.all([
      taskRepository.findByAssignee(user.id),
      taskStatusRepository.findAll(),
      projectService.getProjects(user),
      projectStatusRepository.findAll(),
      notificationRepository.countUnreadByUser(user.id),
    ]);

    const taskStatusMap = new Map(taskStatuses.map((status) => [status.id, status]));
    const projectStatusMap = new Map(projectStatuses.map((status) => [status.id, status]));

    const tasksByStatus = new Map<string, StatusCount>();
    let overdue = 0;
    let dueThisWeek = 0;
    let completedThisWeek = 0;

    for (const task of myTasks) {
      const status = task.statusId ? taskStatusMap.get(task.statusId) : undefined;
      const statusKey = task.statusId ?? 'none';
      const statusCount = tasksByStatus.get(statusKey) ?? {
        statusId: task.statusId,
        statusName: status?.name ?? 'Unassigned',
        color: status?.color ?? '#6b7280',
        count: 0,
      };
      statusCount.count += 1;
      tasksByStatus.set(statusKey, statusCount);

      const isCompleted = isCompletedStatus(status?.name);
      const dueDate = parseDateOnly(task.dueDate);
      if (dueDate && dueDate < today && !isCompleted) {
        overdue += 1;
      }
      if (dueDate && dueDate >= today && dueDate <= weekEnd && !isCompleted) {
        dueThisWeek += 1;
      }

      const updatedAt = new Date(task.updatedAt);
      if (isCompleted && updatedAt >= weekStart && updatedAt <= now) {
        completedThisWeek += 1;
      }
    }

    const projectsByStatus = new Map<string, StatusCount>();
    for (const project of projects) {
      const status = project.statusId ? projectStatusMap.get(project.statusId) : undefined;
      const statusKey = project.statusId ?? 'none';
      const count = projectsByStatus.get(statusKey) ?? {
        statusId: project.statusId,
        statusName: status?.name ?? 'Unassigned',
        color: status?.color ?? '#6b7280',
        count: 0,
      };
      count.count += 1;
      projectsByStatus.set(statusKey, count);
    }

    const weekTimeEntries = await db
      .select({
        date: timeEntries.date,
        hours: timeEntries.hours,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, user.id),
          gte(timeEntries.date, toDateString(weekStart)),
          lte(timeEntries.date, toDateString(today))
        )
      );

    const hoursThisWeek = weekTimeEntries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0);
    const todayKey = toDateString(today);
    const hoursToday = weekTimeEntries
      .filter((entry) => entry.date === todayKey)
      .reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0);

    return {
      tasks: {
        total: myTasks.length,
        overdue,
        dueThisWeek,
        completedThisWeek,
        byStatus: Array.from(tasksByStatus.values()).sort((a, b) => b.count - a.count),
      },
      projects: {
        total: projects.length,
        byStatus: Array.from(projectsByStatus.values()).sort((a, b) => b.count - a.count),
      },
      timeTracking: {
        hoursToday: roundHours(hoursToday),
        hoursThisWeek: roundHours(hoursThisWeek),
      },
      unreadNotifications: unreadNotifications,
    };
  }
}

export const dashboardService = new DashboardService();
