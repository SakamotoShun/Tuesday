import { describe, it, expect, beforeEach, mock } from 'bun:test';

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let findByAssignee: (...args: any[]) => Promise<any> = async () => [];
let createTask: (...args: any[]) => Promise<any> = async (data) => ({ id: 'task-1', ...data });
let updateTask: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'task-1', ...data });
let updateStatus: (...args: any[]) => Promise<any> = async (_id, _statusId) => ({ id: 'task-1' });
let updateOrder: (...args: any[]) => Promise<any> = async (_id, _sort) => ({ id: 'task-1' });
let deleteTask: (...args: any[]) => Promise<any> = async () => true;

let setAssignees: (...args: any[]) => Promise<any> = async () => {};
let findDefaultStatus: (...args: any[]) => Promise<any> = async () => ({ id: 'status-default' });
let findStatusById: (...args: any[]) => Promise<any> = async (id) => ({ id, name: 'Status' });


mock.module('../repositories/task', () => ({
  TaskRepository: class {},
  taskRepository: {
    findByProjectId: (projectId: string, filters?: any) => findByProjectId(projectId, filters),
    findById: (taskId: string) => findById(taskId),
    findByAssignee: (userId: string) => findByAssignee(userId),
    create: (data: any) => createTask(data),
    update: (taskId: string, data: any) => updateTask(taskId, data),
    updateStatus: (taskId: string, statusId: string) => updateStatus(taskId, statusId),
    updateSortOrder: (taskId: string, sortOrder: number) => updateOrder(taskId, sortOrder),
    delete: (taskId: string) => deleteTask(taskId),
  },
}));

mock.module('../repositories/taskAssignee', () => ({
  TaskAssigneeRepository: class {},
  taskAssigneeRepository: {
    setAssignees: (taskId: string, assigneeIds: string[]) => setAssignees(taskId, assigneeIds),
  },
}));

mock.module('../repositories/taskStatus', () => ({
  TaskStatusRepository: class {},
  taskStatusRepository: {
    findDefault: () => findDefaultStatus(),
    findById: (id: string) => findStatusById(id),
  },
}));

const { taskService } = await import('./task');

const memberUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  role: 'member' as const,
  isDisabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  avatarUrl: null,
};

const adminUser = {
  ...memberUser,
  role: 'admin' as const,
};

describe('TaskService', () => {
  beforeEach(() => {
    findByProjectId = async () => [];
    findById = async () => null;
    findByAssignee = async () => [];
    createTask = async (data) => ({ id: 'task-1', ...data });
    updateTask = async (_id, data) => ({ id: 'task-1', ...data });
    updateStatus = async () => ({ id: 'task-1' });
    updateOrder = async () => ({ id: 'task-1' });
    deleteTask = async () => true;
    setAssignees = async () => {};
    findDefaultStatus = async () => ({ id: 'status-default' });
    findStatusById = async (id) => ({ id, name: 'Status' });
  });

  it('rejects viewing other users tasks when not admin', async () => {
    await expect(taskService.getMyTasks('user-2', memberUser)).rejects.toThrow(
      'Admin access required to view other users tasks'
    );
  });

  it('creates task with default status', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1', statusId: 'status-default' });
    const task = await taskService.createTask('project-1', { title: 'Task A' }, adminUser);
    expect(task.statusId).toBe('status-default');
  });

  it('rejects task creation without title', async () => {
    await expect(taskService.createTask('project-1', { title: '' }, adminUser)).rejects.toThrow(
      'Task title is required'
    );
  });

  it('rejects invalid status on create', async () => {
    findStatusById = async () => null;
    await expect(
      taskService.createTask('project-1', { title: 'Task', statusId: 'bad-status' }, adminUser)
    ).rejects.toThrow('Invalid status ID');
  });


  it('updates task status', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1' });
    const task = await taskService.updateTaskStatus('task-1', 'status-1', adminUser);
    expect(task?.id).toBe('task-1');
  });


  it('deletes task when authorized', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1' });
    const ok = await taskService.deleteTask('task-1', adminUser);
    expect(ok).toBe(true);
  });

  it('allows admin to view other user tasks', async () => {
    findByAssignee = async () => [{ id: 'task-2' }];
    const tasks = await taskService.getMyTasks('user-2', adminUser);
    expect(tasks).toEqual([{ id: 'task-2' }] as any);
  });
});
