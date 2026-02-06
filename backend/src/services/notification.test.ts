import { describe, it, expect, beforeEach, mock } from 'bun:test';

let findByUserId: (...args: any[]) => Promise<any> = async () => [];
let markAsRead: (...args: any[]) => Promise<any> = async () => null;
let markAllAsRead: (...args: any[]) => Promise<any> = async () => 0;
let createNotification: (...args: any[]) => Promise<any> = async (data) => ({ id: 'notification-1', ...data });

let sendToUser: (...args: any[]) => void = () => {};

mock.module('../repositories/notification', () => ({
  NotificationRepository: class {},
  notificationRepository: {
    findByUserId: (userId: string, options?: any) => findByUserId(userId, options),
    markAsRead: (id: string) => markAsRead(id),
    markAllAsRead: (userId: string) => markAllAsRead(userId),
    create: (data: any) => createNotification(data),
  },
}));

mock.module('../collab/chatHub', () => ({
  chatHub: {
    sendToUser: (userId: string, payload: string) => sendToUser(userId, payload),
  },
}));

const { notificationService } = await import('./notification');

describe('NotificationService', () => {
  beforeEach(() => {
    findByUserId = async () => [];
    markAsRead = async () => null;
    markAllAsRead = async () => 0;
    createNotification = async (data) => ({ id: 'notification-1', ...data });
    sendToUser = () => {};
  });

  it('lists notifications', async () => {
    findByUserId = async () => [{ id: 'notification-1' }];
    const list = await notificationService.getNotifications('user-1');
    expect(list).toEqual([{ id: 'notification-1' }] as any);
  });

  it('marks notifications as read', async () => {
    markAsRead = async () => ({ id: 'notification-1', read: true });
    const result = await notificationService.markAsRead('notification-1');
    expect(result?.read).toBe(true);
  });

  it('marks all notifications as read', async () => {
    markAllAsRead = async () => 3;
    const count = await notificationService.markAllAsRead('user-1');
    expect(count).toBe(3);
  });

  it('notifies and sends websocket payload', async () => {
    let sentPayload = '';
    sendToUser = (_userId, payload) => {
      sentPayload = payload;
    };

    await notificationService.notify('user-1', 'mention', {
      title: 'Mentioned',
      body: 'Hello',
      link: '/chat',
    });

    expect(sentPayload).toContain('notification');
  });

  it('dedupes mentions', async () => {
    let notifyCount = 0;
    createNotification = async (data) => {
      notifyCount += 1;
      return { id: `notification-${notifyCount}`, ...data };
    };

    await notificationService.notifyMentions({
      channelId: 'channel-1',
      channelName: 'general',
      authorName: 'Author',
      mentions: ['user-1', 'user-1', 'user-2'],
      content: 'Hello',
    });

    expect(notifyCount).toBe(2);
  });
});
