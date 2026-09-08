import { taskRepository } from '../repositories/task';
import { taskAssigneeRepository } from '../repositories/taskAssignee';
import { taskStatusRepository } from '../repositories/taskStatus';
import { projectMemberRepository } from '../repositories/projectMember';
import { projectService } from './project';
import { activityService } from './activity';
import { notificationService } from './notification';
import { type Notification, type Task, type NewTask } from '../db/schema';
import type { User } from '../types';
import { assertNotFreelancer, isFreelancer } from '../utils/permissions';
import { db, type DbTransaction } from '../db/client';

export interface CreateTaskInput {
  title: string;
  descriptionMd?: string;
  statusId?: string;
  startDate?: string;
  dueDate?: string;
  assigneeIds?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  descriptionMd?: string;
  statusId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface TaskWithAssignees extends Task {
  status?: { id: string; name: string; color: string } | null;
  assignees?: { userId: string; user: { id: string; name: string; email: string; avatarUrl: string | null } }[];
}

export class TaskService {
  private ensureFreelancerAssigned(task: TaskWithAssignees, user: User) {
    if (!isFreelancer(user)) {
      return;
    }

    const isAssigned = task.assignees?.some((assignee) => assignee.userId === user.id) ?? false;
    if (!isAssigned) {
      throw new Error('Freelancers cannot update tasks they are not assigned to');
    }
  }

  /**
   * Get all tasks in a project
   */
  async getProjectTasks(
    projectId: string, 
    user: User, 
    filters?: { statusId?: string; assigneeId?: string }
  ): Promise<Task[]> {
    // Verify access
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    return taskRepository.findByProjectId(projectId, filters);
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: string, user: User): Promise<TaskWithAssignees | null> {
    const task = await taskRepository.findById(taskId) as TaskWithAssignees | null;

    if (!task) {
      return null;
    }

    // Check access
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    return task;
  }

  /**
   * Get tasks assigned to a user across all projects
   */
  async getMyTasks(userId: string, user: User): Promise<Task[]> {
    let assignedTasks: Task[];
    if (user.id === userId) {
      assignedTasks = await taskRepository.findByAssignee(userId);
    } else if (user.role !== 'admin') {
      throw new Error('Admin access required to view other users tasks');
    } else {
      assignedTasks = await taskRepository.findByAssignee(userId);
    }

    if (user.role === 'admin') return assignedTasks;

    const projectIds = Array.from(new Set(assignedTasks.map((task) => task.projectId)));
    const access = new Map(await Promise.all(projectIds.map(async (projectId) => [
      projectId,
      await projectService.hasAccess(projectId, user),
    ] as const)));
    return assignedTasks.filter((task) => access.get(task.projectId));
  }

  /**
   * Create a new task
   */
  async createTask(
    projectId: string,
    input: CreateTaskInput,
    user: User,
  ): Promise<Task> {
    const committed = await db.transaction((tx) => this.createTaskInTransaction(projectId, input, user, tx));
    notificationService.publishMany(committed.notifications);
    await this.publishTaskCreated(committed.task, committed.assigneeIds, user);
    return committed.task;
  }

