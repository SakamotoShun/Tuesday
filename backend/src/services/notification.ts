import { chatHub, type ChatHub } from '../collab/chatHub';
import { db, type DbExecutor } from '../db/client';
import {
  NotificationType,
  type Notification,
  type NotificationType as NotificationTypeValue,
} from '../db/schema';
import { notificationRepository } from '../repositories/notification';

export interface MentionNotificationInput {
  channelId: string;
  channelName: string;
  authorName: string;
  mentions: string[];
  content: string;
  sourceEventId?: string;
}

export interface AssignmentNotificationInput {
  taskId: string;
  taskTitle: string;
  assigneeIds: string[];
  assignedBy: string;
  projectId: string;
  sourceEventId?: string;
}

export interface NoticeAssignmentNotificationInput {
  noticeId: string;
  noticeTitle: string;
  assigneeId: string;
  assignedBy: string;
  sourceEventId?: string;
}

export interface MeetingInviteNotificationInput {
  meetingId: string;
  meetingTitle: string;
  attendeeIds: string[];
  projectId?: string | null;
  sourceEventId?: string;
}

export interface ProjectInviteNotificationInput {
  projectId: string;
  projectName: string;
  userId: string;
  invitedBy: string;
  sourceEventId?: string;
}

type NotificationHub = Pick<ChatHub, 'sendToUser'>;

interface NotificationPayload {
  title: string;
  body?: string;
  link?: string;
  templateData?: Record<string, string>;
}

export class NotificationService {
  constructor(private readonly hub: NotificationHub = chatHub) {}

