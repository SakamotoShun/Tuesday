import { beforeEach, describe, expect, it, mock } from 'bun:test';

let upsertTimeEntry: (...args: any[]) => Promise<any> = async (data) => ({ id: 'entry-1', ...data });
let hasProjectAccess: (...args: any[]) => Promise<any> = async () => true;

mock.module('../repositories', () => ({
  timeEntryRepository: {
    upsert: (data: any) => upsertTimeEntry(data),
  },
  projectMemberRepository: {},
  teamMemberRepository: {},
}));

mock.module('./project', () => ({
  projectService: {
    hasAccess: (projectId: string, user: any) => hasProjectAccess(projectId, user),
  },
}));

const { timeEntryService } = await import('./timeEntry');

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

const freelancerUser = {
  ...memberUser,
  role: 'freelancer' as const,
};

describe('TimeEntryService', () => {
  beforeEach(() => {
    upsertTimeEntry = async (data) => ({ id: 'entry-1', ...data });
    hasProjectAccess = async () => true;
  });

  it('allows freelancers to upsert project-linked entries', async () => {
    const entry = await timeEntryService.upsertEntry(
      freelancerUser.id,
      { projectId: 'project-1', date: '2026-04-28', hours: 4 },
      freelancerUser
    );

    expect(entry.projectId).toBe('project-1');
  });

  it('rejects freelancer misc entries', async () => {
    await expect(
      timeEntryService.upsertEntry(
        freelancerUser.id,
        { projectId: null, date: '2026-04-28', hours: 4 },
        freelancerUser
      )
    ).rejects.toThrow('Freelancers must log time against a project');
  });

  it('rejects entries for inaccessible projects', async () => {
    hasProjectAccess = async () => false;
    await expect(
      timeEntryService.upsertEntry(
        memberUser.id,
        { projectId: 'project-1', date: '2026-04-28', hours: 4 },
        memberUser
      )
    ).rejects.toThrow('Access denied to this project');
  });
});
