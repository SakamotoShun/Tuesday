import { api } from "./client"
import type { Channel, CreateChannelInput, Message, CreateMessageInput } from "./types"

export const chatApi = {
  listChannels: () => api.get<Channel[]>("/channels"),
  createChannel: (input: CreateChannelInput) => api.post<Channel>("/channels", input),
  listMessages: (channelId: string, options?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (options?.before) params.set("before", options.before)
    if (options?.limit) params.set("limit", String(options.limit))
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return api.get<Message[]>(`/channels/${channelId}/messages${suffix}`)
  },
  sendMessage: (channelId: string, input: CreateMessageInput) =>
    api.post<Message>(`/channels/${channelId}/messages`, input),
  markChannelRead: (channelId: string) => api.patch<{ read: boolean }>(`/channels/${channelId}/read`, {}),
}
