import { taskRepository, taskAssigneeRepository, taskStatusRepository } from '../repositories';
import { projectService } from './project';
import { type Task, type NewTask } from '../db/schema';
import type { User } from '../types';

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
  assignees?: { userId: string; user: { id: string; name: string; email: string; avatarUrl: string | null } }[];
}

export class TaskService {
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
    const task = await taskRepository.findById(taskId);

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
    // If getting own tasks, return all
    if (user.id === userId) {
      return taskRepository.findByAssignee(userId);
    }

    // If getting another user's tasks, must be admin
    if (user.role !== 'admin') {
      throw new Error('Admin access required to view other users tasks');
    }

    return taskRepository.findByAssignee(userId);
  }

  /**
   * Create a new task
   */
  async createTask(projectId: string, input: CreateTaskInput, user: User): Promise<Task> {
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

    // Create task
    const task = await taskRepository.create({
      title: input.title.trim(),
      descriptionMd: input.descriptionMd || '',
      projectId,
      statusId: statusId || null,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      sortOrder: 0,
      createdBy: user.id,
    });

    // Add assignees if provided
    if (input.assigneeIds && input.assigneeIds.length > 0) {
      await taskAssigneeRepository.setAssignees(task.id, input.assigneeIds);
    }

    // Return task with assignees
    return taskRepository.findById(task.id) as Promise<Task>;
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, input: UpdateTaskInput, user: User): Promise<Task | null> {
    const task = await taskRepository.findById(taskId);

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

    return taskRepository.update(taskId, updateData);
  }

  /**
   * Update task status (for kanban drag-and-drop)
   */
  async updateTaskStatus(taskId: string, statusId: string, user: User): Promise<Task | null> {
    const task = await taskRepository.findById(taskId);

    if (!task) {
      return null;
    }

    // Check access
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    // Validate status exists
    const status = await taskStatusRepository.findById(statusId);
    if (!status) {
      throw new Error('Invalid status ID');
    }

    return taskRepository.updateStatus(taskId, statusId);
  }

  /**
   * Update task sort order (for kanban reordering)
   */
  async updateTaskOrder(taskId: string, sortOrder: number, user: User): Promise<Task | null> {
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
  async updateTaskAssignees(taskId: string, assigneeIds: string[], user: User): Promise<Task | null> {
    const task = await taskRepository.findById(taskId);

    if (!task) {
      return null;
    }

    // Check access
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    await taskAssigneeRepository.setAssignees(taskId, assigneeIds);
    
    return taskRepository.findById(taskId) as Promise<Task>;
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string, user: User): Promise<boolean> {
    const task = await taskRepository.findById(taskId);

    if (!task) {
      return false;
    }

    // Check access - allow any project member to delete
    const hasAccess = await projectService.hasAccess(task.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this task');
    }

    return taskRepository.delete(taskId);
  }
}

export const taskService = new TaskService();
