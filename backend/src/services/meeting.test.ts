import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { db, type DbTransaction } from '../db/client';
import { settingsRepository } from '../repositories/settings';

const transaction = {} as DbTransaction;
const spies: Array<{ mockRestore(): void }> = [];
let commitError: Error | null = null;
let committed = false;
let createNotification: (...args: any[]) => Promise<any> = async (data) => ({ id: 'notification-1', ...data });
let createDelivery: (...args: any[]) => Promise<any> = async () => {};

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let findByAttendee: (...args: any[]) => Promise<any> = async () => [];
let createMeeting: (...args: any[]) => Promise<any> = async (data) => ({ id: 'meeting-1', ...data });
let updateMeeting: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'meeting-1', ...data });
let deleteMeeting: (...args: any[]) => Promise<any> = async () => true;

let setAttendees: (...args: any[]) => Promise<any> = async () => {};
let findAttendees: (...args: any[]) => Promise<any> = async () => [];
let getSetting: (key: string) => Promise<any> = async () => null;


mock.module('../repositories/meeting', () => ({
  MeetingRepository: class {},
  meetingRepository: {
    findByProjectId: (projectId: string) => findByProjectId(projectId),
    findById: (...args: any[]) => findById(...args),
    findByAttendee: (userId: string) => findByAttendee(userId),
    create: (...args: any[]) => createMeeting(...args),
    update: (...args: any[]) => updateMeeting(...args),
    delete: (meetingId: string) => deleteMeeting(meetingId),
  },
}));

mock.module('../repositories/meetingAttendee', () => ({
  MeetingAttendeeRepository: class {},
  meetingAttendeeRepository: {
    setAttendees: (...args: any[]) => setAttendees(...args),
    findByMeetingId: (...args: any[]) => findAttendees(...args),
  },
}));

mock.module('../repositories/notification', () => ({
  NotificationRepository: class {},
  notificationRepository: {
    create: (...args: any[]) => createNotification(...args),
    createDeliveryIfEnabled: (...args: any[]) => createDelivery(...args),
  },
}));

const { meetingService } = await import('./meeting');
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

