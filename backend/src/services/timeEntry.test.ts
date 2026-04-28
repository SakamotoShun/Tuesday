import { beforeEach, describe, expect, it, mock } from 'bun:test';

let upsertTimeEntry: (...args: any[]) => Promise<any> = async (data) => ({ id: 'entry-1', ...data });
let findTimeEntryById: (...args: any[]) => Promise<any> = async () => null;
let deleteTimeEntry: (...args: any[]) => Promise<any> = async () => true;
let findByUserAndDateRange: (...args: any[]) => Promise<any> = async () => [];
let hasProjectAccess: (...args: any[]) => Promise<any> = async () => true;

mock.module('../repositories/timeEntry', () => ({
  TimeEntryRepository: class {},
  timeEntryRepository: {
    upsert: (data: any) => upsertTimeEntry(data),
    findById: (id: string) => findTimeEntryById(id),
    delete: (id: string) => deleteTimeEntry(id),
    findByUserAndDateRange: (userId: string, start: string, end: string) => findByUserAndDateRange(userId, start, end),
  },
}));

mock.module('../repositories/projectMember', () => ({
  ProjectMemberRepository: class {},
  projectMemberRepository: {},
}));

mock.module('../repositories/teamMember', () => ({
  TeamMemberRepository: class {},
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

  describe('getWeekDate (UTC consistency)', () => {
    // Tests that dates are computed in UTC so the output is stable regardless of
    // server timezone. The pre-fix code used local Date methods, which shifted the
    // date string by the server's UTC offset when crossing midnight.
    const getWeekDate = (week: number, year: number) =>
      (timeEntryService as any).getWeekDate(week, year);

    it('week 1 of 2023 starts on Monday 2023-01-02', () => {
      // 2023-01-01 is a Sunday; ISO week 1 therefore starts 2023-01-02.
      const { start, end } = getWeekDate(1, 2023);
      expect(start).toBe('2023-01-02');
      expect(end).toBe('2023-01-08');
    });

    it('week 1 of 2024 starts on Monday 2024-01-01', () => {
      // 2024-01-01 is a Monday — first day IS the week start.
      const { start, end } = getWeekDate(1, 2024);
      expect(start).toBe('2024-01-01');
      expect(end).toBe('2024-01-07');
    });

    it('end date is always 6 days after start', () => {
      for (const [week, year] of [[1, 2023], [26, 2023], [52, 2022]] as const) {
        const { start, end } = getWeekDate(week, year);
        const diff = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
        expect(diff).toBe(6);
      }
    });
  });
});
