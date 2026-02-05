import { channelRepository, messageRepository, channelMemberRepository, userRepository, projectMemberRepository, fileRepository, reactionRepository } from '../repositories';
import { projectService } from './project';
import { fileService } from './file';
import { chatHub } from '../collab/chatHub';
import type { Channel, Message, File } from '../db/schema';
import type { ChannelWithProject } from '../repositories/channel';
import type { MessageWithUser as RepositoryMessage } from '../repositories/message';
import type { User } from '../types';

export interface CreateChannelInput {
  name: string;
  projectId?: string | null;
  type?: 'workspace' | 'project';
  description?: string | null;
}

export interface UpdateChannelInput {
  name?: string;
  description?: string | null;
}

export interface SendMessageInput {
  content?: string;
  attachmentIds?: string[];
}

export interface UpdateMessageInput {
  content: string;
}

export interface ChannelWithState extends ChannelWithProject {
  unreadCount: number;
  lastReadAt: Date | null;
}

export interface FileAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: string;
  url: string;
}

export interface MessageReactionView {
  id: string;
  emoji: string;
  userId: string;
  createdAt: Date;
}

export interface MessageWithUser extends Message {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  attachments?: FileAttachment[];
  reactions?: MessageReactionView[];
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
      description: input.description?.trim() || null,
      type,
    });

    await channelMemberRepository.join(channel.id, user.id);
    return channel;
  }

  async updateChannel(channelId: string, input: UpdateChannelInput, user: User): Promise<ChannelWithProject> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    await this.ensureChannelOwner(channel, user);
    this.ensureActiveChannel(channel);

    const updateData: Partial<Channel> = {};

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        throw new Error('Channel name cannot be empty');
      }
      updateData.name = trimmed;
    }

    if (input.description !== undefined) {
      const trimmed = input.description?.trim() || '';
      updateData.description = trimmed.length > 0 ? trimmed : null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No updates provided');
    }

    await channelRepository.update(channelId, updateData);

    const updated = await channelRepository.findById(channelId);
    if (!updated) {
      throw new Error('Failed to update channel');
    }

    await this.notifyChannelMembers(updated, {
      type: 'channel_updated',
      channel: updated,
    });

    return updated;
  }

  async archiveChannel(channelId: string, user: User): Promise<ChannelWithProject> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    await this.ensureChannelOwner(channel, user);

    if (!channel.archivedAt) {
      await channelRepository.archive(channelId);
    }

    const updated = await channelRepository.findById(channelId);
    if (!updated) {
      throw new Error('Failed to archive channel');
    }

    await this.notifyChannelMembers(updated, {
      type: 'channel_archived',
      channelId: updated.id,
    });

    return updated;
  }

  /**
   * Permanently delete a channel and all its messages.
   * Only channel owner (project owner for project channels, admin for workspace channels) can delete.
   * Cleans up all attached files before deletion.
   */
  async deleteChannel(channelId: string, user: User): Promise<boolean> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    await this.ensureChannelOwner(channel, user);

    // Clean up all files in this channel before cascade delete
    await fileService.cleanupChannelFiles(channelId);

    const deleted = await channelRepository.delete(channelId);

    if (deleted) {
      // Notify all connected clients that the channel was deleted
      chatHub.broadcastToChannel(
        channelId,
        JSON.stringify({
          type: 'channel_deleted',
          channelId,
        })
      );
    }

    return deleted;
  }

  async getMessages(channelId: string, user: User, options?: { before?: Date; limit?: number }): Promise<MessageWithUser[]> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    await this.ensureMembership(channelId, user.id);

    const messages = await messageRepository.findByChannelId(channelId, options);

    return messages.map((message) => this.mapMessage(message));
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
    this.ensureActiveChannel(channel);
    await this.ensureMembership(channelId, user.id);

    const trimmedContent = input.content?.trim() ?? '';
    const attachmentIds = Array.from(new Set(input.attachmentIds ?? []));

    if (!trimmedContent && attachmentIds.length === 0) {
      throw new Error('Message content or attachment is required');
    }

    const attachments = await this.validateAttachments(attachmentIds, user);
    const mentions = trimmedContent ? await this.parseMentions(channel, trimmedContent) : [];

    const message = await messageRepository.create({
      channelId,
      userId: user.id,
      content: trimmedContent,
      mentions,
    });

    if (attachments.length > 0) {
      await messageRepository.addAttachments(message.id, attachments.map((attachment) => attachment.id));
      await fileService.markAttached(attachments.map((attachment) => attachment.id));
    }

    await channelMemberRepository.updateLastRead(channelId, user.id, new Date());

    const messageRecord = await messageRepository.findById(message.id);
    if (!messageRecord) {
      throw new Error('Failed to load message');
    }

    const messageWithUser = this.mapMessage(messageRecord);

    chatHub.broadcastToChannel(
      channelId,
      JSON.stringify({
        type: 'message',
        channelId,
        message: messageWithUser,
      })
    );

    const mentionTargets = mentions.filter((mentionId) => mentionId !== user.id);
    if (mentionTargets.length > 0 && trimmedContent) {
      const { notificationService } = await import('./notification');
      await notificationService.notifyMentions({
        channelId,
        channelName: channel.name,
        authorName: user.name,
        mentions: mentionTargets,
        content: trimmedContent,
      });
    }

    return messageWithUser;
  }

  async updateMessage(channelId: string, messageId: string, input: UpdateMessageInput, user: User): Promise<MessageWithUser> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    this.ensureActiveChannel(channel);
    await this.ensureMembership(channelId, user.id);

    const message = await messageRepository.findById(messageId);
    if (!message || message.channelId !== channelId) {
      throw new Error('Message not found');
    }

    if (message.deletedAt) {
      throw new Error('Message has been deleted');
    }

    if (message.userId !== user.id && user.role !== 'admin') {
      throw new Error('You do not have permission to edit this message');
    }

    const trimmed = input.content.trim();
    if (!trimmed) {
      throw new Error('Message content is required');
    }

    const mentions = await this.parseMentions(channel, trimmed);

    await messageRepository.update(messageId, {
      content: trimmed,
      mentions,
      editedAt: new Date(),
    });

    const updated = await messageRepository.findById(messageId);
    if (!updated) {
      throw new Error('Failed to update message');
    }

    const mapped = this.mapMessage(updated);

    chatHub.broadcastToChannel(
      channelId,
      JSON.stringify({
        type: 'message_updated',
        channelId,
        message: mapped,
      })
    );

    return mapped;
  }

  async deleteMessage(channelId: string, messageId: string, user: User): Promise<MessageWithUser> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    this.ensureActiveChannel(channel);
    await this.ensureMembership(channelId, user.id);

    const message = await messageRepository.findById(messageId);
    if (!message || message.channelId !== channelId) {
      throw new Error('Message not found');
    }

    if (message.userId !== user.id && user.role !== 'admin') {
      throw new Error('You do not have permission to delete this message');
    }

    if (!message.deletedAt) {
      await messageRepository.softDelete(messageId);
    }

    const updated = await messageRepository.findById(messageId);
    if (!updated) {
      throw new Error('Failed to delete message');
    }

    const mapped = this.mapMessage(updated);

    chatHub.broadcastToChannel(
      channelId,
      JSON.stringify({
        type: 'message_deleted',
        channelId,
        message: mapped,
      })
    );

    return mapped;
  }

  async handleTyping(channelId: string, user: User, isTyping: boolean) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) return;
    await this.ensureAccess(channel, user);
    this.ensureActiveChannel(channel);
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

  async addReaction(channelId: string, messageId: string, emoji: string, user: User): Promise<MessageWithUser> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    this.ensureActiveChannel(channel);
    await this.ensureMembership(channelId, user.id);

    const message = await messageRepository.findById(messageId);
    if (!message || message.channelId !== channelId) {
      throw new Error('Message not found');
    }

    if (message.deletedAt) {
      throw new Error('Message has been deleted');
    }

    const cleanedEmoji = emoji.trim();
    if (!cleanedEmoji) {
      throw new Error('Emoji is required');
    }

    await reactionRepository.add({
      messageId,
      userId: user.id,
      emoji: cleanedEmoji,
    });

    const updated = await messageRepository.findById(messageId);
    if (!updated) {
      throw new Error('Failed to update reaction');
    }

    const mapped = this.mapMessage(updated);

    chatHub.broadcastToChannel(
      channelId,
      JSON.stringify({
        type: 'reaction_added',
        channelId,
        message: mapped,
      })
    );

    return mapped;
  }

  async removeReaction(channelId: string, messageId: string, emoji: string, user: User): Promise<MessageWithUser> {
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.ensureAccess(channel, user);
    this.ensureActiveChannel(channel);
    await this.ensureMembership(channelId, user.id);

    const message = await messageRepository.findById(messageId);
    if (!message || message.channelId !== channelId) {
      throw new Error('Message not found');
    }

    if (message.deletedAt) {
      throw new Error('Message has been deleted');
    }

    const cleanedEmoji = emoji.trim();
    if (!cleanedEmoji) {
      throw new Error('Emoji is required');
    }

    await reactionRepository.remove(messageId, user.id, cleanedEmoji);

    const updated = await messageRepository.findById(messageId);
    if (!updated) {
      throw new Error('Failed to update reaction');
    }

    const mapped = this.mapMessage(updated);

    chatHub.broadcastToChannel(
      channelId,
      JSON.stringify({
        type: 'reaction_removed',
        channelId,
        message: mapped,
      })
    );

    return mapped;
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

  private ensureActiveChannel(channel: ChannelWithProject) {
    if (channel.archivedAt) {
      throw new Error('Channel is archived');
    }
  }

  private async ensureChannelOwner(channel: ChannelWithProject, user: User) {
    if (channel.type === 'workspace') {
      if (user.role !== 'admin') {
        throw new Error('Only admins can manage workspace channels');
      }
      return;
    }

    if (!channel.projectId) {
      throw new Error('Channel has no project');
    }

    const isOwner = await projectService.isOwner(channel.projectId, user);
    if (!isOwner) {
      throw new Error('Only project owners can manage this channel');
    }
  }

  private async ensureMembership(channelId: string, userId: string) {
    const membership = await channelMemberRepository.findMembership(channelId, userId);
    if (!membership) {
      await channelMemberRepository.join(channelId, userId);
    }
  }

  private async validateAttachments(attachmentIds: string[], user: User): Promise<File[]> {
    if (attachmentIds.length === 0) return [];

    const attachments = await fileRepository.findByIds(attachmentIds);
    if (attachments.length !== attachmentIds.length) {
      throw new Error('One or more attachments were not found');
    }

    if (user.role !== 'admin') {
      const unauthorized = attachments.find((attachment) => attachment.uploadedBy !== user.id);
      if (unauthorized) {
        throw new Error('You do not have permission to attach one or more files');
      }
    }

    const alreadyAttached = await fileRepository.findAttachedFileIds(attachmentIds);
    if (alreadyAttached.length > 0) {
      throw new Error('One or more attachments are already linked to a message');
    }

    return attachments;
  }

  private mapFile(file: File): FileAttachment {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
      uploadedBy: file.uploadedBy,
      url: `/api/v1/files/${file.id}`,
    };
  }

  private mapMessage(message: RepositoryMessage): MessageWithUser {
    const rawAttachments = message.attachments ?? [];
    const rawReactions = message.reactions ?? [];

    const attachments = message.deletedAt
      ? []
      : rawAttachments.map((attachment) => this.mapFile(attachment.file));

    const reactions: MessageReactionView[] = message.deletedAt
      ? []
      : rawReactions.map((reaction) => ({
          id: reaction.id,
          emoji: reaction.emoji,
          userId: reaction.userId,
          createdAt: reaction.createdAt,
        }));

    const { attachments: _attachments, reactions: _reactions, ...base } = message;
    return {
      ...base,
      attachments,
      reactions,
    };
  }

  private async parseMentions(channel: ChannelWithProject, content: string): Promise<string[]> {
    const matches = content.match(/@([a-zA-Z0-9._-]+)/g) ?? [];
    if (matches.length === 0) return [];

    const handles = Array.from(new Set(matches.map((match) => match.slice(1).toLowerCase())));
    if (handles.length === 0) return [];

    const specialMentions = new Set(['here', 'channel', 'everyone']);
    const hasSpecial = handles.some((handle) => specialMentions.has(handle));
    const normalHandles = handles.filter((handle) => !specialMentions.has(handle));

    let users: { id: string; name: string }[] = [];
    if (channel.type === 'workspace') {
      users = await userRepository.findAll();
    } else if (channel.projectId) {
      const members = await projectMemberRepository.findByProjectId(channel.projectId);
      users = members.map((member) => ({ id: member.user.id, name: member.user.name }));
    }

    const handleMap = new Map(users.map((user) => [normalizeHandle(user.name), user.id]));
    const mentions = new Set<string>();

    if (hasSpecial) {
      for (const user of users) {
        mentions.add(user.id);
      }
    }

    for (const handle of normalHandles) {
      const userId = handleMap.get(handle);
      if (userId) {
        mentions.add(userId);
      }
    }

    return Array.from(mentions);
  }

  private async notifyChannelMembers(channel: ChannelWithProject, payload: Record<string, unknown>) {
    if (channel.type === 'workspace') {
      const users = await userRepository.findAll();
      for (const user of users) {
        chatHub.sendToUser(user.id, JSON.stringify(payload));
      }
      return;
    }

    if (channel.projectId) {
      const members = await projectMemberRepository.findByProjectId(channel.projectId);
      for (const member of members) {
        chatHub.sendToUser(member.user.id, JSON.stringify(payload));
      }
    }
  }
}

export const chatService = new ChatService();
