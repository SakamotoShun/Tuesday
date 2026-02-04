import { create } from "zustand"

interface ChatStore {
  activeChannelId: string | null
  setActiveChannelId: (id: string | null) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  activeChannelId: null,
  setActiveChannelId: (id) => set({ activeChannelId: id }),
}))
