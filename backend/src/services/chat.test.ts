import { describe, it, expect, beforeEach, mock } from 'bun:test';

let findUserChannels: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let findByName: (...args: any[]) => Promise<any> = async () => null;
let createChannel: (...args: any[]) => Promise<any> = async () => ({ id: 'channel-1' });

let findByUserId: (...args: any[]) => Promise<any> = async () => [];
let join: (...args: any[]) => Promise<any> = async () => ({ channelId: 'channel-1', userId: 'user-1', lastReadAt: new Date() });
let findByChannelId: (...args: any[]) => Promise<any> = async () => [];
let addMembers: (...args: any[]) => Promise<any> = async () => {};
let findMembership: (...args: any[]) => Promise<any> = async () => ({ channelId: 'channel-1', userId: 'user-1', lastReadAt: new Date() });

let countUnread: (...args: any[]) => Promise<any> = async () => 0;
let findUserById: (...args: any[]) => Promise<any> = async () => null;

mock.module('../repositories/channel', () => ({
  ChannelRepository: class {},
  channelRepository: {
    findUserChannels: (userId: string) => findUserChannels(userId),
    findById: (channelId: string) => findById(channelId),
    findByName: (name: string) => findByName(name),
    create: (data: any) => createChannel(data),
  },
}));

mock.module('../repositories/channelMember', () => ({
  ChannelMemberRepository: class {},
  channelMemberRepository: {
    findByUserId: (userId: string) => findByUserId(userId),
    join: (channelId: string, userId: string) => join(channelId, userId),
    findByChannelId: (channelId: string) => findByChannelId(channelId),
    addMembers: (channelId: string, userIds: string[], role: string) => addMembers(channelId, userIds, role),
    findMembership: (channelId: string, userId: string) => findMembership(channelId, userId),
  },
}));

mock.module('../repositories/message', () => ({
  MessageRepository: class {},
  messageRepository: {
    countUnread: (channelId: string, lastReadAt: Date) => countUnread(channelId, lastReadAt),
  },
}));

mock.module('../repositories/user', () => ({
  UserRepository: class {},
  userRepository: {
    findById: (userId: string) => findUserById(userId),
  },
}));

mock.module('../repositories/projectMember', () => ({
  ProjectMemberRepository: class {},
  projectMemberRepository: {
    findMembership: async () => null,
  },
}));

mock.module('../repositories/file', () => ({
  FileRepository: class {},
  fileRepository: {
    findByIds: async () => [],
  },
}));

mock.module('../repositories/reaction', () => ({
  ReactionRepository: class {},
  reactionRepository: {
    findByMessageId: async () => [],
  },
}));

mock.module('../collab/chatHub', () => ({
  chatHub: {
    broadcastToChannel: () => {},
    sendToUser: () => {},
  },
}));

mock.module('./file', () => ({
  fileService: {
    markAttached: async () => {},
  },
}));

const { chatService } = await import('./chat');

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

describe('ChatService', () => {
  beforeEach(() => {
    findUserChannels = async () => [];
    findById = async () => null;
    findByName = async () => null;
    createChannel = async () => ({ id: 'channel-1' });
    findByUserId = async () => [];
    join = async () => ({ channelId: 'channel-1', userId: 'user-1', lastReadAt: new Date() });
    findByChannelId = async () => [];
    addMembers = async () => {};
    findMembership = async () => ({ channelId: 'channel-1', userId: 'user-1', lastReadAt: new Date() });
    countUnread = async () => 0;
    findUserById = async () => null;
  });

  it('returns channels with unread counts', async () => {
    findUserChannels = async () => [
      { id: 'channel-1', type: 'project', access: 'public', name: 'general' },
    ];
    findByUserId = async () => [];
    const channels = await chatService.getChannels(memberUser);
    expect(channels[0].id).toBe('channel-1');
    expect(channels[0].unreadCount).toBe(0);
  });

  it('rejects DM creation with self', async () => {
    await expect(chatService.getOrCreateDM('user-1', memberUser)).rejects.toThrow(
      'You cannot create a DM with yourself'
    );
  });

  it('rejects DM creation for missing user', async () => {
    findUserById = async () => null;
    await expect(chatService.getOrCreateDM('user-2', memberUser)).rejects.toThrow('User not found');
  });
});
