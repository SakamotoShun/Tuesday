import { beforeEach, describe, expect, it, mock } from 'bun:test';

let upsertTimeEntry: (...args: any[]) => Promise<any> = async (data) => ({ id: 'entry-1', ...data });
let findTimeEntryById: (...args: any[]) => Promise<any> = async () => null;
let deleteTimeEntry: (...args: any[]) => Promise<any> = async () => true;
let findByUserAndDateRange: (...args: any[]) => Promise<any> = async () => [];
let hasProjectAccess: (...args: any[]) => Promise<any> = async () => true;

mock.module('../repositories', () => ({
  timeEntryRepository: {
    upsert: (data: any) => upsertTimeEntry(data),
    findById: (id: string) => findTimeEntryById(id),
    delete: (id: string) => deleteTimeEntry(id),
    findByUserAndDateRange: (userId: string, start: string, end: string) => findByUserAndDateRange(userId, start, end),
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
    findTimeEntryById = async () => null;
    deleteTimeEntry = async () => true;
    findByUserAndDateRange = async () => [];
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
    ).rejects.toThrow('Freelancers cannot log unassigned time');
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

  it('getMyWeeklyTimesheet returns entries for the requesting user', async () => {
    let queriedUserId = '';
    findByUserAndDateRange = async (userId) => {
      queriedUserId = userId;
      return [];
    };

    const result = await timeEntryService.getMyWeeklyTimesheet(memberUser, '2026-04-28');
    expect(queriedUserId).toBe(memberUser.id);
    expect(result.weekStart).toBe('2026-04-28');
  });

  it('deleteEntry rejects non-owner user', async () => {
    findTimeEntryById = async () => ({ id: 'e-1', userId: 'other-user' });

    await expect(
      timeEntryService.deleteEntry(memberUser, 'e-1')
    ).rejects.toThrow('You can only delete your own time entries');
  });

  it('deleteEntry allows owner to delete their own entry', async () => {
    let deletedId = '';
    findTimeEntryById = async () => ({ id: 'e-1', userId: memberUser.id });
    deleteTimeEntry = async (id) => { deletedId = id; return true; };

    const ok = await timeEntryService.deleteEntry(memberUser, 'e-1');
    expect(ok).toBe(true);
    expect(deletedId).toBe('e-1');
  });
});
