import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let createWhiteboard: (...args: any[]) => Promise<any> = async (data) => ({ id: 'whiteboard-1', ...data });
let updateWhiteboard: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'whiteboard-1', ...data });
let deleteWhiteboard: (...args: any[]) => Promise<any> = async () => true;
let hasProjectAccess: (...args: any[]) => Promise<any> = async () => true;

mock.module('../repositories/whiteboard', () => ({
  WhiteboardRepository: class {},
  whiteboardRepository: {
    findByProjectId: (projectId: string) => findByProjectId(projectId),
    findById: (whiteboardId: string) => findById(whiteboardId),
    create: (data: any) => createWhiteboard(data),
    update: (whiteboardId: string, data: any) => updateWhiteboard(whiteboardId, data),
    delete: (whiteboardId: string) => deleteWhiteboard(whiteboardId),
  },
}));

mock.module('./project', () => ({
  projectService: {
    hasAccess: (projectId: string, user: any) => hasProjectAccess(projectId, user),
  },
}));

const { whiteboardService } = await import('./whiteboard');
const { activityService } = await import('./activity');
const originalRecord = activityService.record.bind(activityService);

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

describe('WhiteboardService', () => {
  beforeEach(() => {
    findByProjectId = async () => [];
    findById = async () => null;
    createWhiteboard = async (data) => ({ id: 'whiteboard-1', ...data });
    updateWhiteboard = async (_id, data) => ({ id: 'whiteboard-1', ...data });
    deleteWhiteboard = async () => true;
    hasProjectAccess = async () => true;
    activityService.record = async () => {};
  });

  afterEach(() => {
    activityService.record = originalRecord;
  });

  it('rejects creating whiteboard without name', async () => {
    await expect(whiteboardService.createWhiteboard('project-1', { name: '' }, adminUser)).rejects.toThrow(
      'Whiteboard name is required'
    );
  });

  it('rejects whiteboard mutations for freelancers', async () => {
    findById = async () => ({ id: 'whiteboard-1', projectId: 'project-1', name: 'Board' });

    await expect(whiteboardService.createWhiteboard('project-1', { name: 'Board' }, freelancerUser)).rejects.toThrow(
      'Freelancers cannot create whiteboards'
    );
    await expect(whiteboardService.updateWhiteboard('whiteboard-1', { name: 'New Name' }, freelancerUser)).rejects.toThrow(
      'Freelancers cannot edit whiteboards'
    );
    await expect(whiteboardService.deleteWhiteboard('whiteboard-1', freelancerUser)).rejects.toThrow(
      'Freelancers cannot delete whiteboards'
    );
  });

  it('updates whiteboard name', async () => {
    findById = async () => ({ id: 'whiteboard-1', projectId: 'project-1' });
    const updated = await whiteboardService.updateWhiteboard('whiteboard-1', { name: 'New Name' }, adminUser);
    expect(updated?.id).toBe('whiteboard-1');
  });

  it('returns false when deleting missing whiteboard', async () => {
    findById = async () => null;
    const result = await whiteboardService.deleteWhiteboard('whiteboard-1', adminUser);
    expect(result).toBe(false);
  });
});
