import OpenAI from 'openai';
import { messageRepository, settingsRepository } from '../repositories';
import { chatService } from './chat';
import type { Bot } from '../db/schema';
import type { ChannelWithProject } from '../repositories/channel';

const DEFAULT_MODEL = 'gpt5.2';
const CONTEXT_MESSAGE_LIMIT = 20;

const normalizeHandle = (name: string) => name.toLowerCase().replace(/\s+/g, '');

export class AiBotService {
  /**
   * Called when a message mentions an AI bot in a channel.
   * Fetches recent channel history, builds context, calls OpenAI, and posts the response.
   * This is designed to be called fire-and-forget (don't await in the message send path).
   */
  async handleMention(bot: Bot, channel: ChannelWithProject, triggerContent: string, triggerUserName: string): Promise<void> {
    try {
      const apiKey = await settingsRepository.get<string>('openai_api_key');
      if (!apiKey) {
        await this.postBotMessage(bot, channel, 'AI features are not configured. An admin needs to set the OpenAI API key in Workspace Settings.');
        return;
      }

      const model = bot.model?.trim() || DEFAULT_MODEL;
      const systemPrompt = bot.systemPrompt?.trim() || 'You are a helpful assistant.';

      const contextMessages = await this.buildContext(channel.id, systemPrompt, triggerContent, triggerUserName, bot);
      const responseContent = await this.callOpenAI(apiKey, model, contextMessages);
      await this.postBotMessage(bot, channel, responseContent);
    } catch (error) {
      console.error(`AI bot ${bot.id} error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.postBotMessage(bot, channel, `Sorry, I couldn't process that request. (${errorMessage})`).catch((postError) => {
        console.error('Failed to post error message:', postError);
      });
    }
  }

  private async buildContext(
    channelId: string,
    systemPrompt: string,
    triggerContent: string,
    triggerUserName: string,
    bot: Bot,
  ): Promise<OpenAI.ChatCompletionMessageParam[]> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Fetch recent messages for context (returned in descending order)
    const recentMessages = await messageRepository.findByChannelId(channelId, {
      limit: CONTEXT_MESSAGE_LIMIT,
    });

    // Reverse to get chronological order, skip the trigger message (it's the most recent)
    const chronological = [...recentMessages].reverse();

    const botHandle = `@${normalizeHandle(bot.name)}`;

    for (const msg of chronological) {
      // Skip deleted messages
      if (msg.deletedAt) continue;

      const content = msg.content.trim();
      if (!content) continue;

      if (msg.botId === bot.id) {
        // This bot's own previous messages
        messages.push({ role: 'assistant', content });
      } else {
        // User messages - strip the bot mention for cleaner context
        const cleanedContent = content.replace(new RegExp(botHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
        const userName = msg.user?.name ?? 'Unknown';
        messages.push({ role: 'user', content: `${userName}: ${cleanedContent || content}` });
      }
    }

    return messages;
  }

  private async callOpenAI(apiKey: string, model: string, messages: OpenAI.ChatCompletionMessageParam[]): Promise<string> {
    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model,
      messages,
      max_completion_tokens: 2000,
    });

    const choice = completion.choices[0];
    if (!choice?.message?.content) {
      throw new Error('No response from AI model');
    }

    return choice.message.content;
  }

  private async postBotMessage(bot: Bot, channel: ChannelWithProject, content: string): Promise<void> {
    const message = await messageRepository.create({
      channelId: channel.id,
      userId: bot.createdBy,
      botId: bot.id,
      content,
      mentions: [],
    });

    const messageRecord = await messageRepository.findById(message.id);
    if (!messageRecord) {
      throw new Error('Failed to load AI bot message');
    }

    const mapped = chatService.mapMessage(messageRecord);
    await chatService.emitChannelEvent(channel, {
      type: 'message',
      channelId: channel.id,
      message: mapped,
    });
  }
}

export const aiBotService = new AiBotService();