  async getNotifications(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number; cursor?: { createdAt: Date; id: string } },
  ): Promise<Notification[]> {
    return notificationRepository.findByUserId(userId, options);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return notificationRepository.countUnreadByUser(userId);
  }

  async getNotificationPage(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number; cursor?: { createdAt: Date; id: string } },
  ): Promise<{ items: Notification[]; unreadCount: number }> {
    return db.transaction(async (tx) => {
      const [items, unreadCount] = await Promise.all([
        notificationRepository.findByUserId(userId, options, tx),
        notificationRepository.countUnreadByUser(userId, tx),
      ]);
      return { items, unreadCount };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    return notificationRepository.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string): Promise<number> {
    return notificationRepository.markAllAsRead(userId);
  }

  async enqueue(
    userId: string,
    type: NotificationTypeValue,
    payload: NotificationPayload,
    executor: DbExecutor,
    sourceEventId: string = crypto.randomUUID(),
  ): Promise<Notification | null> {
    const notification = await notificationRepository.create({
      userId,
      sourceEventId,
      type,
      title: payload.title.slice(0, 255),
      body: payload.body ?? null,
      link: payload.link ?? null,
      templateVersion: 1,
      templateData: payload.templateData ?? {},
    }, executor);

    if (notification) {
      await notificationRepository.createDeliveryIfEnabled(notification, executor);
    }
    return notification;
  }

  publish(notification: Notification): void {
    this.hub.sendToUser(
      notification.userId,
      JSON.stringify({ type: 'notification', notification }),
    );
  }

  publishMany(notifications: readonly Notification[]): void {
    for (const notification of notifications) this.publish(notification);
  }

  async enqueueMentions(input: MentionNotificationInput, executor: DbExecutor): Promise<Notification[]> {
    const notifications: Notification[] = [];
    const sourceEventId = input.sourceEventId ?? crypto.randomUUID();
    for (const userId of new Set(input.mentions)) {
      const notification = await this.enqueue(userId, NotificationType.MENTION, {
        title: `Mentioned in #${input.channelName}`,
        body: `${input.authorName}: ${input.content}`,
        link: `/chat?channel=${input.channelId}`,
        templateData: { channelName: input.channelName, authorName: input.authorName },
      }, executor, sourceEventId);
      if (notification) notifications.push(notification);
    }
    return notifications;
  }

  async enqueueAssignment(input: AssignmentNotificationInput, executor: DbExecutor): Promise<Notification[]> {
    const notifications: Notification[] = [];
    const sourceEventId = input.sourceEventId ?? crypto.randomUUID();
    for (const userId of new Set(input.assigneeIds)) {
      const notification = await this.enqueue(userId, NotificationType.TASK_ASSIGNMENT, {
        title: `Assigned to task: ${input.taskTitle}`,
        body: `Assigned by ${input.assignedBy}`,
        link: `/projects/${input.projectId}/tasks?task=${input.taskId}`,
        templateData: { taskTitle: input.taskTitle, assignedBy: input.assignedBy },
      }, executor, sourceEventId);
      if (notification) notifications.push(notification);
    }
    return notifications;
  }

  async enqueueNoticeAssignment(input: NoticeAssignmentNotificationInput, executor: DbExecutor): Promise<Notification[]> {
    const notification = await this.enqueue(input.assigneeId, NotificationType.NOTICE_ASSIGNMENT, {
      title: `Assigned to notice: ${input.noticeTitle}`,
      body: `Assigned by ${input.assignedBy}`,
      link: '/',
      templateData: { noticeTitle: input.noticeTitle, assignedBy: input.assignedBy },
    }, executor, input.sourceEventId);
    return notification ? [notification] : [];
  }

  async enqueueMeetingInvite(input: MeetingInviteNotificationInput, executor: DbExecutor): Promise<Notification[]> {
    const notifications: Notification[] = [];
    const sourceEventId = input.sourceEventId ?? crypto.randomUUID();
    const link = input.projectId
      ? `/projects/${input.projectId}/schedule?meeting=${input.meetingId}`
      : `/my-calendar?meeting=${input.meetingId}`;
    for (const userId of new Set(input.attendeeIds)) {
      const notification = await this.enqueue(userId, NotificationType.MEETING_INVITE, {
        title: `Meeting invite: ${input.meetingTitle}`,
        body: 'You have been invited to a meeting',
        link,
        templateData: { meetingTitle: input.meetingTitle },
      }, executor, sourceEventId);
      if (notification) notifications.push(notification);
    }
    return notifications;
  }

  async enqueueProjectInvite(input: ProjectInviteNotificationInput, executor: DbExecutor): Promise<Notification[]> {
    const notification = await this.enqueue(input.userId, NotificationType.PROJECT_INVITE, {
      title: `Added to project: ${input.projectName}`,
      body: `Added by ${input.invitedBy}`,
      link: `/projects/${input.projectId}`,
      templateData: { projectName: input.projectName, invitedBy: input.invitedBy },
    }, executor, input.sourceEventId);
    return notification ? [notification] : [];
  }

  // Standalone callers still commit the notification and its delivery atomically.
  async notify(userId: string, type: NotificationTypeValue, payload: NotificationPayload) {
    const notification = await db.transaction((tx) => this.enqueue(userId, type, payload, tx));
    if (notification) this.publish(notification);
    return notification;
  }

  async notifyMentions(input: MentionNotificationInput) {
    this.publishMany(await db.transaction((tx) => this.enqueueMentions(input, tx)));
  }

  async notifyAssignment(input: AssignmentNotificationInput) {
    this.publishMany(await db.transaction((tx) => this.enqueueAssignment(input, tx)));
  }

  async notifyNoticeAssignment(input: NoticeAssignmentNotificationInput) {
    this.publishMany(await db.transaction((tx) => this.enqueueNoticeAssignment(input, tx)));
  }

  async notifyMeetingInvite(input: MeetingInviteNotificationInput) {
    this.publishMany(await db.transaction((tx) => this.enqueueMeetingInvite(input, tx)));
  }

  async notifyProjectInvite(input: ProjectInviteNotificationInput) {
    this.publishMany(await db.transaction((tx) => this.enqueueProjectInvite(input, tx)));
  }
}

export const notificationService = new NotificationService();
