import { useState } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { useSetup } from "@/hooks/use-setup"
import { Moon, Sun } from "@/lib/icons"
import { useUIStore } from "@/store/ui-store"
import { ApiErrorResponse } from "@/api/client"

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const { passwordResetEnabled } = useSetup()
  const { theme, setTheme } = useUIStore()
  const [error, setError] = useState<string | null>(null)

  const locationState = location.state as { from?: { pathname?: string }; registered?: boolean; passwordReset?: boolean } | null
  const from = locationState?.from?.pathname || "/"
  const showRegisteredMessage = Boolean(locationState?.registered)
  const showPasswordResetMessage = Boolean(locationState?.passwordReset)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const isDarkMode =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  const toggleTheme = () => {
    setTheme(isDarkMode ? "light" : "dark")
  }

  const onSubmit = async (data: LoginForm) => {
    try {
      setError(null)
      await login.mutateAsync(data)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message)
      } else {
        setError("An unexpected error occurred")
      }
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4ead7] text-[#1f130b] dark:bg-[#16120f] dark:text-[#f4e5cf]">
      <div className="pointer-events-none absolute inset-0 opacity-85 dark:opacity-95">
        <div className="absolute -top-28 left-[-7rem] h-[22rem] w-[22rem] rounded-full bg-[#c57b57]/35 blur-3xl dark:bg-[#8b5b40]/30" />
        <div className="absolute -bottom-20 right-[-6rem] h-[20rem] w-[20rem] rounded-full bg-[#195d59]/25 blur-3xl dark:bg-[#1f7b73]/20" />
        <div className="absolute left-1/2 top-1/2 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#7c5c3f]/20 dark:border-[#ccaf8b]/15" />
      </div>

      <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8">
        <Button
          type="button"
          variant="outline"
          onClick={toggleTheme}
          className="h-10 rounded-full border-[#6f5138]/25 bg-[#fff6ea]/80 px-4 text-[#2e1e11] backdrop-blur-sm hover:bg-[#fff1dd] dark:border-[#c8a481]/30 dark:bg-[#2a231d]/85 dark:text-[#f3e5d0] dark:hover:bg-[#352b24]"
          aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDarkMode ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {isDarkMode ? "Light mode" : "Dark mode"}
        </Button>
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-10">
        <section className="hidden lg:flex lg:pr-10">
          <div className="flex w-full flex-col justify-between rounded-[2rem] border border-[#4f3a28]/20 bg-[#f8f1e5]/72 p-10 shadow-[0_28px_70px_rgba(45,31,18,0.16)] backdrop-blur-sm animate-in fade-in slide-in-from-left-8 duration-700 dark:border-[#caa985]/20 dark:bg-[#1f1914]/70 dark:shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex h-full flex-col items-center justify-center">
              <div className="relative flex h-[18rem] w-[18rem] items-center justify-center rounded-full border border-[#7f5d42]/35 bg-[#fff9ef]/55 shadow-[0_24px_60px_rgba(43,28,17,0.16)] dark:border-[#d2b18f]/30 dark:bg-[#2b231d]/65 dark:shadow-[0_28px_70px_rgba(0,0,0,0.4)]">
                <div className="absolute inset-5 rounded-full border border-[#8f6d4f]/25 dark:border-[#d2b18f]/25" />
                <img
                  src="/Tuesday.png"
                  alt="Tuesday"
                  className="relative z-10 h-28 w-28 rounded-[2rem] border border-[#6e4a2f]/25 object-cover shadow-[0_18px_28px_rgba(53,33,18,0.22)] dark:border-[#d0af89]/35 dark:shadow-[0_18px_30px_rgba(0,0,0,0.55)]"
                />
              </div>

              <div className="mt-10 text-center">
                <p className="text-xs uppercase tracking-[0.32em] text-[#4d3421] dark:text-[#d8b48e]">Tuesday</p>
                <p className="mt-3 font-serif text-5xl leading-none tracking-tight text-[#2f1f11] dark:text-[#f5e6d2]">Work Hub</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center py-8 lg:py-0">
          <Card className="relative w-full max-w-[34rem] overflow-hidden rounded-[2rem] border-[#3f2d1f]/22 bg-[#fffaf2]/94 p-8 text-[#1f130b] shadow-[0_30px_80px_rgba(42,28,18,0.2)] backdrop-blur-sm animate-in fade-in zoom-in-95 duration-500 sm:p-10 dark:border-[#d2b28e]/25 dark:bg-[#211b15]/92 dark:text-[#f4e5cf] dark:shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#99653f]/45 to-transparent dark:via-[#d3ad84]/45" />

            <div className="mb-8 lg:hidden">
              <div className="mb-5 flex items-center gap-3">
                <img
                  src="/Tuesday.png"
                  alt="Tuesday"
                  className="h-12 w-12 rounded-xl border border-[#5f432e]/15 object-cover dark:border-[#d2b18d]/30"
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4f3724] dark:text-[#d6b08a]">Tuesday</p>
                  <p className="font-serif text-2xl leading-none text-[#2f1f11] dark:text-[#f5e6d2]">Work Hub</p>
                </div>
              </div>
              <p className="text-sm text-[#3d2c1f] dark:text-[#d9c0a5]">Sign in to continue with your team's workspace.</p>
            </div>

            <CardHeader className="mb-8 p-0 text-left">
              <CardTitle className="font-serif text-4xl leading-none text-[#2f1f11] dark:text-[#f5e6d2]">Welcome back</CardTitle>
              <CardDescription className="pt-3 text-base text-[#3c2b1e] dark:text-[#d9c0a5]">
                Access your projects, updates, and discussions.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 text-left">
                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-200">
                    {error}
                  </div>
                )}
                {showRegisteredMessage && (
                  <div className="rounded-xl border border-emerald-600/20 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200">
                    Account created. You can now sign in.
                  </div>
                )}
                {showPasswordResetMessage && (
                  <div className="rounded-xl border border-emerald-600/20 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200">
                    Password reset successful. Please sign in with your new password.
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-[0.2em] text-[#3f2d20] dark:text-[#d7bb9c]">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    {...register("email")}
                    className={`h-11 rounded-xl border-[#6f5138]/35 bg-[#fffef9] text-[15px] text-[#1f130b] placeholder:text-[#6f5845] focus-visible:ring-[#1d6a66]/45 dark:border-[#c8a481]/35 dark:bg-[#2b231d] dark:text-[#f4e5cf] dark:placeholder:text-[#b89f84] dark:focus-visible:ring-[#3caaa0]/55 ${
                      errors.email ? "border-red-600/40" : ""
                    }`}
                  />
                  {errors.email && <p className="text-sm text-red-700">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs uppercase tracking-[0.2em] text-[#3f2d20] dark:text-[#d7bb9c]">
                      Password
                    </Label>
                    {passwordResetEnabled && (
                      <Link
                        to="/forgot-password"
                        className="text-xs font-semibold tracking-wide text-[#195d59] transition-colors hover:text-[#144846] dark:text-[#61d2c8] dark:hover:text-[#8de7dd]"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    {...register("password")}
                    className={`h-11 rounded-xl border-[#6f5138]/35 bg-[#fffef9] text-[15px] text-[#1f130b] placeholder:text-[#6f5845] focus-visible:ring-[#1d6a66]/45 dark:border-[#c8a481]/35 dark:bg-[#2b231d] dark:text-[#f4e5cf] dark:placeholder:text-[#b89f84] dark:focus-visible:ring-[#3caaa0]/55 ${
                      errors.password ? "border-red-600/40" : ""
                    }`}
                  />
                  {errors.password && <p className="text-sm text-red-700">{errors.password.message}</p>}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-[#215954] bg-[#1d6a66] text-sm font-semibold uppercase tracking-[0.18em] text-[#f6f0e6] transition-all hover:-translate-y-0.5 hover:bg-[#185451] hover:shadow-[0_12px_24px_rgba(24,84,81,0.32)] dark:border-[#3bb5aa] dark:bg-[#247a73] dark:text-[#f8efe2] dark:hover:bg-[#2a948b] dark:hover:shadow-[0_14px_28px_rgba(42,148,139,0.3)]"
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="mt-7 border-t border-[#7f6248]/15 pt-6 dark:border-[#d7bea2]/20">
                <p className="text-sm text-[#3e2d20] dark:text-[#d9c0a5]">
                  New to Tuesday?{" "}
                  <Link
                    to="/register"
                    className="font-semibold text-[#195d59] transition-colors hover:text-[#144846] dark:text-[#61d2c8] dark:hover:text-[#8de7dd]"
                  >
                    Create account
                  </Link>
                </p>
              </div>
            </CardContent>

            <div className="mt-8 border-t border-[#7f6248]/15 pt-5 text-xs uppercase tracking-[0.16em] text-[#4a3423] dark:border-[#d7bea2]/20 dark:text-[#b99f81]">
              Internal workspace access / v0.1.0
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
