import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { db, type DbTransaction } from '../db/client';

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let findByAssignee: (...args: any[]) => Promise<any> = async () => [];
let createTask: (...args: any[]) => Promise<any> = async (data) => ({ id: 'task-1', ...data });
let updateTask: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'task-1', ...data });
let updateTaskIfVersion: (...args: any[]) => Promise<any> = async (_id, version, data) => ({ id: 'task-1', ...data, version: version + 1 });
let updateStatus: (...args: any[]) => Promise<any> = async (_id, _statusId) => ({ id: 'task-1' });
let updateOrder: (...args: any[]) => Promise<any> = async (_id, _sort) => ({ id: 'task-1' });
let deleteTask: (...args: any[]) => Promise<any> = async () => true;

let setAssignees: (...args: any[]) => Promise<any> = async () => {};
let findDefaultStatus: (...args: any[]) => Promise<any> = async () => ({ id: 'status-default' });
let findStatusById: (...args: any[]) => Promise<any> = async (id) => ({ id, name: 'Status' });
let isProjectMember: (...args: any[]) => Promise<any> = async () => true;
let findActiveMemberIds: (...args: any[]) => Promise<any> = async (_projectId, ids) => ids;
let createNotification: (...args: any[]) => Promise<any> = async (data) => ({ id: 'notification-1', ...data });
let createDelivery: (...args: any[]) => Promise<any> = async () => {};
const transaction = {} as DbTransaction;
const spies: Array<{ mockRestore(): void }> = [];
let commitError: Error | null = null;
let committed = false;


mock.module('../repositories/task', () => ({
  TaskRepository: class {},
  taskRepository: {
    findByProjectId: (projectId: string, filters?: any) => findByProjectId(projectId, filters),
    findById: (...args: any[]) => findById(...args),
    findByAssignee: (userId: string) => findByAssignee(userId),
    create: (...args: any[]) => createTask(...args),
    update: (...args: any[]) => updateTask(...args),
    updateIfVersion: (...args: any[]) => updateTaskIfVersion(...args),
    updateStatus: (taskId: string, statusId: string) => updateStatus(taskId, statusId),
    updateSortOrder: (taskId: string, sortOrder: number) => updateOrder(taskId, sortOrder),
    delete: (taskId: string) => deleteTask(taskId),
  },
}));

mock.module('../repositories/taskAssignee', () => ({
  TaskAssigneeRepository: class {},
  taskAssigneeRepository: {
    setAssignees: (...args: any[]) => setAssignees(...args),
  },
}));

mock.module('../repositories/taskStatus', () => ({
  TaskStatusRepository: class {},
  taskStatusRepository: {
    findDefault: () => findDefaultStatus(),
    findById: (id: string) => findStatusById(id),
  },
}));

mock.module('../repositories/projectMember', () => ({
  ProjectMemberRepository: class {},
  projectMemberRepository: {
    isMember: (projectId: string, userId: string) => isProjectMember(projectId, userId),
    findActiveMemberIds: (...args: any[]) => findActiveMemberIds(...args),
  },
}));

mock.module('../repositories/notification', () => ({
  NotificationRepository: class {},
  notificationRepository: {
    create: (...args: any[]) => createNotification(...args),
    createDeliveryIfEnabled: (...args: any[]) => createDelivery(...args),
  },
}));

const { taskService } = await import('./task');
const { activityService } = await import('./activity');
const { notificationService } = await import('./notification');

