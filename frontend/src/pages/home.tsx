import { useAuth } from "@/hooks/use-auth"

export function HomePage() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="font-serif text-[32px] font-bold mb-6">
        Good {getTimeOfDay()}, {user?.name.split(" ")[0]}
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-6 rounded-lg border border-border bg-card">
          <h3 className="font-semibold mb-2">Notifications</h3>
          <p className="text-muted-foreground text-sm">
            Coming in Phase 5
          </p>
        </div>
        
        <div className="p-6 rounded-lg border border-border bg-card">
          <h3 className="font-semibold mb-2">My Work</h3>
          <p className="text-muted-foreground text-sm">
            Coming in Phase 5
          </p>
        </div>
        
        <div className="p-6 rounded-lg border border-border bg-card">
          <h3 className="font-semibold mb-2">Upcoming Meetings</h3>
          <p className="text-muted-foreground text-sm">
            Coming in Phase 4
          </p>
        </div>
      </div>
    </div>
  )
}

function getTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}
