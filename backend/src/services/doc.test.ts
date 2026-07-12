import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findPersonalDocs: (...args: any[]) => Promise<any> = async () => [];
let findByIdWithParent: (...args: any[]) => Promise<any> = async () => null;
let findChildren: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let hasUserAccessToDoc: (...args: any[]) => Promise<any> = async () => false;
let listDocShares: (...args: any[]) => Promise<any> = async () => [];
let replaceDocShares: (...args: any[]) => Promise<any> = async () => [];
let findUserById: (...args: any[]) => Promise<any> = async () => null;
let createDoc: (...args: any[]) => Promise<any> = async (data) => ({ id: 'doc-1', ...data });
let updateDoc: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'doc-1', ...data });
let updateDocIfVersion: (...args: any[]) => Promise<any> = async (_id, _version, data) => ({ id: 'doc-1', version: 2, ...data });
let updateDocContent: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'doc-1', ...data });
let updateDocContentIfVersion: (...args: any[]) => Promise<any> = async (_id, _version, data) => ({ id: 'doc-1', version: 2, ...data });
let deleteDoc: (...args: any[]) => Promise<any> = async () => true;
let findDocShareLink: (...args: any[]) => Promise<any> = async () => null;
let findShareLinkByToken: (...args: any[]) => Promise<any> = async () => null;
let upsertDocShareLink: (...args: any[]) => Promise<any> = async () => null;
let deleteDocShareLink: (...args: any[]) => Promise<any> = async () => 0;

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
    updateIfVersion: (docId: string, expectedVersion: number, data: any) => updateDocIfVersion(docId, expectedVersion, data),
    updateContentAndResetCollab: (docId: string, data: any) => updateDocContent(docId, data),
    updateContentIfVersionAndResetCollab: (docId: string, expectedVersion: number, data: any) => updateDocContentIfVersion(docId, expectedVersion, data),
    delete: (docId: string) => deleteDoc(docId),
  },
}));

mock.module('../repositories/docShare', () => ({
  DocShareRepository: class {},
  docShareRepository: {
    hasUserAccess: (docId: string, userId: string) => hasUserAccessToDoc(docId, userId),
    findByDocId: (docId: string) => listDocShares(docId),
    replaceShares: (docId: string, userIds: string[], sharedBy: string) => replaceDocShares(docId, userIds, sharedBy),
  },
}));

mock.module('../repositories/user', () => {
  class MockUserRepository {
    findById(userId: string) {
      return findUserById(userId);
    }

    findByEmail() {
      return Promise.resolve(null);
    }

    create(data: any) {
      return Promise.resolve({ id: 'user-1', ...data });
    }

    update(id: string, data: any) {
      return Promise.resolve({ id, ...data });
    }

    count() {
      return Promise.resolve(0);
    }

    findAll() {
      return Promise.resolve([]);
    }
  }

  return {
    UserRepository: MockUserRepository,
    userRepository: new MockUserRepository(),
  };
});

mock.module('../repositories/sharedLink', () => ({
  SharedLinkRepository: class {},
  sharedLinkRepository: {
    findDocLink: (docId: string) => findDocShareLink(docId),
    findByToken: (token: string) => findShareLinkByToken(token),
    upsertDocViewLink: (docId: string, token: string, createdBy: string) => upsertDocShareLink(docId, token, createdBy),
    deleteDocLink: (docId: string) => deleteDocShareLink(docId),
  },
}));

const { docService } = await import('./doc');
const { activityService } = await import('./activity');
const originalRecord = activityService.record.bind(activityService);

