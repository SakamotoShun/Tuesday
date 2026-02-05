import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { chatApi } from "@/api/chat"
import type { Channel, Message, User } from "@/api/types"
import { useWebSocket } from "@/hooks/use-websocket"
import { useAuthStore } from "@/store/auth-store"

type TypingUser = Pick<User, "id" | "name" | "avatarUrl">
type PendingOptimisticMessage = {
  id: string
  content: string
  attachmentIds: string[]
  createdAtMs: number
}

const PENDING_OPTIMISTIC_TTL_MS = 60_000

const normalizeAttachmentIds = (attachments?: Message["attachments"]) =>
  (attachments ?? [])
    .map((attachment) => attachment.id)
    .filter((id): id is string => Boolean(id))
    .sort()

const areAttachmentIdsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const createOptimisticId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `temp_${crypto.randomUUID()}`
    : `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`

export function useChatChannels(activeChannelId?: string | null) {
  const queryClient = useQueryClient()
  const { onMessage } = useWebSocket()

  const updateChannelInCache = useCallback(
    (channelId: string, updater: (channel: Channel) => Channel) => {
      queryClient.setQueryData<Channel[]>(["channels"], (channels) => {
        if (!channels) return channels
        return channels.map((channel) => (channel.id === channelId ? updater(channel) : channel))
      })
    },
    [queryClient]
  )

  const removeChannelFromCache = useCallback(
    (channelId: string) => {
      queryClient.setQueryData<Channel[]>(["channels"], (channels) =>
        channels ? channels.filter((channel) => channel.id !== channelId) : channels
      )
    },
    [queryClient]
  )

  const channelsQuery = useQuery({
    queryKey: ["channels"],
    queryFn: chatApi.listChannels,
  })

  useEffect(() => {
    return onMessage((event) => {
      if (event.type !== "message") return
      const channelId = event.channelId as string | undefined
      if (!channelId) return

      queryClient.setQueryData<Channel[]>(["channels"], (channels) => {
        if (!channels) return channels
        return channels.map((channel) => {
          if (channel.id !== channelId) return channel
          if (activeChannelId && channelId === activeChannelId) {
            return { ...channel, unreadCount: 0 }
          }
          const unread = channel.unreadCount ?? 0
          return { ...channel, unreadCount: unread + 1 }
        })
      })
    })
  }, [activeChannelId, onMessage, queryClient])

  useEffect(() => {
    return onMessage((event) => {
      if (event.type === "channel_updated") {
        const updated = event.channel as Channel | undefined
        if (!updated) return
        updateChannelInCache(updated.id, (channel) => ({ ...channel, ...updated }))
      }

      if (event.type === "channel_added") {
        const added = event.channel as Channel | undefined
        if (!added) return
        queryClient.setQueryData<Channel[]>(["channels"], (channels) => {
          if (!channels) return [added]
          if (channels.some((channel) => channel.id === added.id)) return channels
          return [added, ...channels]
        })
      }

      if (event.type === "channel_archived") {
        const channelId = event.channelId as string | undefined
        if (!channelId) return
        removeChannelFromCache(channelId)
      }
    })
  }, [onMessage, removeChannelFromCache, updateChannelInCache])

  const updateChannel = useMutation({
    mutationFn: ({ channelId, data }: { channelId: string; data: { name?: string; description?: string | null } }) =>
      chatApi.updateChannel(channelId, data),
    onSuccess: (updated) => {
      updateChannelInCache(updated.id, (channel) => ({ ...channel, ...updated }))
    },
  })

  const archiveChannel = useMutation({
    mutationFn: (channelId: string) => chatApi.archiveChannel(channelId),
    onSuccess: (archived) => {
      removeChannelFromCache(archived.id)
    },
  })

  return {
    channels: channelsQuery.data ?? [],
    isLoading: channelsQuery.isLoading,
    error: channelsQuery.error,
    updateChannel,
    archiveChannel,
  }
}

