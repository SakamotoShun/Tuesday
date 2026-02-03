import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useSetup } from "@/hooks/use-setup"
import { ApiErrorResponse } from "@/api/client"

const setupSchema = z
  .object({
    workspaceName: z.string().min(1, "Workspace name is required").max(255),
    adminEmail: z.string().email("Invalid email address"),
    adminName: z.string().min(1, "Admin name is required").max(255),
    adminPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100),
    confirmPassword: z.string(),
  })
  .refine((data) => data.adminPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type SetupForm = z.infer<typeof setupSchema>

export function SetupPage() {
  const navigate = useNavigate()
  const { complete } = useSetup()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
  })

  const onSubmit = async (data: SetupForm) => {
    try {
      setError(null)
      await complete.mutateAsync({
        workspaceName: data.workspaceName,
        adminEmail: data.adminEmail,
        adminName: data.adminName,
        adminPassword: data.adminPassword,
      })
      navigate("/login")
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
      <Card className="w-full max-w-[480px] p-12 text-center rounded-[20px] shadow-lg border-border">
        {/* Logo */}
        <div className="w-16 h-16 bg-primary rounded-2xl mx-auto mb-6 flex items-center justify-center text-primary-foreground text-2xl font-bold">
          T
        </div>

        {/* Title */}
        <CardHeader className="p-0 mb-6">
          <CardTitle className="font-serif text-[28px] font-bold mb-2">
            Welcome to Tuesday
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Complete the setup to create your workspace
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
              <Label htmlFor="workspaceName">Workspace Name</Label>
              <Input
                id="workspaceName"
                type="text"
                placeholder="Acme Corp"
                {...register("workspaceName")}
                className={errors.workspaceName ? "border-destructive" : ""}
              />
              {errors.workspaceName && (
                <p className="text-sm text-destructive">
                  {errors.workspaceName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminName">Admin Name</Label>
              <Input
                id="adminName"
                type="text"
                placeholder="John Doe"
                {...register("adminName")}
                className={errors.adminName ? "border-destructive" : ""}
              />
              {errors.adminName && (
                <p className="text-sm text-destructive">
                  {errors.adminName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminEmail">Admin Email</Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="admin@example.com"
                {...register("adminEmail")}
                className={errors.adminEmail ? "border-destructive" : ""}
              />
              {errors.adminEmail && (
                <p className="text-sm text-destructive">
                  {errors.adminEmail.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminPassword">Password</Label>
              <Input
                id="adminPassword"
                type="password"
                placeholder="••••••••"
                {...register("adminPassword")}
                className={errors.adminPassword ? "border-destructive" : ""}
              />
              {errors.adminPassword && (
                <p className="text-sm text-destructive">
                  {errors.adminPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                {...register("confirmPassword")}
                className={errors.confirmPassword ? "border-destructive" : ""}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Setting up..." : "Complete Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