  async createTaskInTransaction(
    projectId: string,
    input: CreateTaskInput,
    user: User,
    transaction: DbTransaction,
  ): Promise<{ task: TaskWithAssignees; assigneeIds: string[]; notifications: Notification[] }> {
    assertNotFreelancer(user, 'Freelancers cannot create tasks');

    // Verify access
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    // Validate title
    if (!input.title || input.title.trim() === '') {
      throw new Error('Task title is required');
    }

    // Use default status if none provided
    let statusId = input.statusId;
    if (!statusId) {
      const defaultStatus = await taskStatusRepository.findDefault();
      statusId = defaultStatus?.id;
    }

    // Validate status exists
    if (statusId) {
      const status = await taskStatusRepository.findById(statusId);
      if (!status) {
        throw new Error('Invalid status ID');
      }
    }

    const assigneeIds = Array.from(new Set(input.assigneeIds ?? []));

    if (assigneeIds.length > 0) {
      const activeMemberIds = await projectMemberRepository.findActiveMemberIds(projectId, assigneeIds, transaction);
      if (activeMemberIds.length !== assigneeIds.length) {
        throw new Error('All assignees must be active project members');
      }
    }
    const task = await taskRepository.create({
      title: input.title.trim(),
      descriptionMd: input.descriptionMd || '',
      projectId,
      statusId: statusId || null,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      sortOrder: 0,
      createdBy: user.id,
    }, transaction);
    if (assigneeIds.length > 0) {
      await taskAssigneeRepository.setAssignees(task.id, assigneeIds, transaction);
    }
    const completeTask = (await taskRepository.findById(task.id, transaction) ?? task) as TaskWithAssignees;
    const notifications = assigneeIds.length > 0
      ? await notificationService.enqueueAssignment({
          taskId: task.id,
          taskTitle: task.title,
          assigneeIds,
          assignedBy: user.name,
          projectId,
        }, transaction)
      : [];
    return { task: completeTask, assigneeIds, notifications };
  }

  async publishTaskCreated(task: TaskWithAssignees, assigneeIds: string[], user: User): Promise<void> {
    await activityService.record({
      actorId: user.id,
      action: 'task.created',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      projectId: task.projectId,
      metadata: {
        statusId: task.statusId,
        assigneeCount: assigneeIds.length,
      },
    });
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, input: UpdateTaskInput, user: User): Promise<Task | null> {
    assertNotFreelancer(user, 'Freelancers cannot edit tasks (status only)');

    const task = await taskRepository.findById(taskId) as TaskWithAssignees | null;

    if (!task) {
      return null;
    }

    // Check access
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    // Validate status if provided
    if (input.statusId) {
      const status = await taskStatusRepository.findById(input.statusId);
      if (!status) {
        throw new Error('Invalid status ID');
      }
    }

    const updateData: Partial<NewTask> = {};

    if (input.title !== undefined) {
      if (input.title.trim() === '') {
        throw new Error('Task title cannot be empty');
      }
      updateData.title = input.title.trim();
    }

    if (input.descriptionMd !== undefined) {
      updateData.descriptionMd = input.descriptionMd;
    }

    if (input.statusId !== undefined) {
      updateData.statusId = input.statusId;
    }

    if (input.startDate !== undefined) {
      updateData.startDate = input.startDate || null;
    }

    if (input.dueDate !== undefined) {
      updateData.dueDate = input.dueDate || null;
    }

    const updated = await taskRepository.update(taskId, updateData);
    if (updated) {
      await activityService.record({
        actorId: user.id,
        action: 'task.updated',
        entityType: 'task',
        entityId: task.id,
        entityName: updated.title,
        projectId: task.projectId,
        metadata: {
          changedFields: Object.keys(updateData),
          previousStatusId: task.statusId,
          nextStatusId: updated.statusId,
        },
      });
    }

    return updated;
  }

  /**
   * Update task status (for kanban drag-and-drop)
   */
  async updateTaskStatus(taskId: string, statusId: string, user: User): Promise<Task | null> {
    const task = await taskRepository.findById(taskId) as TaskWithAssignees | null;

    if (!task) {
      return null;
    }

    // Check access
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    this.ensureFreelancerAssigned(task, user);

    // Validate status exists
    const status = await taskStatusRepository.findById(statusId);
    if (!status) {
      throw new Error('Invalid status ID');
    }

    const updated = await taskRepository.updateStatus(taskId, statusId);
    if (updated) {
      await activityService.record({
        actorId: user.id,
        action: 'task.status_changed',
        entityType: 'task',
        entityId: task.id,
        entityName: task.title,
        projectId: task.projectId,
        metadata: {
          previousStatusId: task.statusId,
          nextStatusId: statusId,
        },
      });
    }

    return updated;
  }

