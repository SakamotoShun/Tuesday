import { channelRepository, messageRepository, channelMemberRepository, userRepository, projectMemberRepository } from '../repositories';
import { projectService } from './project';
import { chatHub } from '../collab/chatHub';
import type { Channel, Message } from '../db/schema';
import type { ChannelWithProject } from '../repositories/channel';
import type { User } from '../types';

export interface CreateChannelInput {
  name: string;
  projectId?: string | null;
  type?: 'workspace' | 'project';
}

export interface SendMessageInput {
  content: string;
}

export interface ChannelWithState extends ChannelWithProject {
  unreadCount: number;
  lastReadAt: Date | null;
}

export interface MessageWithUser extends Message {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

const normalizeHandle = (name: string) => name.toLowerCase().replace(/\s+/g, '');

export class ChatService {
  async getChannels(user: User): Promise<ChannelWithState[]> {
    const channels = user.role === 'admin'
      ? await channelRepository.findAll()
      : await channelRepository.findUserChannels(user.id);
    const memberships = await channelMemberRepository.findByUserId(user.id);
    const membershipMap = new Map(memberships.map((membership) => [membership.channelId, membership]));

    const results: ChannelWithState[] = [];

    for (const channel of channels) {
      let membership = membershipMap.get(channel.id) ?? null;
      if (!membership) {
        membership = await channelMemberRepository.join(channel.id, user.id);
      }
      const unreadCount = await messageRepository.countUnread(channel.id, membership.lastReadAt);
      results.push({
        ...channel,
        unreadCount,
        lastReadAt: membership.lastReadAt,
      });
    }

    return results;
  }

  async getChannel(channelId: string, user: User): Promise<ChannelWithProject | null> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) return null;
    await this.ensureAccess(channel, user);
    return channel;
  }

  async createChannel(input: CreateChannelInput, user: User): Promise<Channel> {
    if (!input.name || input.name.trim() === '') {
      throw new Error('Channel name is required');
    }

    const type = input.type ?? (input.projectId ? 'project' : 'workspace');

    if (type === 'workspace' && user.role !== 'admin') {
      throw new Error('Only admins can create workspace channels');
    }

    if (type === 'project') {
      if (!input.projectId) {
        throw new Error('Project ID is required for project channels');
      }
      const hasAccess = await projectService.hasAccess(input.projectId, user);
      if (!hasAccess) {
        throw new Error('Access denied to this project');
      }
    }

    const channel = await channelRepository.create({
      name: input.name.trim(),
      projectId: input.projectId ?? null,
      type,
    });

    await channelMemberRepository.join(channel.id, user.id);
    return channel;
  }

  async getMessages(channelId: string, user: User, options?: { before?: Date; limit?: number }): Promise<MessageWithUser[]> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    await this.ensureMembership(channelId, user.id);

    const messages = await messageRepository.findByChannelId(channelId, options);

    return messages as MessageWithUser[];
  }

  async markAsRead(channelId: string, user: User): Promise<boolean> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }
    await this.ensureAccess(channel, user);
    await this.ensureMembership(channelId, user.id);
    await channelMemberRepository.updateLastRead(channelId, user.id, new Date());
    return true;
  }

  async sendMessage(channelId: string, input: SendMessageInput, user: User): Promise<MessageWithUser> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    await this.ensureMembership(channelId, user.id);

    if (!input.content || input.content.trim() === '') {
      throw new Error('Message content is required');
    }

    const mentions = await this.parseMentions(channel, input.content);

    const message = await messageRepository.create({
      channelId,
      userId: user.id,
      content: input.content.trim(),
      mentions,
    });

    await channelMemberRepository.updateLastRead(channelId, user.id, new Date());

    const messageWithUser: MessageWithUser = {
      ...message,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
      },
    };

    chatHub.broadcastToChannel(
      channelId,
      JSON.stringify({
        type: 'message',
        channelId,
        message: messageWithUser,
      })
    );

    const mentionTargets = mentions.filter((mentionId) => mentionId !== user.id);
    if (mentionTargets.length > 0) {
      const { notificationService } = await import('./notification');
      await notificationService.notifyMentions({
        channelId,
        channelName: channel.name,
        authorName: user.name,
        mentions: mentionTargets,
        content: input.content.trim(),
      });
    }

    return messageWithUser;
  }

  async handleTyping(channelId: string, user: User, isTyping: boolean) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) return;
    await this.ensureAccess(channel, user);
    chatHub.broadcastToChannel(
      channelId,
      JSON.stringify({
        type: 'typing',
        channelId,
        user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null },
        isTyping,
      }),
      user.id
    );
  }

  private async ensureAccess(channel: ChannelWithProject, user: User) {
    if (channel.type === 'workspace') {
      return;
    }

    if (!channel.projectId) {
      throw new Error('Channel has no project');
    }

    const hasAccess = await projectService.hasAccess(channel.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this channel');
    }
  }

  private async ensureMembership(channelId: string, userId: string) {
    const membership = await channelMemberRepository.findMembership(channelId, userId);
    if (!membership) {
      await channelMemberRepository.join(channelId, userId);
    }
  }

  private async parseMentions(channel: ChannelWithProject, content: string): Promise<string[]> {
    const matches = content.match(/@([a-zA-Z0-9._-]+)/g) ?? [];
    if (matches.length === 0) return [];

    const handles = Array.from(new Set(matches.map((match) => match.slice(1).toLowerCase())));
    if (handles.length === 0) return [];

    let users: { id: string; name: string }[] = [];
    if (channel.type === 'workspace') {
      users = await userRepository.findAll();
    } else if (channel.projectId) {
      const members = await projectMemberRepository.findByProjectId(channel.projectId);
      users = members.map((member) => ({ id: member.user.id, name: member.user.name }));
    }

    const handleMap = new Map(users.map((user) => [normalizeHandle(user.name), user.id]));
    const mentions: string[] = [];
    for (const handle of handles) {
      const userId = handleMap.get(handle);
      if (userId) {
        mentions.push(userId);
      }
    }

    return Array.from(new Set(mentions));
  }
}

export const chatService = new ChatService();
