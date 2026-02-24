import { create } from "zustand"
import { persist } from "zustand/middleware"

type Theme = "light" | "dark" | "system"
type ChatSection = "workspace" | "project" | "dm"

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  theme: Theme
  setTheme: (theme: Theme) => void
  chatPanelWidth: number
  setChatPanelWidth: (width: number) => void
  docSidebarWidth: number
  setDocSidebarWidth: (width: number) => void
  chatSidebarCollapsed: boolean
  toggleChatSidebar: () => void
  collapsedChannelSections: Partial<Record<ChatSection, boolean>>
  toggleChannelSection: (section: ChatSection) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      theme: "system",
      setTheme: (theme) => set({ theme }),
      chatPanelWidth: 420,
      setChatPanelWidth: (width) => set({ chatPanelWidth: width }),
      docSidebarWidth: 260,
      setDocSidebarWidth: (width) => set({ docSidebarWidth: width }),
      chatSidebarCollapsed: false,
      toggleChatSidebar: () =>
        set((state) => ({ chatSidebarCollapsed: !state.chatSidebarCollapsed })),
      collapsedChannelSections: {},
      toggleChannelSection: (section) =>
        set((state) => ({
          collapsedChannelSections: {
            ...state.collapsedChannelSections,
            [section]: !state.collapsedChannelSections[section],
          },
        })),
    }),
    {
      name: "ui-storage",
    }
  )
)
