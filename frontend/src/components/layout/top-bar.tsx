import { Bell, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Logo } from "./logo"
import { UserMenu } from "./user-menu"

export function TopBar() {
  return (
    <header className="h-[72px] bg-card border-b border-border flex items-center px-6 gap-6 shrink-0">
      <Logo />

      <div className="flex-1 max-w-[400px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects, docs, tasks..."
            className="pl-9 bg-background border-border"
            disabled
          />
        </div>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <Button className="gap-1">
          <Plus className="h-4 w-4" />
          Create
        </Button>

        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </Button>

        <UserMenu />
      </div>
    </header>
  )
}