export function useChatMessages(channelId?: string | null) {
  const queryClient = useQueryClient()
  const { onMessage, subscribe, unsubscribe, sendTyping } = useWebSocket()
  const user = useAuthStore((state) => state.user)
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser[]>>({})
  const channelIdRef = useRef(channelId)
  const pendingOptimisticRef = useRef<Record<string, PendingOptimisticMessage[]>>({})

  useEffect(() => {
    channelIdRef.current = channelId
  }, [channelId])

  const trackPendingOptimistic = useCallback(
    (targetChannelId: string, message: Message, attachments?: Message["attachments"]) => {
      const entry: PendingOptimisticMessage = {
        id: message.id,
        content: message.content.trim(),
        attachmentIds: normalizeAttachmentIds(attachments),
        createdAtMs: Date.now(),
      }
      const existing = pendingOptimisticRef.current[targetChannelId] ?? []
      pendingOptimisticRef.current[targetChannelId] = [...existing, entry]
    },
    []
  )

  const clearPendingOptimistic = useCallback((targetChannelId: string, optimisticId: string) => {
    const existing = pendingOptimisticRef.current[targetChannelId]
    if (!existing) return
    const next = existing.filter((entry) => entry.id !== optimisticId)
    if (next.length > 0) {
      pendingOptimisticRef.current[targetChannelId] = next
    } else {
      delete pendingOptimisticRef.current[targetChannelId]
    }
  }, [])

  const findMatchingOptimistic = useCallback(
    (targetChannelId: string, incoming: Message) => {
      const existing = pendingOptimisticRef.current[targetChannelId]
      if (!existing || existing.length === 0) return undefined

      const incomingContent = incoming.content.trim()
      const incomingAttachmentIds = normalizeAttachmentIds(incoming.attachments)
      const now = Date.now()
      let matchId: string | undefined
      const next: PendingOptimisticMessage[] = []

      for (const entry of existing) {
        if (now - entry.createdAtMs > PENDING_OPTIMISTIC_TTL_MS) {
          continue
        }
        if (!matchId &&
          entry.content === incomingContent &&
          areAttachmentIdsEqual(entry.attachmentIds, incomingAttachmentIds)
        ) {
          matchId = entry.id
          continue
        }
        next.push(entry)
      }

      if (next.length > 0) {
        pendingOptimisticRef.current[targetChannelId] = next
      } else {
        delete pendingOptimisticRef.current[targetChannelId]
      }

      return matchId
    },
    []
  )

  useEffect(() => {
    if (!channelId) return
    subscribe(channelId)
    return () => unsubscribe(channelId)
  }, [channelId, subscribe, unsubscribe])

  const updateMessagesData = useCallback(
    (targetChannelId: string, updater: (pages: Message[][]) => Message[][]) => {
      queryClient.setQueryData(["channels", targetChannelId, "messages"], (data) => {
        if (!data || typeof data !== "object" || !("pages" in data)) {
          const nextPages = updater([])
          return { pages: nextPages, pageParams: nextPages.map(() => "") }
        }
        const pages = (data as { pages: Message[][]; pageParams: unknown[] }).pages
        return { ...data, pages: updater(pages) }
      })
    },
    [queryClient]
  )

  const addMessageToCache = useCallback(
    (targetChannelId: string, message: Message) => {
      updateMessagesData(targetChannelId, (pages) => {
        const nextPages = pages.length > 0 ? [...pages] : [[]]
        if (nextPages[0]?.some((existing) => existing.id === message.id)) return pages
        nextPages[0] = [message, ...(nextPages[0] ?? [])]
        return nextPages
      })
    },
    [updateMessagesData]
  )

  const removeMessageFromCache = useCallback(
    (targetChannelId: string, messageId: string) => {
      updateMessagesData(targetChannelId, (pages) =>
        pages.map((page) => page.filter((message) => message.id !== messageId))
      )
    },
    [updateMessagesData]
  )

  const syncMessageInCache = useCallback(
    (targetChannelId: string, optimisticId: string | undefined, message: Message) => {
      updateMessagesData(targetChannelId, (pages) => {
        let hasServerMessage = false
        const nextPages = pages.map((page) =>
          page.filter((item) => {
            if (item.id === message.id) {
              hasServerMessage = true
              return true
            }
            if (optimisticId && item.id === optimisticId) {
              return false
            }
            return true
          })
        )

        if (hasServerMessage) return nextPages
        const basePages = nextPages.length > 0 ? [...nextPages] : [[]]
        basePages[0] = [message, ...(basePages[0] ?? [])]
        return basePages
      })
    },
    [updateMessagesData]
  )

  const updateMessageInCache = useCallback(
    (targetChannelId: string, messageId: string, updater: (message: Message) => Message) => {
      updateMessagesData(targetChannelId, (pages) =>
        pages.map((page) =>
          page.map((message) => (message.id === messageId ? updater(message) : message))
        )
      )
    },
    [updateMessagesData]
  )

  const messagesQuery = useInfiniteQuery({
    queryKey: ["channels", channelId, "messages"],
    queryFn: ({ pageParam }) =>
      channelId
        ? chatApi.listMessages(channelId, { before: pageParam ? String(pageParam) : undefined, limit: 30 })
        : Promise.resolve([]),
    initialPageParam: "",
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < 30) return undefined
      return lastPage[lastPage.length - 1]?.createdAt
    },
    enabled: !!channelId,
  })

  useEffect(() => {
    return onMessage((event) => {
      if (event.type === "message") {
        const currentChannelId = channelIdRef.current
        const channelIdFromEvent = event.channelId as string | undefined
        if (!channelIdFromEvent || !currentChannelId || channelIdFromEvent !== currentChannelId) return
        const incoming = event.message as Message | undefined
        if (!incoming) return

        if (incoming.userId === user?.id) {
          const optimisticId = findMatchingOptimistic(currentChannelId, incoming)
          if (optimisticId) {
            syncMessageInCache(currentChannelId, optimisticId, incoming)
            return
          }
        }

        addMessageToCache(currentChannelId, incoming)
      }

      if (
        event.type === "message_updated" ||
        event.type === "message_deleted" ||
        event.type === "reaction_added" ||
        event.type === "reaction_removed"
      ) {
        const channelIdFromEvent = event.channelId as string | undefined
        const incoming = event.message as Message | undefined
        if (!channelIdFromEvent || !incoming) return

        updateMessageInCache(channelIdFromEvent, incoming.id, () => incoming)
      }

      if (event.type === "typing") {
        const currentChannelId = channelIdRef.current
        const channelIdFromEvent = event.channelId as string | undefined
        if (!channelIdFromEvent || !currentChannelId || channelIdFromEvent !== currentChannelId) return
        const typingUser = event.user as TypingUser | undefined
        const isTyping = Boolean(event.isTyping)
        if (!typingUser) return

        setTypingUsers((current) => {
          const existing = current[channelIdFromEvent] ?? []
          const next = isTyping
            ? [...existing.filter((user) => user.id !== typingUser.id), typingUser]
            : existing.filter((user) => user.id !== typingUser.id)
          return { ...current, [channelIdFromEvent]: next }
        })
      }
    })
  }, [addMessageToCache, findMatchingOptimistic, onMessage, syncMessageInCache, updateMessageInCache, user?.id])

  const sendMessage = useMutation({
    mutationFn: ({ content, attachments }: { content: string; attachments?: Message["attachments"] }) =>
      channelId
        ? chatApi.sendMessage(channelId, {
            content,
            attachmentIds: attachments?.map((attachment) => attachment.id),
          })
        : Promise.reject(new Error("No channel")),
    onMutate: ({ content, attachments }) => {
      if (!channelId) return
      const trimmed = content.trim()
      const attachmentList = attachments ?? []
      if (!trimmed && attachmentList.length === 0) return
      const optimisticId = createOptimisticId()
      const now = new Date().toISOString()
      const optimisticMessage: Message = {
        id: optimisticId,
        channelId,
        userId: user?.id ?? "unknown",
        content: trimmed,
        mentions: [],
        createdAt: now,
        updatedAt: now,
        attachments: attachmentList,
        reactions: [],
        user: user ?? undefined,
      }

      addMessageToCache(channelId, optimisticMessage)
      trackPendingOptimistic(channelId, optimisticMessage, attachmentList)
      return { optimisticId, channelId }
    },
    onError: (_error, _content, context) => {
      if (!context?.channelId || !context.optimisticId) return
      removeMessageFromCache(context.channelId, context.optimisticId)
      clearPendingOptimistic(context.channelId, context.optimisticId)
    },
    onSuccess: (message, _content, context) => {
      if (!context?.channelId) return
      syncMessageInCache(context.channelId, context.optimisticId, message)
      if (context.optimisticId) {
        clearPendingOptimistic(context.channelId, context.optimisticId)
      }
    },
  })

  const markRead = useMutation({
    mutationFn: () => (channelId ? chatApi.markChannelRead(channelId) : Promise.resolve({ read: true })),
    onSuccess: () => {
      queryClient.setQueryData<Channel[]>(["channels"], (channels) => {
        if (!channels || !channelId) return channels
        return channels.map((channel) =>
          channel.id === channelId ? { ...channel, unreadCount: 0, lastReadAt: new Date().toISOString() } : channel
        )
      })
    },
  })

  const updateMessage = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      channelId ? chatApi.updateMessage(channelId, messageId, { content }) : Promise.reject(new Error("No channel")),
    onSuccess: (message) => {
      if (!channelId) return
      updateMessageInCache(channelId, message.id, () => message)
    },
  })

  const deleteMessage = useMutation({
    mutationFn: ({ messageId }: { messageId: string }) =>
      channelId ? chatApi.deleteMessage(channelId, messageId) : Promise.reject(new Error("No channel")),
    onSuccess: (message) => {
      if (!channelId) return
      updateMessageInCache(channelId, message.id, () => message)
    },
  })

  const addReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      channelId ? chatApi.addReaction(channelId, messageId, emoji) : Promise.reject(new Error("No channel")),
    onSuccess: (message) => {
      if (!channelId) return
      updateMessageInCache(channelId, message.id, () => message)
    },
  })

  const removeReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      channelId ? chatApi.removeReaction(channelId, messageId, emoji) : Promise.reject(new Error("No channel")),
    onSuccess: (message) => {
      if (!channelId) return
      updateMessageInCache(channelId, message.id, () => message)
    },
  })

  const messages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? []
    const flattened = pages.flat()
    return [...flattened].reverse()
  }, [messagesQuery.data])

  return {
    messages,
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,
    fetchNextPage: messagesQuery.fetchNextPage,
    hasNextPage: messagesQuery.hasNextPage,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    sendMessage,
    updateMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    markRead,
    typingUsers: channelId ? typingUsers[channelId] ?? [] : [],
    sendTyping,
  }
}
