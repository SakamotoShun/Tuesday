import { describe, it, expect, beforeEach, mock } from 'bun:test';

let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let findByAttendee: (...args: any[]) => Promise<any> = async () => [];
let createMeeting: (...args: any[]) => Promise<any> = async (data) => ({ id: 'meeting-1', ...data });
let updateMeeting: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'meeting-1', ...data });
let deleteMeeting: (...args: any[]) => Promise<any> = async () => true;

let setAttendees: (...args: any[]) => Promise<any> = async () => {};
let findAttendees: (...args: any[]) => Promise<any> = async () => [];


mock.module('../repositories/meeting', () => ({
  MeetingRepository: class {},
  meetingRepository: {
    findByProjectId: (projectId: string) => findByProjectId(projectId),
    findById: (meetingId: string) => findById(meetingId),
    findByAttendee: (userId: string) => findByAttendee(userId),
    create: (data: any) => createMeeting(data),
    update: (meetingId: string, data: any) => updateMeeting(meetingId, data),
    delete: (meetingId: string) => deleteMeeting(meetingId),
  },
}));

mock.module('../repositories/meetingAttendee', () => ({
  MeetingAttendeeRepository: class {},
  meetingAttendeeRepository: {
    setAttendees: (meetingId: string, attendeeIds: string[]) => setAttendees(meetingId, attendeeIds),
    findByMeetingId: (meetingId: string) => findAttendees(meetingId),
  },
}));

const { meetingService } = await import('./meeting');

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

    expect(attendees).toEqual(expect.arrayContaining(['user-1']));
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
