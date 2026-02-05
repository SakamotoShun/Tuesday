import { api } from "./client"
import type { Channel, CreateChannelInput, UpdateChannelInput, Message, CreateMessageInput, UpdateMessageInput } from "./types"

export const chatApi = {
  listChannels: () => api.get<Channel[]>("/channels"),
  createChannel: (input: CreateChannelInput) => api.post<Channel>("/channels", input),
  updateChannel: (channelId: string, input: UpdateChannelInput) =>
    api.patch<Channel>(`/channels/${channelId}`, input),
  archiveChannel: (channelId: string) => api.delete<Channel>(`/channels/${channelId}`),
  listMessages: (channelId: string, options?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (options?.before) params.set("before", options.before)
    if (options?.limit) params.set("limit", String(options.limit))
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return api.get<Message[]>(`/channels/${channelId}/messages${suffix}`)
  },
  sendMessage: (channelId: string, input: CreateMessageInput) =>
    api.post<Message>(`/channels/${channelId}/messages`, input),
  updateMessage: (channelId: string, messageId: string, input: UpdateMessageInput) =>
    api.patch<Message>(`/channels/${channelId}/messages/${messageId}`, input),
  deleteMessage: (channelId: string, messageId: string) =>
    api.delete<Message>(`/channels/${channelId}/messages/${messageId}`),
  addReaction: (channelId: string, messageId: string, emoji: string) =>
    api.post<Message>(`/channels/${channelId}/messages/${messageId}/reactions`, { emoji }),
  removeReaction: (channelId: string, messageId: string, emoji: string) =>
    api.delete<Message>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`),
  markChannelRead: (channelId: string) => api.patch<{ read: boolean }>(`/channels/${channelId}/read`, {}),
}
