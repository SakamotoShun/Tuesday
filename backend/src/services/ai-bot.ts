import OpenAI from 'openai';
import { messageRepository, settingsRepository } from '../repositories';
import { chatService } from './chat';
import { AiProvider, type Bot } from '../db/schema';
import type { ChannelWithProject } from '../repositories/channel';

const DEFAULT_MODEL = 'gpt5.2';
const CONTEXT_MESSAGE_LIMIT = 20;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const normalizeHandle = (name: string) => name.toLowerCase().replace(/\s+/g, '');

export class AiBotService {
  /**
   * Called when a message mentions an AI bot in a channel.
   * Fetches recent channel history, builds context, calls OpenAI, and posts the response.
   * This is designed to be called fire-and-forget (don't await in the message send path).
   */
  async handleMention(bot: Bot, channel: ChannelWithProject, triggerContent: string, triggerUserName: string): Promise<void> {
    try {
      const provider = bot.provider === AiProvider.OPENROUTER ? AiProvider.OPENROUTER : AiProvider.OPENAI;
      const apiKeySetting = provider === AiProvider.OPENROUTER ? 'openrouter_api_key' : 'openai_api_key';
      const apiKey = await settingsRepository.get<string>(apiKeySetting);
      if (!apiKey) {
        const providerLabel = provider === AiProvider.OPENROUTER ? 'OpenRouter' : 'OpenAI';
        await this.postBotMessage(bot, channel, `AI features are not configured. An admin needs to set the ${providerLabel} API key in Workspace Settings.`);
        return;
      }

      const model = bot.model?.trim() || DEFAULT_MODEL;
      const systemPrompt = bot.systemPrompt?.trim() || 'You are a helpful assistant.';

      const contextMessages = await this.buildContext(channel.id, systemPrompt, triggerContent, triggerUserName, bot);
      const siteUrl = provider === AiProvider.OPENROUTER ? await settingsRepository.get<string>('site_url') : undefined;
      const workspaceName = provider === AiProvider.OPENROUTER ? await settingsRepository.get<string>('workspace_name') : undefined;
      const responseContent = await this.callOpenAI({
        apiKey,
        provider,
        model,
        messages: contextMessages,
        siteUrl: siteUrl ?? undefined,
        workspaceName: workspaceName ?? undefined,
      });
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

  private async callOpenAI({
    apiKey,
    provider,
    model,
    messages,
    siteUrl,
    workspaceName,
  }: {
    apiKey: string;
    provider: 'openai' | 'openrouter';
    model: string;
    messages: OpenAI.ChatCompletionMessageParam[];
    siteUrl?: string;
    workspaceName?: string;
  }): Promise<string> {
    const openRouterHeaders: Record<string, string> = {};
    if (provider === AiProvider.OPENROUTER) {
      if (siteUrl?.trim()) {
        openRouterHeaders['HTTP-Referer'] = siteUrl.trim();
      }
      if (workspaceName?.trim()) {
        openRouterHeaders['X-Title'] = workspaceName.trim();
      }
    }

    const client = new OpenAI({
      apiKey,
      ...(provider === AiProvider.OPENROUTER
        ? {
            baseURL: OPENROUTER_BASE_URL,
            ...(Object.keys(openRouterHeaders).length > 0 ? { defaultHeaders: openRouterHeaders } : {}),
          }
        : {}),
    });

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
