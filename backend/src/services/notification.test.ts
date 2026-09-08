import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { db, type DbTransaction } from '../db/client';

const transaction = {} as DbTransaction;
const spies: Array<{ mockRestore(): void }> = [];
let commitError: Error | null = null;
let committed = false;

let findByUserId: (...args: any[]) => Promise<any> = async () => [];
let markAsRead: (...args: any[]) => Promise<any> = async () => null;
let markAllAsRead: (...args: any[]) => Promise<any> = async () => 0;
let createNotification: (...args: any[]) => Promise<any> = async (data) => ({ id: 'notification-1', ...data });
let createDeliveryIfEnabled: (...args: any[]) => Promise<any> = async () => {};

let sendToUser: (...args: any[]) => void = () => {};

mock.module('../repositories/notification', () => ({
  NotificationRepository: class {},
  notificationRepository: {
    findByUserId: (userId: string, options?: any) => findByUserId(userId, options),
    markAsRead: (id: string, userId: string) => markAsRead(id, userId),
    markAllAsRead: (userId: string) => markAllAsRead(userId),
    create: (data: any, executor: any) => createNotification(data, executor),
    createDeliveryIfEnabled: (notification: any, executor: any) => createDeliveryIfEnabled(notification, executor),
  },
}));

const { NotificationService } = await import('./notification');

describe('NotificationService', () => {
  let notificationService: InstanceType<typeof NotificationService>;

  beforeEach(() => {
    findByUserId = async () => [];
    markAsRead = async () => null;
    markAllAsRead = async () => 0;
    createNotification = async (data) => ({ id: 'notification-1', ...data });
    createDeliveryIfEnabled = async () => {};
    sendToUser = () => {};
    commitError = null;
    committed = false;
    spies.push(spyOn(db, 'transaction').mockImplementation(async (callback) => {
      const result = await callback(transaction);
      if (commitError) throw commitError;
      committed = true;
      return result;
    }));
    notificationService = new NotificationService({
      sendToUser: (userId: string, payload: string) => sendToUser(userId, payload),
    });
  });

  afterEach(() => {
    for (const spy of spies.splice(0).reverse()) spy.mockRestore();
  });

  it('lists notifications', async () => {
    findByUserId = async () => [{ id: 'notification-1' }];
    const list = await notificationService.getNotifications('user-1');
    expect(list).toEqual([{ id: 'notification-1' }] as any);
  });

  it('marks notifications as read', async () => {
    markAsRead = mock(async () => ({ id: 'notification-1', read: true }));
    const result = await notificationService.markAsRead('notification-1', 'user-1');
    expect(result?.read).toBe(true);
    expect(markAsRead).toHaveBeenCalledWith('notification-1', 'user-1');
  });

  it('marks all notifications as read', async () => {
    markAllAsRead = async () => 3;
    const count = await notificationService.markAllAsRead('user-1');
    expect(count).toBe(3);
  });

  it('notifies and sends websocket payload', async () => {
    let sentPayload = '';
    sendToUser = (_userId, payload) => {
      expect(committed).toBe(true);
      sentPayload = payload;
    };

    await notificationService.notify('user-1', 'mention', {
      title: 'Mentioned',
      body: 'Hello',
      link: '/chat',
    });

    expect(sentPayload).toContain('notification');
  });

  it('writes the standalone notification and delivery with the same transaction', async () => {
    createNotification = mock(async (data) => ({ id: 'notification-1', ...data }));
    createDeliveryIfEnabled = mock(async () => {});
    await notificationService.notify('user-1', 'mention', { title: 'Mentioned' });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }), transaction);
    expect(createDeliveryIfEnabled).toHaveBeenCalledWith(expect.objectContaining({ id: 'notification-1' }), transaction);
  });

  it('does not publish a notification when its delivery cannot be enqueued', async () => {
    createDeliveryIfEnabled = async () => { throw new Error('Outbox unavailable'); };
    sendToUser = mock(() => {});
    await expect(notificationService.notify('user-1', 'mention', { title: 'Mentioned' }))
      .rejects.toThrow('Outbox unavailable');
    expect(committed).toBe(false);
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('does not publish a notification when commit fails', async () => {
    commitError = new Error('Commit failed');
    sendToUser = mock(() => {});
    await expect(notificationService.notify('user-1', 'mention', { title: 'Mentioned' }))
      .rejects.toThrow('Commit failed');
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('does not enqueue or publish a duplicate source event', async () => {
    createNotification = async () => null;
    createDeliveryIfEnabled = mock(async () => {});
    sendToUser = mock(() => {});
    await notificationService.notify('user-1', 'mention', { title: 'Mentioned' });
    expect(createDeliveryIfEnabled).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
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

  it('bounds generated titles to the database column length', async () => {
    let persistedTitle = '';
    createNotification = async (data) => {
      persistedTitle = data.title;
      return { id: 'notification-1', ...data };
    };

    await notificationService.notifyAssignment({
      taskId: 'task-1',
      taskTitle: 'x'.repeat(255),
      projectId: 'project-1',
      assigneeIds: ['user-1'],
      assignedBy: 'User',
    });

    expect(persistedTitle).toHaveLength(255);
  });
});
