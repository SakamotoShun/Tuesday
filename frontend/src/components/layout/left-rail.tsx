import {
  Home,
  FolderKanban,
  ListTodo,
  Calendar,
  MessageSquare,
  Settings,
  Receipt,
} from "lucide-react"
import { RailItem } from "./rail-item"
import { useAuth } from "@/hooks/use-auth"

export function LeftRail() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  return (
    <nav className="w-[84px] bg-card border-r border-border flex flex-col items-center py-4 gap-2">
      <RailItem icon={Home} label="Home" href="/" />
      <RailItem icon={FolderKanban} label="Projects" href="/projects" />
      <RailItem icon={ListTodo} label="My Work" href="/my-work" />
      <RailItem icon={Calendar} label="Calendar" href="/my-calendar" />
      <RailItem icon={MessageSquare} label="Chat" href="/chat" />
      {isAdmin && <RailItem icon={Settings} label="Admin" href="/admin" />}
      {isAdmin && <RailItem icon={Receipt} label="Payroll" href="/admin/payroll" />}
    </nav>
  )
}
