import { meetingRepository, meetingAttendeeRepository } from '../repositories';
import { projectService } from './project';
import { type Meeting, type NewMeeting } from '../db/schema';
import type { User } from '../types';

export interface CreateMeetingInput {
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  notesMd?: string;
  attendeeIds?: string[];
}

export interface UpdateMeetingInput {
  title?: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notesMd?: string | null;
  attendeeIds?: string[];
}

export class MeetingService {
  async getProjectMeetings(projectId: string, user: User): Promise<Meeting[]> {
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    return meetingRepository.findByProjectId(projectId);
  }

  async getMeeting(meetingId: string, user: User): Promise<Meeting | null> {
    const meeting = await meetingRepository.findById(meetingId);

    if (!meeting) {
      return null;
    }

    const hasAccess = await projectService.hasAccess(meeting.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this meeting');
    }

    return meeting;
  }

  async getMyMeetings(userId: string, user: User): Promise<Meeting[]> {
    if (user.id === userId) {
      return meetingRepository.findByAttendee(userId);
    }

    if (user.role !== 'admin') {
      throw new Error('Admin access required to view other users meetings');
    }

    return meetingRepository.findByAttendee(userId);
  }

  async createMeeting(projectId: string, input: CreateMeetingInput, user: User): Promise<Meeting> {
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    if (!input.title || input.title.trim() === '') {
      throw new Error('Meeting title is required');
    }

    const startTime = this.parseDateTime(input.startTime, 'startTime');
    const endTime = this.parseDateTime(input.endTime, 'endTime');

    if (startTime > endTime) {
      throw new Error('Meeting end time must be after start time');
    }

    const meeting = await meetingRepository.create({
      projectId,
      title: input.title.trim(),
      startTime,
      endTime,
      location: input.location?.trim() || null,
      notesMd: input.notesMd ?? '',
      createdBy: user.id,
    } as NewMeeting);

    const attendeeIds = new Set(input.attendeeIds ?? []);
    attendeeIds.add(user.id);

    await meetingAttendeeRepository.setAttendees(meeting.id, Array.from(attendeeIds));

    const { notificationService } = await import('./notification');
    const invitees = Array.from(attendeeIds).filter((id) => id !== user.id);
    if (invitees.length > 0) {
      await notificationService.notifyMeetingInvite({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        attendeeIds: invitees,
        projectId,
      });
    }

    return meetingRepository.findById(meeting.id) as Promise<Meeting>;
  }

  async updateMeeting(meetingId: string, input: UpdateMeetingInput, user: User): Promise<Meeting | null> {
    const meeting = await meetingRepository.findById(meetingId);

    if (!meeting) {
      return null;
    }

    const hasAccess = await projectService.hasAccess(meeting.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this meeting');
    }

    const updateData: Partial<NewMeeting> = {};

    if (input.title !== undefined) {
      if (input.title.trim() === '') {
        throw new Error('Meeting title cannot be empty');
      }
      updateData.title = input.title.trim();
    }

    if (input.location !== undefined) {
      updateData.location = input.location?.trim() || null;
    }

    if (input.notesMd !== undefined) {
      updateData.notesMd = input.notesMd ?? '';
    }

    const startTime = input.startTime !== undefined
      ? (input.startTime ? this.parseDateTime(input.startTime, 'startTime') : null)
      : null;
    const endTime = input.endTime !== undefined
      ? (input.endTime ? this.parseDateTime(input.endTime, 'endTime') : null)
      : null;

    if (startTime !== null) {
      updateData.startTime = startTime;
    }

    if (endTime !== null) {
      updateData.endTime = endTime;
    }

    const resolvedStart = updateData.startTime ?? meeting.startTime;
    const resolvedEnd = updateData.endTime ?? meeting.endTime;

    if (resolvedStart > resolvedEnd) {
      throw new Error('Meeting end time must be after start time');
    }

    const updated = await meetingRepository.update(meetingId, updateData);

    if (input.attendeeIds) {
      const existingAttendees = await meetingAttendeeRepository.findByMeetingId(meetingId);
      const existingIds = existingAttendees.map((attendee) => attendee.userId);

      const attendeeIds = new Set(input.attendeeIds);
      attendeeIds.add(meeting.createdBy);
      const nextIds = Array.from(attendeeIds);
      await meetingAttendeeRepository.setAttendees(meetingId, nextIds);

      const newInvitees = nextIds.filter((id) => !existingIds.includes(id));
      if (newInvitees.length > 0) {
        const { notificationService } = await import('./notification');
        await notificationService.notifyMeetingInvite({
          meetingId,
          meetingTitle: updateData.title ?? meeting.title,
          attendeeIds: newInvitees,
          projectId: meeting.projectId,
        });
      }
    }

    return updated ? meetingRepository.findById(meetingId) : null;
  }

  async deleteMeeting(meetingId: string, user: User): Promise<boolean> {
    const meeting = await meetingRepository.findById(meetingId);

    if (!meeting) {
      return false;
    }

    const hasAccess = await projectService.hasAccess(meeting.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this meeting');
    }

    return meetingRepository.delete(meetingId);
  }

  private parseDateTime(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid ${field} value`);
    }
    return parsed;
  }
}

export const meetingService = new MeetingService();
