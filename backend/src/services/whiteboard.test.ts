import { describe, it, expect, beforeEach, mock } from 'bun:test';

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let createWhiteboard: (...args: any[]) => Promise<any> = async (data) => ({ id: 'whiteboard-1', ...data });
let updateWhiteboard: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'whiteboard-1', ...data });
let deleteWhiteboard: (...args: any[]) => Promise<any> = async () => true;

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

const { whiteboardService } = await import('./whiteboard');

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

describe('WhiteboardService', () => {
  beforeEach(() => {
    findByProjectId = async () => [];
    findById = async () => null;
    createWhiteboard = async (data) => ({ id: 'whiteboard-1', ...data });
    updateWhiteboard = async (_id, data) => ({ id: 'whiteboard-1', ...data });
    deleteWhiteboard = async () => true;
  });

  it('rejects creating whiteboard without name', async () => {
    await expect(whiteboardService.createWhiteboard('project-1', { name: '' }, adminUser)).rejects.toThrow(
      'Whiteboard name is required'
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