const memberUser = {
  id: '11111111-1111-4111-8111-111111111111',
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

const freelancerUser = {
  ...memberUser,
  role: 'freelancer' as const,
};

describe('TaskService', () => {
  beforeEach(() => {
    findByProjectId = async () => [];
    findById = async () => null;
    findByAssignee = async () => [];
    createTask = async (data) => ({ id: 'task-1', ...data });
    updateTask = async (_id, data) => ({ id: 'task-1', ...data });
    updateTaskIfVersion = async (_id, version, data) => ({ id: 'task-1', ...data, version: version + 1 });
    updateStatus = async () => ({ id: 'task-1' });
    updateOrder = async () => ({ id: 'task-1' });
    deleteTask = async () => true;
    setAssignees = async () => {};
    findDefaultStatus = async () => ({ id: 'status-default' });
    findStatusById = async (id) => ({ id, name: 'Status' });
    isProjectMember = async () => true;
    findActiveMemberIds = async (_projectId, ids) => ids;
    createNotification = async (data) => ({ id: 'notification-1', ...data });
    createDelivery = async () => {};
    commitError = null;
    committed = false;
    spies.push(spyOn(db, 'transaction').mockImplementation(async (callback) => {
      const result = await callback(transaction);
      if (commitError) throw commitError;
      committed = true;
      return result;
    }));
    spies.push(spyOn(activityService, 'record').mockResolvedValue(undefined));
    spies.push(spyOn(notificationService, 'publishMany').mockImplementation(() => {
      expect(committed).toBe(true);
    }));
  });

  afterEach(() => {
    for (const spy of spies.splice(0).reverse()) spy.mockRestore();
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

  it('creates assignments and notifications in the task transaction', async () => {
    createTask = mock(async (data) => ({ id: 'task-1', ...data }));
    setAssignees = mock(async () => {});
    createNotification = mock(async (data) => ({ id: 'notification-1', ...data }));
    createDelivery = mock(async () => {});
    findActiveMemberIds = mock(async (_projectId, ids) => ids);

    await taskService.createTask('project-1', { title: 'Task', assigneeIds: ['user-2', 'user-2'] }, adminUser);

    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task' }), transaction);
    expect(findActiveMemberIds).toHaveBeenCalledWith('project-1', ['user-2'], transaction);
    expect(setAssignees).toHaveBeenCalledWith('task-1', ['user-2'], transaction);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_assignment', userId: 'user-2' }), transaction);
    expect(createDelivery).toHaveBeenCalledWith(expect.objectContaining({ id: 'notification-1' }), transaction);
    expect(notificationService.publishMany).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive or non-member assignees before creating a task', async () => {
    findActiveMemberIds = async () => [];
    createTask = mock(async (data) => ({ id: 'task-1', ...data }));
    await expect(taskService.createTask('project-1', { title: 'Task', assigneeIds: ['outsider'] }, adminUser))
      .rejects.toThrow('All assignees must be active project members');
    expect(createTask).not.toHaveBeenCalled();
    expect(notificationService.publishMany).not.toHaveBeenCalled();
  });

  it('does not publish or record activity when the task transaction fails to commit', async () => {
    commitError = new Error('Commit failed');
    await expect(taskService.createTask('project-1', { title: 'Task', assigneeIds: ['user-2'] }, adminUser))
      .rejects.toThrow('Commit failed');
    expect(notificationService.publishMany).not.toHaveBeenCalled();
    expect(activityService.record).not.toHaveBeenCalled();
  });

  it('propagates delivery enqueue failures before publishing the task', async () => {
    createDelivery = async () => { throw new Error('Outbox unavailable'); };
    await expect(taskService.createTask('project-1', { title: 'Task', assigneeIds: ['user-2'] }, adminUser))
      .rejects.toThrow('Outbox unavailable');
    expect(committed).toBe(false);
    expect(notificationService.publishMany).not.toHaveBeenCalled();
    expect(activityService.record).not.toHaveBeenCalled();
  });

  it('notifies a reassigned user removed by a concurrent edit before the task lock', async () => {
    const task = { id: 'task-1', title: 'Task', projectId: 'project-1', assignees: [{ userId: 'user-2' }] };
    let locked = false;
    let replaced = false;
    findById = async (_id, executor) => {
      if (!executor) return task;
      expect(locked).toBe(true);
      return { ...task, title: 'Renamed task', assignees: replaced ? [{ userId: 'user-2' }] : [] };
    };
    updateTask = async (_id, _data, executor) => {
      expect(executor).toBe(transaction);
      locked = true;
      return task;
    };
    setAssignees = async (_id, _ids, executor) => {
      expect(executor).toBe(transaction);
      replaced = true;
    };
    createNotification = mock(async (data) => ({ id: 'notification-1', ...data }));

    const result = await taskService.updateTaskAssignees('task-1', ['user-2'], adminUser);

    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-2', title: 'Assigned to task: Renamed task',
    }), transaction);
    expect(result?.assignees?.map((assignee) => assignee.userId)).toEqual(['user-2']);
  });

  it('does not duplicate notifications for a concurrent assignment already committed', async () => {
    const task = { id: 'task-1', title: 'Task', projectId: 'project-1', assignees: [] };
    findById = async (_id, executor) => executor ? { ...task, assignees: [{ userId: 'user-2' }] } : task;
    createNotification = mock(async (data) => ({ id: 'notification-1', ...data }));

    await taskService.updateTaskAssignees('task-1', ['user-2'], adminUser);

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('does not assign or notify when the task was concurrently deleted', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1', assignees: [] });
    updateTask = async () => null;
    setAssignees = mock(async () => {});
    createNotification = mock(async (data) => ({ id: 'notification-1', ...data }));

    expect(await taskService.updateTaskAssignees('task-1', ['user-2'], adminUser)).toBeNull();
    expect(setAssignees).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(notificationService.publishMany).not.toHaveBeenCalled();
    expect(activityService.record).not.toHaveBeenCalled();
  });

  it('returns the versioned assignment snapshot, not a later concurrent edit', async () => {
    const task = { id: 'task-1', title: 'Task', projectId: 'project-1', version: 2, assignees: [] };
    let replaced = false;
    findById = async (_id, executor) => executor
      ? { ...task, version: 3, assignees: replaced ? [{ userId: 'user-2' }] : [] }
      : { ...task, version: committed ? 4 : 2 };
    updateTaskIfVersion = mock(async () => ({ ...task, version: 3 }));
    setAssignees = async () => { replaced = true; };

    const result = await taskService.updateTaskAssigneesIfVersion('task-1', ['user-2'], 2, adminUser);

    expect(updateTaskIfVersion).toHaveBeenCalledWith('task-1', 2, {}, transaction);
    expect(result?.version).toBe(3);
    expect(result?.assignees?.map((assignee) => assignee.userId)).toEqual(['user-2']);
  });

  it('does not replace assignees or notify after a version conflict', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1', version: 3, assignees: [] });
    updateTaskIfVersion = async () => null;
    setAssignees = mock(async () => {});
    createNotification = mock(async (data) => ({ id: 'notification-1', ...data }));

    await expect(taskService.updateTaskAssigneesIfVersion('task-1', ['user-2'], 2, adminUser))
      .rejects.toThrow('Conflict: task version changed');
    expect(committed).toBe(false);
    expect(setAssignees).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(notificationService.publishMany).not.toHaveBeenCalled();
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

  it('rejects task creation for freelancers', async () => {
    await expect(taskService.createTask('project-1', { title: 'Task A' }, freelancerUser)).rejects.toThrow(
      'Freelancers cannot create tasks'
    );
  });


  it('updates task status', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1', assignees: [] });
    const task = await taskService.updateTaskStatus('task-1', 'status-1', adminUser);
    expect(task?.id).toBe('task-1');
  });

  it('allows freelancer to update status on assigned tasks', async () => {
    findById = async () => ({
      id: 'task-1',
      projectId: 'project-1',
      assignees: [{ userId: freelancerUser.id }],
    });
    const task = await taskService.updateTaskStatus('task-1', 'status-1', freelancerUser);
    expect(task?.id).toBe('task-1');
  });

  it('rejects freelancer status updates for unassigned tasks', async () => {
    findById = async () => ({
      id: 'task-1',
      projectId: 'project-1',
      assignees: [{ userId: 'someone-else' }],
    });
    await expect(taskService.updateTaskStatus('task-1', 'status-1', freelancerUser)).rejects.toThrow(
      'Freelancers cannot update tasks they are not assigned to'
    );
  });


  it('deletes task when authorized', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1' });
    const ok = await taskService.deleteTask('task-1', adminUser);
    expect(ok).toBe(true);
  });

  it('rejects task edits for freelancers', async () => {
    findById = async () => ({ id: 'task-1', projectId: 'project-1', assignees: [] });

    await expect(taskService.updateTask('task-1', { title: 'Updated' }, freelancerUser)).rejects.toThrow(
      'Freelancers cannot edit tasks (status only)'
    );
    await expect(taskService.updateTaskOrder('task-1', 1, freelancerUser)).rejects.toThrow(
      'Freelancers cannot edit tasks (status only)'
    );
    await expect(taskService.updateTaskAssignees('task-1', ['user-2'], freelancerUser)).rejects.toThrow(
      'Freelancers cannot update task assignees'
    );
    await expect(taskService.deleteTask('task-1', freelancerUser)).rejects.toThrow(
      'Freelancers cannot delete tasks'
    );
  });

  it('allows admin to view other user tasks', async () => {
    findByAssignee = async () => [{ id: 'task-2' }];
    const tasks = await taskService.getMyTasks('user-2', adminUser);
    expect(tasks).toEqual([{ id: 'task-2' }] as any);
  });
});
