import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { chatApi } from "@/api/chat"
import type { Channel, Message, User } from "@/api/types"
import { useWebSocket } from "@/hooks/use-websocket"
import { useAuthStore } from "@/store/auth-store"

type TypingUser = Pick<User, "id" | "name" | "avatarUrl">

const createOptimisticId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `temp_${crypto.randomUUID()}`
    : `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`

export function useChatChannels(activeChannelId?: string | null) {
  const queryClient = useQueryClient()
  const { onMessage } = useWebSocket()

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

  return {
    channels: channelsQuery.data ?? [],
    isLoading: channelsQuery.isLoading,
    error: channelsQuery.error,
  }
}

export function useChatMessages(channelId?: string | null) {
  const queryClient = useQueryClient()
  const { onMessage, subscribe, unsubscribe, sendTyping } = useWebSocket()
  const user = useAuthStore((state) => state.user)
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser[]>>({})
  const channelIdRef = useRef(channelId)

  useEffect(() => {
    channelIdRef.current = channelId
  }, [channelId])

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

        addMessageToCache(currentChannelId, incoming)
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
  }, [addMessageToCache, onMessage])

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      channelId ? chatApi.sendMessage(channelId, { content }) : Promise.reject(new Error("No channel")),
    onMutate: (content) => {
      if (!channelId) return
      const trimmed = content.trim()
      if (!trimmed) return
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
        user: user ?? undefined,
      }

      addMessageToCache(channelId, optimisticMessage)
      return { optimisticId, channelId }
    },
    onError: (_error, _content, context) => {
      if (!context?.channelId || !context.optimisticId) return
      removeMessageFromCache(context.channelId, context.optimisticId)
    },
    onSuccess: (message, _content, context) => {
      if (!context?.channelId) return
      syncMessageInCache(context.channelId, context.optimisticId, message)
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
    markRead,
    typingUsers: channelId ? typingUsers[channelId] ?? [] : [],
    sendTyping,
  }
}
