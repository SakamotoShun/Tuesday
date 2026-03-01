import { useState } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ApiErrorResponse } from "@/api/client"
import { forgotPassword } from "@/api/auth"

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
})

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordForm) => {
    try {
      setError(null)
      const response = await forgotPassword(data)
      setMessage(response.message)
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
        <img
          src="/Tuesday.png"
          alt="Tuesday"
          className="w-16 h-16 rounded-2xl mx-auto mb-6 object-cover"
        />

        <CardHeader className="p-0 mb-6">
          <CardTitle className="font-serif text-[28px] font-bold mb-2">Forgot password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
            {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}
            {message && <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 text-sm">{message}</div>}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending link..." : "Send reset link"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Remembered your password?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
