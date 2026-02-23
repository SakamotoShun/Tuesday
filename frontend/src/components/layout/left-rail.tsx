import {
  Home,
  FolderKanban,
  ListTodo,
  Calendar,
  MessageSquare,
  FileText,
  Settings,
  Receipt,
  UserSearch,
} from "lucide-react"
import { RailItem } from "./rail-item"
import { useAuth } from "@/hooks/use-auth"

export function LeftRail() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  return (
    <nav className="w-[84px] bg-card border-r border-border flex flex-col items-center py-4 gap-2" data-tour="left-rail">
      <RailItem icon={Home} label="Home" href="/" tourId="nav-home" />
      <RailItem icon={FolderKanban} label="Projects" href="/projects" tourId="nav-projects" />
      <RailItem icon={ListTodo} label="My Work" href="/my-work" tourId="nav-my-work" />
      <RailItem icon={Calendar} label="Calendar" href="/my-calendar" tourId="nav-calendar" />
      <RailItem icon={MessageSquare} label="Chat" href="/chat" tourId="nav-chat" />
      <RailItem icon={FileText} label="Policies" href="/policies" tourId="nav-policies" />
      {isAdmin && <RailItem icon={UserSearch} label="Hiring" href="/hiring" tourId="nav-hiring" />}
      {isAdmin && <RailItem icon={Settings} label="Admin" href="/admin" tourId="nav-admin" />}
      {isAdmin && <RailItem icon={Receipt} label="Payroll" href="/admin/payroll" tourId="nav-payroll" />}
    </nav>
  )
}