  async updateTaskIfVersion(
    taskId: string,
    input: UpdateTaskInput,
    expectedVersion: number,
    user: User,
  ): Promise<Task | null> {
    assertNotFreelancer(user, 'Freelancers cannot edit tasks (status only)');
    const task = await this.getTask(taskId, user);
    if (!task) return null;

    if (input.statusId) {
      const status = await taskStatusRepository.findById(input.statusId);
      if (!status) throw new Error('Invalid status ID');
    }

    const updateData: Partial<NewTask> = {};
    if (input.title !== undefined) {
      if (!input.title.trim()) throw new Error('Task title cannot be empty');
      updateData.title = input.title.trim();
    }
    if (input.descriptionMd !== undefined) updateData.descriptionMd = input.descriptionMd;
    if (input.statusId !== undefined) updateData.statusId = input.statusId;
    if (input.startDate !== undefined) updateData.startDate = input.startDate || null;
    if (input.dueDate !== undefined) updateData.dueDate = input.dueDate || null;

    const updated = await taskRepository.updateIfVersion(taskId, expectedVersion, updateData);
    if (!updated) throw new Error('Conflict: task version changed');

    await activityService.record({
      actorId: user.id,
      action: 'task.updated',
      entityType: 'task',
      entityId: task.id,
      entityName: updated.title,
      projectId: task.projectId,
      metadata: {
        changedFields: Object.keys(updateData),
        previousStatusId: task.statusId,
        nextStatusId: updated.statusId,
      },
    });
    return updated;
  }

  async updateTaskStatusIfVersion(
    taskId: string,
    statusId: string,
    expectedVersion: number,
    user: User,
  ): Promise<Task | null> {
    const task = await this.getTask(taskId, user);
    if (!task) return null;
    this.ensureFreelancerAssigned(task, user);

    const status = await taskStatusRepository.findById(statusId);
    if (!status) throw new Error('Invalid status ID');

    const updated = await taskRepository.updateIfVersion(taskId, expectedVersion, { statusId });
    if (!updated) throw new Error('Conflict: task version changed');

    await activityService.record({
      actorId: user.id,
      action: 'task.status_changed',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      projectId: task.projectId,
      metadata: { previousStatusId: task.statusId, nextStatusId: statusId },
    });
    return updated;
  }

  /**
   * Update task sort order (for kanban reordering)
   */
  async updateTaskOrder(taskId: string, sortOrder: number, user: User): Promise<Task | null> {
    assertNotFreelancer(user, 'Freelancers cannot edit tasks (status only)');

    const task = await taskRepository.findById(taskId);

    if (!task) {
      return null;
    }

    // Check access
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    return taskRepository.updateSortOrder(taskId, sortOrder);
  }

