import type { Alignment, DriveStep, DriverHook, Side } from "driver.js"

type UserRole = "admin" | "member"

interface TourStepDefinition {
  selector: string
  title: string
  description: string
  side?: Side
  align?: Alignment
  onNextClick?: DriverHook
}

function waitForSelector(selector: string, onReady: () => void) {
  let attempts = 0
  const maxAttempts = 25
  const intervalMs = 100

  const timer = window.setInterval(() => {
    attempts += 1

    if (document.querySelector(selector) || attempts >= maxAttempts) {
      window.clearInterval(timer)
      onReady()
    }
  }, intervalMs)
}

const commonSteps = (navigateTo?: (path: string) => void): TourStepDefinition[] => [
  {
    selector: "[data-tour='nav-home']",
    title: "Home dashboard",
    description: "Start here for your daily snapshot: tasks, meetings, and project activity.",
    side: "right",
  },
  {
    selector: "[data-tour='nav-projects']",
    title: "Projects",
    description: "Open project workspaces to manage docs, tasks, whiteboards, and team updates.",
    side: "right",
  },
  {
    selector: "[data-tour='nav-my-work']",
    title: "My Work",
    description: "Open your personal work hub for assigned tasks and logged hours.",
    side: "right",
    onNextClick: (_element, _step, { driver }) => {
      if (!navigateTo) {
        driver.moveNext()
        return
      }

      navigateTo("/my-work?tab=timesheet")
      waitForSelector("[data-tour='my-work-tabs']", () => driver.moveNext())
    },
  },
  {
    selector: "[data-tour='my-work-tabs']",
    title: "My Work views",
    description: "Switch between your assigned tasks and your weekly timesheet from here.",
    side: "bottom",
    align: "start",
  },
  {
    selector: "[data-tour='my-work-timesheet-tab']",
    title: "Timesheet tab",
    description: "Use this tab to log and review your hours for each project.",
    side: "bottom",
    align: "start",
  },
  {
    selector: "[data-tour='my-work-timesheet-panel']",
    title: "Weekly timesheet",
    description: "Enter hours by day and project, then switch to monthly for a broader overview.",
    side: "top",
    align: "start",
  },
  {
    selector: "[data-tour='nav-calendar']",
    title: "Calendar",
    description: "Plan meetings and keep your schedule organized across projects.",
    side: "right",
  },
  {
    selector: "[data-tour='nav-chat']",
    title: "Chat",
    description: "Talk with your team in channels and direct messages without leaving WorkHub.",
    side: "right",
  },
  {
    selector: "[data-tour='global-search']",
    title: "Global search",
    description: "Search projects, docs, and tasks instantly from anywhere in the app.",
    side: "bottom",
    align: "start",
  },
  {
    selector: "[data-tour='notifications']",
    title: "Notifications",
    description: "Stay on top of mentions, assignments, and key updates.",
    side: "bottom",
    align: "end",
  },
  {
    selector: "[data-tour='user-menu']",
    title: "Your menu",
    description: "Need a refresher later? Open this menu and choose Replay tour anytime.",
    side: "bottom",
    align: "end",
  },
]

const adminOnlySteps: TourStepDefinition[] = [
  {
    selector: "[data-tour='nav-admin']",
    title: "Admin panel",
    description: "Manage workspace settings, statuses, and users from this area.",
    side: "right",
  },
]

export function getTourSteps(role: UserRole, navigateTo?: (path: string) => void): DriveStep[] {
  const baseSteps = commonSteps(navigateTo)
  const definitions = role === "admin" ? [...baseSteps, ...adminOnlySteps] : baseSteps

  return definitions
    .map((step) => ({
      element: step.selector,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side,
        align: step.align,
        ...(step.onNextClick ? { onNextClick: step.onNextClick } : {}),
      },
    }))
}
