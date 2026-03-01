import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ApiErrorResponse } from "@/api/client"
import { resetPassword } from "@/api/auth"

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(100, "Password is too long"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (data: ResetPasswordForm) => {
    try {
      setError(null)
      await resetPassword({ token, password: data.password })
      navigate("/login", { replace: true, state: { passwordReset: true } })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("An unexpected error occurred")
      }
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-[420px] p-12 text-center rounded-[20px] shadow-lg border-border">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="font-serif text-[28px] font-bold">Invalid reset link</CardTitle>
            <CardDescription className="text-muted-foreground">
              This link is missing a reset token.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Button asChild className="w-full">
              <Link to="/forgot-password">Request new reset link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
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
          <CardTitle className="font-serif text-[28px] font-bold mb-2">Reset password</CardTitle>
          <CardDescription className="text-muted-foreground">Choose a new password for your account.</CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
            {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}

            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                {...register("confirmPassword")}
                className={errors.confirmPassword ? "border-destructive" : ""}
              />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset password"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Need a new link?{" "}
              <Link to="/forgot-password" className="text-primary hover:underline">
                Request reset email
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