  /**
   * Update task assignees
   */
  async updateTaskAssignees(taskId: string, assigneeIds: string[], user: User): Promise<TaskWithAssignees | null> {
    assertNotFreelancer(user, 'Freelancers cannot update task assignees');

    const task = await taskRepository.findById(taskId) as TaskWithAssignees | null;

    if (!task) {
      return null;
    }

    // Check access
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    const uniqueAssigneeIds = Array.from(new Set(assigneeIds));
    const committed = await db.transaction(async (tx) => {
      const activeMemberIds = await projectMemberRepository.findActiveMemberIds(task.projectId, uniqueAssigneeIds, tx);
      if (activeMemberIds.length !== uniqueAssigneeIds.length) {
        throw new Error('All assignees must be active project members');
      }
      const updated = await taskRepository.update(taskId, {}, tx);
      if (!updated) return null;
      // The update holds the task row lock while we compare and replace assignees.
      const current = await taskRepository.findById(taskId, tx) as TaskWithAssignees | null;
      if (!current) throw new Error('Failed to load task');
      const existingAssignees = current.assignees?.map((assignee) => assignee.userId) ?? [];
      const newAssignees = uniqueAssigneeIds.filter((assigneeId) => !existingAssignees.includes(assigneeId));
      await taskAssigneeRepository.setAssignees(taskId, uniqueAssigneeIds, tx);
      const notifications = newAssignees.length > 0
        ? await notificationService.enqueueAssignment({
            taskId: task.id,
            taskTitle: current.title,
            assigneeIds: newAssignees,
            assignedBy: user.name,
            projectId: task.projectId,
          }, tx)
        : [];
      const complete = await taskRepository.findById(taskId, tx) as TaskWithAssignees | null;
      if (!complete) throw new Error('Failed to load task');
      return { task: complete, notifications, previousAssigneeCount: existingAssignees.length };
    });
    if (!committed) return null;
    notificationService.publishMany(committed.notifications);

    await activityService.record({
      actorId: user.id,
      action: 'task.assignees_changed',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      projectId: task.projectId,
      metadata: {
        previousAssigneeCount: committed.previousAssigneeCount,
        nextAssigneeCount: uniqueAssigneeIds.length,
      },
    });

    return committed.task;
  }

  async updateTaskAssigneesIfVersion(
    taskId: string,
    assigneeIds: string[],
    expectedVersion: number,
    user: User,
  ): Promise<TaskWithAssignees | null> {
    assertNotFreelancer(user, 'Freelancers cannot update task assignees');
    const task = await this.getTask(taskId, user);
    if (!task) return null;

    const uniqueAssigneeIds = Array.from(new Set(assigneeIds));
    const committed = await db.transaction(async (tx) => {
      const activeMemberIds = await projectMemberRepository.findActiveMemberIds(task.projectId, uniqueAssigneeIds, tx);
      if (activeMemberIds.length !== uniqueAssigneeIds.length) {
        throw new Error('All assignees must be active project members');
      }
      const updated = await taskRepository.updateIfVersion(taskId, expectedVersion, {}, tx);
      if (!updated) throw new Error('Conflict: task version changed');
      const current = await taskRepository.findById(taskId, tx) as TaskWithAssignees | null;
      if (!current) throw new Error('Failed to load task');
      const existingAssignees = current.assignees?.map((assignee) => assignee.userId) ?? [];
      const newAssignees = uniqueAssigneeIds.filter((assigneeId) => !existingAssignees.includes(assigneeId));
      await taskAssigneeRepository.setAssignees(taskId, uniqueAssigneeIds, tx);
      const notifications = newAssignees.length > 0
        ? await notificationService.enqueueAssignment({
            taskId: task.id,
            taskTitle: current.title,
            assigneeIds: newAssignees,
            assignedBy: user.name,
            projectId: task.projectId,
          }, tx)
        : [];
      const complete = await taskRepository.findById(taskId, tx) as TaskWithAssignees | null;
      if (!complete) throw new Error('Failed to load task');
      return { task: complete, notifications, previousAssigneeCount: existingAssignees.length };
    });
    notificationService.publishMany(committed.notifications);

    await activityService.record({
      actorId: user.id,
      action: 'task.assignees_changed',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      projectId: task.projectId,
      metadata: {
        previousAssigneeCount: committed.previousAssigneeCount,
        nextAssigneeCount: uniqueAssigneeIds.length,
      },
    });

    return committed.task;
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string, user: User): Promise<boolean> {
    assertNotFreelancer(user, 'Freelancers cannot delete tasks');

    const task = await taskRepository.findById(taskId);

    if (!task) {
      return false;
    }

    // Check access - allow any project member to delete
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    const deleted = await taskRepository.delete(taskId);
    if (deleted) {
      await activityService.record({
        actorId: user.id,
        action: 'task.deleted',
        entityType: 'task',
        entityId: task.id,
        entityName: task.title,
        projectId: task.projectId,
      });
    }

    return deleted;
  }
}

export const taskService = new TaskService();
