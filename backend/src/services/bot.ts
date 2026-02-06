import { randomBytes, timingSafeEqual } from 'crypto';
import { botRepository, botChannelMemberRepository, channelRepository, messageRepository } from '../repositories';
import { chatService } from './chat';
import type { Bot, NewBot } from '../db/schema';
import type { User } from '../types';

interface WebhookMessageInput {
  botId: string;
  token: string;
  channelId: string;
  content: string;
}

interface CreateBotInput {
  name: string;
  avatarUrl?: string | null;
  type?: 'webhook' | 'ai';
  systemPrompt?: string | null;
  model?: string | null;
}

interface UpdateBotInput {
  name?: string;
  avatarUrl?: string | null;
  isDisabled?: boolean;
  systemPrompt?: string | null;
  model?: string | null;
}

export class BotService {
  async listBots(): Promise<Bot[]> {
    return botRepository.findAll();
  }

  async getBot(botId: string): Promise<Bot | null> {
    return botRepository.findById(botId);
  }

  async getChannelBots(channelId: string): Promise<Bot[]> {
    return botRepository.findByChannelId(channelId);
  }

  async createBot(input: CreateBotInput, user: User): Promise<Bot> {
    const token = this.generateToken();
    const name = input.name.trim();
    if (!name) {
      throw new Error('Bot name is required');
    }
    const avatarUrl = this.normalizeAvatarUrl(input.avatarUrl);
    const type = input.type ?? 'webhook';
    return botRepository.create({
      name,
      avatarUrl,
      webhookToken: token,
      createdBy: user.id,
      isDisabled: false,
      type,
      systemPrompt: type === 'ai' ? (input.systemPrompt?.trim() || null) : null,
      model: type === 'ai' ? (input.model?.trim() || null) : null,
    });
  }

  async updateBot(botId: string, input: UpdateBotInput): Promise<Bot | null> {
    const data: Partial<NewBot> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Bot name is required');
      }
      data.name = name;
    }
    if (input.avatarUrl !== undefined) {
      data.avatarUrl = this.normalizeAvatarUrl(input.avatarUrl);
    }
    if (input.isDisabled !== undefined) {
      data.isDisabled = input.isDisabled;
    }
    if (input.systemPrompt !== undefined) {
      data.systemPrompt = input.systemPrompt?.trim() || null;
    }
    if (input.model !== undefined) {
      data.model = input.model?.trim() || null;
    }
    return botRepository.update(botId, data);
  }

  async deleteBot(botId: string): Promise<boolean> {
    return botRepository.delete(botId);
  }

  async regenerateToken(botId: string): Promise<Bot | null> {
    const token = this.generateToken();
    return botRepository.update(botId, { webhookToken: token });
  }

  async listBotChannels(botId: string) {
    return botChannelMemberRepository.findByBotId(botId);
  }

  async addBotToChannel(botId: string, channelId: string, user: User) {
    const bot = await botRepository.findById(botId);
    if (!bot) {
      throw new Error('Bot not found');
    }

    const channel = await channelRepository.findById(channelId);
    if (!channel || channel.archivedAt) {
      throw new Error('Channel not found');
    }

    if (channel.type === 'dm') {
      throw new Error('Bots cannot be added to DM channels');
    }

    const existing = await botChannelMemberRepository.findMembership(botId, channelId);
    if (existing) {
      return existing;
    }

    return botChannelMemberRepository.add(botId, channelId, user.id);
  }

  async removeBotFromChannel(botId: string, channelId: string): Promise<boolean> {
    return botChannelMemberRepository.remove(botId, channelId);
  }

  async postWebhookMessage(input: WebhookMessageInput) {
    const bot = await botRepository.findById(input.botId);
    if (!bot) {
      throw new Error('Bot not found');
    }

    if (bot.isDisabled) {
      throw new Error('Bot is disabled');
    }

    if (!this.tokensMatch(bot.webhookToken, input.token)) {
      throw new Error('Invalid webhook token');
    }

    const channel = await channelRepository.findById(input.channelId);
    if (!channel || channel.archivedAt) {
      throw new Error('Channel not found');
    }

    if (channel.type === 'dm') {
      throw new Error('Bots cannot post to DM channels');
    }

    const membership = await botChannelMemberRepository.findMembership(input.botId, input.channelId);
    if (!membership) {
      throw new Error('Bot is not a member of this channel');
    }

    const content = input.content.trim();
    if (!content) {
      throw new Error('Message content is required');
    }

    const message = await messageRepository.create({
      channelId: input.channelId,
      userId: bot.createdBy,
      botId: bot.id,
      content,
      mentions: [],
    });

    const messageRecord = await messageRepository.findById(message.id);
    if (!messageRecord) {
      throw new Error('Failed to load message');
    }

    const mapped = chatService.mapMessage(messageRecord);
    await chatService.emitChannelEvent(channel, {
      type: 'message',
      channelId: channel.id,
      message: mapped,
    });
    return mapped;
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private tokensMatch(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private normalizeAvatarUrl(avatarUrl?: string | null): string | null {
    if (!avatarUrl) return null;
    const trimmed = avatarUrl.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}

export const botService = new BotService();
