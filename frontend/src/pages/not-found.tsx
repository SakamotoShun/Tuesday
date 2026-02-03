import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="font-serif text-6xl font-bold mb-4">404</h1>
        <p className="text-muted-foreground text-lg mb-8">
          The page you're looking for doesn't exist.
        </p>
        <Button asChild>
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    </div>
  )
}