const memberUser = {
  id: '11111111-1111-4111-8111-111111111111',
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

const freelancerUser = {
  ...memberUser,
  role: 'freelancer' as const,
};

describe('DocService', () => {
  beforeEach(() => {
    findByProjectId = async () => [];
    findPersonalDocs = async () => [];
    findByIdWithParent = async () => null;
    findChildren = async () => [];
    findById = async () => null;
    hasUserAccessToDoc = async () => false;
    listDocShares = async () => [];
    replaceDocShares = async () => [];
    findUserById = async () => null;
    createDoc = async (data) => ({ id: 'doc-1', ...data });
    updateDoc = async (_id, data) => ({ id: 'doc-1', ...data });
    updateDocIfVersion = async (_id, _version, data) => ({ id: 'doc-1', projectId: 'project-1', title: 'Doc', version: 2, ...data });
    updateDocContent = async (_id, data) => ({ id: 'doc-1', ...data });
    updateDocContentIfVersion = async (_id, _version, data) => ({ id: 'doc-1', projectId: 'project-1', title: 'Doc', version: 2, ...data });
    deleteDoc = async () => true;
    findDocShareLink = async () => null;
    findShareLinkByToken = async () => null;
    upsertDocShareLink = async () => null;
    deleteDocShareLink = async () => 0;
    activityService.record = async () => {};
  });

  afterEach(() => {
    activityService.record = originalRecord;
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

  it('allows shared access to personal doc', async () => {
    findByIdWithParent = async () => ({ id: 'doc-1', projectId: null, createdBy: 'user-2' });
    hasUserAccessToDoc = async () => true;
    const doc = await docService.getDoc('doc-1', memberUser);
    expect(doc?.id).toBe('doc-1');
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

  it('creates docs from markdown source', async () => {
    let created: any;
    createDoc = async (data) => {
      created = data;
      return { id: 'doc-1', ...data };
    };

    await docService.createDoc({ title: 'Doc', projectId: 'project-1', source: '# Imported', sourceFormat: 'markdown' }, adminUser);

    expect(created.content[0].type).toBe('heading');
    expect(created.searchText).toContain('Imported');
  });

  it('rejects ambiguous raw blocks and source input', async () => {
    await expect(
      docService.createDoc({
        title: 'Doc',
        projectId: 'project-1',
        content: [{ type: 'paragraph', content: [] }],
        source: '# Imported',
      }, adminUser)
    ).rejects.toThrow('Provide either content/blocks or source');
  });

  it('rejects doc creation without title', async () => {
    await expect(docService.createDoc({ title: '' }, memberUser)).rejects.toThrow('Doc title is required');
  });

  it('rejects doc creation and editing for freelancers', async () => {
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: 'user-1' });

    await expect(docService.createDoc({ title: 'Doc', projectId: 'project-1' }, freelancerUser)).rejects.toThrow(
      'Freelancers cannot create docs'
    );
    await expect(docService.updateDoc('doc-1', { title: 'Updated' }, freelancerUser)).rejects.toThrow(
      'Freelancers cannot edit docs'
    );
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

  it('creates child docs from a doc parent', async () => {
    let created: any;
    findById = async () => ({ id: 'parent-1', projectId: 'project-1', createdBy: adminUser.id });
    createDoc = async (data) => {
      created = data;
      return { id: 'doc-1', version: 1, ...data };
    };

    const doc = await docService.createDocFromParent(
      { type: 'doc', id: 'parent-1' },
      { title: 'Child', blocks: [{ id: 'block-1', type: 'paragraph', content: [] }] },
      adminUser
    );

    expect(doc.id).toBe('doc-1');
    expect(created.projectId).toBe('project-1');
    expect(created.parentId).toBe('parent-1');
  });

  it('updates doc title with expected version', async () => {
    let version: number | undefined;
    let updateData: any;
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: adminUser.id });
    updateDocIfVersion = async (_id, expectedVersion, data) => {
      version = expectedVersion;
      updateData = data;
      return { id: 'doc-1', title: data.title, projectId: 'project-1', version: 3 };
    };

    const doc = await docService.updateDocTitle('doc-1', ' Updated ', 2, adminUser);

    expect(doc?.version).toBe(3);
    expect(version).toBe(2);
    expect(updateData.title).toBe('Updated');
  });

  it('rejects stale doc title updates', async () => {
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: adminUser.id });
    updateDocIfVersion = async () => null;

    await expect(docService.updateDocTitle('doc-1', 'Updated', 1, adminUser)).rejects.toThrow(
      'Conflict: doc version changed'
    );
  });

  it('appends doc blocks after a root block', async () => {
    let updateData: any;
    findById = async () => ({
      id: 'doc-1',
      projectId: 'project-1',
      createdBy: adminUser.id,
      content: [
        { id: 'a', type: 'paragraph', content: [] },
        { id: 'c', type: 'paragraph', content: [] },
      ],
    });
    updateDocContentIfVersion = async (_id, _expectedVersion, data) => {
      updateData = data;
      return { id: 'doc-1', title: 'Doc', projectId: 'project-1', version: 2, ...data };
    };

    const doc = await docService.appendDocBlocks(
      'doc-1',
      [{ id: 'b', type: 'paragraph', content: [] }],
      1,
      adminUser,
      { type: 'after_block', afterBlockId: 'a' }
    );

    expect(doc?.version).toBe(2);
    expect(updateData.content.map((block: any) => block.id)).toEqual(['a', 'b', 'c']);
  });

  it('appends docs from html source', async () => {
    let updateData: any;
    findById = async () => ({
      id: 'doc-1',
      projectId: 'project-1',
      createdBy: adminUser.id,
      content: [{ id: 'a', type: 'paragraph', content: [] }],
    });
    updateDocContentIfVersion = async (_id, _expectedVersion, data) => {
      updateData = data;
      return { id: 'doc-1', title: 'Doc', projectId: 'project-1', version: 2, ...data };
    };

    await docService.appendDocSource('doc-1', '<h2>Section</h2>', 'html', 1, adminUser);

    expect(updateData.content.map((block: any) => block.type)).toEqual(['paragraph', 'heading']);
    expect(updateData.searchText).toContain('Section');
  });

  it('releases the content mutation reservation after an append conflict', async () => {
    findById = async () => ({
      id: 'doc-conflict',
      projectId: 'project-1',
      createdBy: adminUser.id,
      content: [],
    });
    updateDocContentIfVersion = async () => null;

    await expect(
      docService.appendDocBlocks('doc-conflict', [{ id: 'a', type: 'paragraph', content: [] }], 1, adminUser)
    ).rejects.toThrow('Conflict: doc version changed');

    const { docCollabHub } = await import('../collab/hub');
    const release = docCollabHub.reserveContentMutation('doc-conflict');
    expect(release).toBeFunction();
    release?.();
  });

  it('uses the collaboration-reset path only for content updates', async () => {
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: adminUser.id });
    let ordinaryUpdates = 0;
    let contentUpdates = 0;
    updateDoc = async (_id, data) => {
      ordinaryUpdates += 1;
      return { id: 'doc-1', ...data };
    };
    updateDocContent = async (_id, data) => {
      contentUpdates += 1;
      return { id: 'doc-1', ...data };
    };

    await docService.updateDoc('doc-1', { title: 'Renamed' }, adminUser);
    await docService.updateDoc('doc-1', { content: [{ id: 'a', type: 'paragraph', content: [] }] }, adminUser);

    expect(ordinaryUpdates).toBe(1);
    expect(contentUpdates).toBe(1);
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

  it('rejects freelancer from deleting docs', async () => {
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: 'user-1' });
    await expect(docService.deleteDoc('doc-1', freelancerUser)).rejects.toThrow(
      'Freelancers cannot delete docs'
    );
  });

  it('rejects freelancer from managing doc shares', async () => {
    findById = async () => ({ id: 'doc-1', projectId: 'project-1', createdBy: 'user-1' });

    await expect(docService.updateDocShares('doc-1', ['user-2'], freelancerUser)).rejects.toThrow(
      'Access denied to manage doc shares'
    );
    await expect(docService.createDocPublicShareLink('doc-1', freelancerUser)).rejects.toThrow(
      'Access denied to manage doc shares'
    );
    await expect(docService.deleteDocPublicShareLink('doc-1', freelancerUser)).rejects.toThrow(
      'Access denied to manage doc shares'
    );
  });
});
