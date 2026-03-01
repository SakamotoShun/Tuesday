import { create } from "zustand"
import { persist } from "zustand/middleware"

type Theme = "light" | "dark" | "system"
type ChatSection = "workspace" | "project" | "dm"
type HomeWidgetId = "focus" | "notices" | "meetings" | "projects" | "chat"

interface HomeWidgetLayoutItem {
  x: number
  y: number
  colSpan: number
  rowSpan: number
}

const DEFAULT_HOME_WIDGET_ORDER: HomeWidgetId[] = ["focus", "notices", "meetings", "projects", "chat"]

const DEFAULT_HOME_WIDGET_LAYOUT: Record<HomeWidgetId, HomeWidgetLayoutItem> = {
  focus: { x: 0, y: 0, colSpan: 1, rowSpan: 2 },
  notices: { x: 1, y: 0, colSpan: 1, rowSpan: 1 },
  meetings: { x: 1, y: 1, colSpan: 1, rowSpan: 1 },
  projects: { x: 2, y: 0, colSpan: 2, rowSpan: 1 },
  chat: { x: 2, y: 1, colSpan: 2, rowSpan: 2 },
}

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
  homeWidgetOrder: HomeWidgetId[]
  homeWidgetLayout: Record<HomeWidgetId, HomeWidgetLayoutItem>
  homeHiddenWidgets: HomeWidgetId[]
  setHomeWidgetOrder: (order: HomeWidgetId[]) => void
  setHomeWidgetLayout: (layout: Record<HomeWidgetId, HomeWidgetLayoutItem>) => void
  toggleHomeWidgetVisibility: (id: HomeWidgetId) => void
  resetHomeLayout: () => void
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
      homeWidgetOrder: DEFAULT_HOME_WIDGET_ORDER,
      homeWidgetLayout: DEFAULT_HOME_WIDGET_LAYOUT,
      homeHiddenWidgets: [],
      setHomeWidgetOrder: (order) => set({ homeWidgetOrder: order }),
      setHomeWidgetLayout: (layout) => set({ homeWidgetLayout: layout }),
      toggleHomeWidgetVisibility: (id) =>
        set((state) => {
          const isHidden = state.homeHiddenWidgets.includes(id)
          const nextHiddenWidgets = isHidden
            ? state.homeHiddenWidgets.filter((widgetId) => widgetId !== id)
            : [...state.homeHiddenWidgets, id]

          const nextOrder = isHidden
            ? state.homeWidgetOrder.includes(id)
              ? state.homeWidgetOrder
              : [...state.homeWidgetOrder, id]
            : state.homeWidgetOrder.filter((widgetId) => widgetId !== id)

          return {
            homeHiddenWidgets: nextHiddenWidgets,
            homeWidgetOrder: nextOrder,
          }
        }),
      resetHomeLayout: () =>
        set({
          homeWidgetOrder: DEFAULT_HOME_WIDGET_ORDER,
          homeWidgetLayout: DEFAULT_HOME_WIDGET_LAYOUT,
          homeHiddenWidgets: [],
        }),
    }),
    {
      name: "ui-storage",
    }
  )
)