describe('MeetingService', () => {
  beforeEach(() => {
    findByProjectId = async () => [];
    findById = async () => null;
    findByAttendee = async () => [];
    createMeeting = async (data) => ({ id: 'meeting-1', ...data });
    updateMeeting = async (_id, data) => ({ id: 'meeting-1', ...data });
    deleteMeeting = async () => true;
    setAttendees = async () => {};
    findAttendees = async () => [];
    getSetting = async () => null;
    createNotification = async (data) => ({ id: 'notification-1', ...data });
    createDelivery = async () => {};
    commitError = null;
    committed = false;
    // Preserve the shared repository's other methods for setup and auth tests.
    spies.push(spyOn(settingsRepository, 'get').mockImplementation((key) => getSetting(key)));
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

  it('rejects creating meeting without title', async () => {
    await expect(
      meetingService.createMeeting('project-1', { title: '', startTime: '2024-01-01', endTime: '2024-01-02' }, adminUser)
    ).rejects.toThrow('Meeting title is required');
  });

  it('rejects creating meeting with end before start', async () => {
    await expect(
      meetingService.createMeeting('project-1', { title: 'Meet', startTime: '2024-01-02', endTime: '2024-01-01' }, adminUser)
    ).rejects.toThrow('Meeting end time must be after start time');
  });

  it('rejects meeting mutations for freelancers', async () => {
    findById = async () => ({
      id: 'meeting-1',
      title: 'Meet',
      projectId: 'project-1',
      createdBy: adminUser.id,
      startTime: new Date('2024-01-01T00:00:00.000Z'),
      endTime: new Date('2024-01-01T01:00:00.000Z'),
    });

    await expect(
      meetingService.createMeeting('project-1', { title: 'Meet', startTime: '2024-01-01', endTime: '2024-01-02' }, freelancerUser)
    ).rejects.toThrow('Freelancers cannot create meetings');
    await expect(meetingService.updateMeeting('meeting-1', { title: 'Updated' }, freelancerUser)).rejects.toThrow(
      'Freelancers cannot edit meetings'
    );
    await expect(meetingService.deleteMeeting('meeting-1', freelancerUser)).rejects.toThrow(
      'Freelancers cannot delete meetings'
    );
  });

  it('adds attendees including creator', async () => {
    let attendees: string[] = [];
    setAttendees = async (_meetingId, ids) => {
      attendees = ids;
    };

    await meetingService.createMeeting(
      'project-1',
      { title: 'Meet', startTime: '2024-01-01', endTime: '2024-01-02' },
      adminUser
    );

    expect(attendees).toEqual(expect.arrayContaining([adminUser.id]));
  });

  it('creates invitees and their notifications in the meeting transaction', async () => {
    createMeeting = mock(async (data) => ({ id: 'meeting-1', ...data }));
    setAttendees = mock(async () => {});
    createNotification = mock(async (data) => ({ id: 'notification-1', ...data }));
    createDelivery = mock(async () => {});
    await meetingService.createMeeting('project-1', {
      title: 'Meet', startTime: '2024-01-01', endTime: '2024-01-02', attendeeIds: ['user-2', 'user-2', adminUser.id],
    }, adminUser);
    expect(createMeeting).toHaveBeenCalledWith(expect.objectContaining({ title: 'Meet' }), transaction);
    expect(setAttendees).toHaveBeenCalledWith('meeting-1', ['user-2', adminUser.id], transaction);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-2', type: 'meeting_invite' }), transaction);
    expect(createDelivery).toHaveBeenCalledWith(expect.objectContaining({ id: 'notification-1' }), transaction);
    expect(notificationService.publishMany).toHaveBeenCalledTimes(1);
  });

  it('does not publish invitations when the meeting transaction fails to commit', async () => {
    commitError = new Error('Commit failed');
    await expect(meetingService.createMeeting('project-1', {
      title: 'Meet', startTime: '2024-01-01', endTime: '2024-01-02', attendeeIds: ['user-2'],
    }, adminUser)).rejects.toThrow('Commit failed');
    expect(notificationService.publishMany).not.toHaveBeenCalled();
    expect(activityService.record).not.toHaveBeenCalled();
  });

  it('propagates invitation outbox failure without committing the meeting', async () => {
    createDelivery = async () => { throw new Error('Outbox unavailable'); };
    await expect(meetingService.createMeeting('project-1', {
      title: 'Meet', startTime: '2024-01-01', endTime: '2024-01-02', attendeeIds: ['user-2'],
    }, adminUser)).rejects.toThrow('Outbox unavailable');
    expect(committed).toBe(false);
    expect(notificationService.publishMany).not.toHaveBeenCalled();
  });

  it('generates a JaaS link by default when JaaS is enabled', async () => {
    getSetting = async (key) => {
      const settings: Record<string, unknown> = {
        jaas_enabled: true,
        jaas_app_id: 'vpaas-magic-cookie-test',
        jaas_domain: '8x8.vc',
        jaas_default_provider: true,
      };
      return settings[key] ?? null;
    };

    let updatedLink = '';
    updateMeeting = async (_id, data) => {
      updatedLink = data.link ?? '';
      return { id: 'meeting-1', ...data };
    };

    await meetingService.createMeeting(
      'project-1',
      { title: 'Meet', startTime: '2024-01-01', endTime: '2024-01-02' },
      adminUser
    );

    expect(updatedLink).toBe('https://8x8.vc/vpaas-magic-cookie-test/meet-meetin');
  });

  it('preserves custom meeting links', async () => {
    let createdLink = '';
    createMeeting = async (data) => {
      createdLink = data.link ?? '';
      return { id: 'meeting-1', ...data };
    };

    await meetingService.createMeeting(
      'project-1',
      {
        title: 'Meet',
        startTime: '2024-01-01',
        endTime: '2024-01-02',
        link: 'https://zoom.example/room',
        videoProvider: 'custom',
      },
      adminUser
    );

    expect(createdLink).toBe('https://zoom.example/room');
  });

  it('rejects JaaS meetings when App ID is missing', async () => {
    getSetting = async (key) => (key === 'jaas_enabled' ? true : null);

    await expect(
      meetingService.createMeeting(
        'project-1',
        { title: 'Meet', startTime: '2024-01-01', endTime: '2024-01-02', videoProvider: 'jaas' },
        adminUser
      )
    ).rejects.toThrow('JaaS App ID is not configured');
  });

  it('rejects viewing other users meetings for non-admin', async () => {
    await expect(meetingService.getMyMeetings('user-2', memberUser)).rejects.toThrow(
      'Admin access required to view other users meetings'
    );
  });

  it('allows admin to view other users meetings', async () => {
    findByAttendee = async () => [{ id: 'meeting-2' }];
    const meetings = await meetingService.getMyMeetings('user-2', adminUser);
    expect(meetings).toEqual([{ id: 'meeting-2' }] as any);
  });

  it('returns false when deleting missing meeting', async () => {
    findById = async () => null;
    const result = await meetingService.deleteMeeting('meeting-1', memberUser);
    expect(result).toBe(false);
  });
});
