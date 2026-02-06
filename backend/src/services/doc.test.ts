import { describe, it, expect, beforeEach, mock } from 'bun:test';

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findPersonalDocs: (...args: any[]) => Promise<any> = async () => [];
let findByIdWithParent: (...args: any[]) => Promise<any> = async () => null;
let findChildren: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let createDoc: (...args: any[]) => Promise<any> = async (data) => ({ id: 'doc-1', ...data });
let updateDoc: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'doc-1', ...data });
let deleteDoc: (...args: any[]) => Promise<any> = async () => true;

mock.module('../repositories/doc', () => ({
  DocRepository: class {},
  docRepository: {
    findByProjectId: (projectId: string) => findByProjectId(projectId),
    findPersonalDocs: (userId: string) => findPersonalDocs(userId),
    findByIdWithParent: (docId: string) => findByIdWithParent(docId),
    findChildren: (docId: string) => findChildren(docId),
    findById: (docId: string) => findById(docId),
    create: (data: any) => createDoc(data),
    update: (docId: string, data: any) => updateDoc(docId, data),
    delete: (docId: string) => deleteDoc(docId),
  },
}));

const { docService } = await import('./doc');

const memberUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  role: 'member' as const,
  isDisabled: false,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adminUser = {
  ...memberUser,
  role: 'admin' as const,
};

describe('DocService', () => {
  beforeEach(() => {
    findByProjectId = async () => [];
    findPersonalDocs = async () => [];
    findByIdWithParent = async () => null;
    findChildren = async () => [];
    findById = async () => null;
    createDoc = async (data) => ({ id: 'doc-1', ...data });
    updateDoc = async (_id, data) => ({ id: 'doc-1', ...data });
    deleteDoc = async () => true;
  });

  it('returns doc with children', async () => {
    findByIdWithParent = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: 'user-1' });
    findChildren = async () => [{ id: 'child-1' }];
    const doc = await docService.getDocWithChildren('doc-1', adminUser);
    expect(doc?.children).toEqual([{ id: 'child-1' }] as any);
  });

  it('rejects access to personal doc for non-owner', async () => {
    findByIdWithParent = async () => ({ id: 'doc-1', projectId: null, createdBy: 'user-2' });
    await expect(docService.getDoc('doc-1', memberUser)).rejects.toThrow('Access denied to this doc');
  });

  it('creates project doc with access', async () => {
    let created: any;
    createDoc = async (data) => {
      created = data;
      return { id: 'doc-1', ...data };
    };
    const doc = await docService.createDoc({ title: 'Doc', projectId: 'project-1' }, adminUser);
    expect(doc.id).toBe('doc-1');
    expect(created.createdBy).toBe(adminUser.id);
  });

  it('rejects doc creation without title', async () => {
    await expect(docService.createDoc({ title: '' }, memberUser)).rejects.toThrow('Doc title is required');
  });

  it('rejects parent doc from another project', async () => {
    findById = async () => ({ id: 'parent-1', projectId: 'project-2' });
    await expect(
      docService.createDoc({ title: 'Doc', projectId: 'project-1', parentId: 'parent-1' }, adminUser)
    ).rejects.toThrow('Parent doc must be in the same project');
  });

  it('rejects updating doc with self as parent', async () => {
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: 'user-1' });
    await expect(docService.updateDoc('doc-1', { parentId: 'doc-1' }, adminUser)).rejects.toThrow(
      'Doc cannot be its own parent'
    );
  });

  it('allows admin to delete personal docs', async () => {
    findById = async () => ({ id: 'doc-1', projectId: null, createdBy: 'user-2' });
    const ok = await docService.deleteDoc('doc-1', adminUser);
    expect(ok).toBe(true);
  });

  it('deletes project doc for admin', async () => {
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: 'user-1' });
    const result = await docService.deleteDoc('doc-1', adminUser);
    expect(result).toBe(true);
  });
});
