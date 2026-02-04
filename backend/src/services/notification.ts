import { notificationRepository } from '../repositories';
import { chatHub } from '../collab/chatHub';
import type { Notification } from '../db/schema';

export type NotificationType = 'mention' | 'assignment' | 'meeting_invite' | 'project_invite';

export interface MentionNotificationInput {
  channelId: string;
  channelName: string;
  authorName: string;
  mentions: string[];
  content: string;
}

export interface AssignmentNotificationInput {
  taskId: string;
  taskTitle: string;
  assigneeIds: string[];
  assignedBy: string;
  projectId: string;
}

export interface MeetingInviteNotificationInput {
  meetingId: string;
  meetingTitle: string;
  attendeeIds: string[];
  projectId: string;
}

export interface ProjectInviteNotificationInput {
  projectId: string;
  projectName: string;
  userId: string;
  invitedBy: string;
}

export class NotificationService {
  async getNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
    return notificationRepository.findByUserId(userId, options);
  }

  async markAsRead(id: string): Promise<Notification | null> {
    return notificationRepository.markAsRead(id);
  }

  async markAllAsRead(userId: string): Promise<number> {
    return notificationRepository.markAllAsRead(userId);
  }

  async notify(userId: string, type: NotificationType, payload: { title: string; body?: string; link?: string }) {
    const notification = await notificationRepository.create({
      userId,
      type,
      title: payload.title,
      body: payload.body ?? null,
      link: payload.link ?? null,
    });

    chatHub.sendToUser(userId, JSON.stringify({ type: 'notification', notification }));

    return notification;
  }

  async notifyMentions(input: MentionNotificationInput) {
    const deduped = Array.from(new Set(input.mentions));
    await Promise.all(
      deduped.map((userId) =>
        this.notify(userId, 'mention', {
          title: `Mentioned in #${input.channelName}`,
          body: `${input.authorName}: ${input.content}`,
          link: `/chat?channel=${input.channelId}`,
        })
      )
    );
  }

  async notifyAssignment(input: AssignmentNotificationInput) {
    const deduped = Array.from(new Set(input.assigneeIds));
    await Promise.all(
      deduped.map((userId) =>
        this.notify(userId, 'assignment', {
          title: `Assigned to task: ${input.taskTitle}`,
          body: `Assigned by ${input.assignedBy}`,
          link: `/projects/${input.projectId}/tasks?task=${input.taskId}`,
        })
      )
    );
  }

  async notifyMeetingInvite(input: MeetingInviteNotificationInput) {
    const deduped = Array.from(new Set(input.attendeeIds));
    await Promise.all(
      deduped.map((userId) =>
        this.notify(userId, 'meeting_invite', {
          title: `Meeting invite: ${input.meetingTitle}`,
          body: 'You have been invited to a meeting',
          link: `/projects/${input.projectId}/schedule?meeting=${input.meetingId}`,
        })
      )
    );
  }

  async notifyProjectInvite(input: ProjectInviteNotificationInput) {
    await this.notify(input.userId, 'project_invite', {
      title: `Added to project: ${input.projectName}`,
      body: `Added by ${input.invitedBy}`,
      link: `/projects/${input.projectId}`,
    });
  }
}

export const notificationService = new NotificationService();
