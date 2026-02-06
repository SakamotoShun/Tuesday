import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { ApiErrorResponse } from "@/api/client"

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100, "Password is too long"),
})

type RegisterForm = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const { register: registerUser } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterForm) => {
    try {
      setError(null)
      await registerUser.mutateAsync(data)
      navigate("/login", { state: { registered: true } })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("An unexpected error occurred")
      }
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-[420px] p-12 text-center rounded-[20px] shadow-lg border-border">
        {/* Logo */}
        <img 
          src="/Tuesday.png" 
          alt="Tuesday" 
          className="w-16 h-16 rounded-2xl mx-auto mb-6 object-cover"
        />

        {/* Title */}
        <CardHeader className="p-0 mb-6">
          <CardTitle className="font-serif text-[28px] font-bold mb-2">
            Create Account
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Join your team's workspace
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                {...register("name")}
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
          Internal workspace only • v0.1.0
        </div>
      </Card>
    </div>
  )
}
