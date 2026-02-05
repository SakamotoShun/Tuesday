import { api } from "./client"
import type {
  Channel,
  CreateChannelInput,
  UpdateChannelInput,
  Message,
  CreateMessageInput,
  UpdateMessageInput,
  CreateDMInput,
  ChannelMember,
  AddChannelMembersInput,
} from "./types"

export const chatApi = {
  listChannels: () => api.get<Channel[]>("/channels"),
  listDMs: () => api.get<Channel[]>("/dms"),
  createDM: (input: CreateDMInput) => api.post<Channel>("/dms", input),
  createChannel: (input: CreateChannelInput) => api.post<Channel>("/channels", input),
  updateChannel: (channelId: string, input: UpdateChannelInput) =>
    api.patch<Channel>(`/channels/${channelId}`, input),
  archiveChannel: (channelId: string) => api.delete<Channel>(`/channels/${channelId}`),
  listChannelMembers: (channelId: string) => api.get<ChannelMember[]>(`/channels/${channelId}/members`),
  addChannelMembers: (channelId: string, input: AddChannelMembersInput) =>
    api.post<ChannelMember[]>(`/channels/${channelId}/members`, input),
  removeChannelMember: (channelId: string, userId: string) =>
    api.delete<ChannelMember[]>(`/channels/${channelId}/members/${userId}`),
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
