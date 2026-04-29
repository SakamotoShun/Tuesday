import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ApiErrorResponse } from "@/api/client"
import type { User } from "@/api/types"
import { useProfile } from "@/hooks/use-profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const changeEmailSchema = z.object({
  newEmail: z.string().trim().min(1, "Email is required").email("Invalid email format").max(255, "Email must be less than 255 characters"),
  currentPassword: z.string().min(1, "Current password is required"),
})

type ChangeEmailFormData = z.infer<typeof changeEmailSchema>

interface ChangeEmailFormProps {
  user: User
}

export function ChangeEmailForm({ user }: ChangeEmailFormProps) {
  const { changeEmail } = useProfile()
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangeEmailFormData>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: {
      newEmail: user.email,
      currentPassword: "",
    },
  })

  useEffect(() => {
    reset({
      newEmail: user.email,
      currentPassword: "",
    })
  }, [reset, user.email])

  const watchedEmail = watch("newEmail") ?? ""
  const normalizedEmail = watchedEmail.trim()
  const isEmailDirty = normalizedEmail !== user.email

  const onSubmit = async (data: ChangeEmailFormData) => {
    try {
      setFormError(null)
      setFormNotice(null)
      await changeEmail.mutateAsync({
        newEmail: data.newEmail.trim(),
        currentPassword: data.currentPassword,
      })
      setFormNotice("Email updated")
      reset({
        newEmail: data.newEmail.trim(),
        currentPassword: "",
      })
    } catch (error) {
      if (error instanceof ApiErrorResponse) {
        setFormError(error.message)
      } else {
        setFormError("An unexpected error occurred")
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {formError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </div>
      )}
      {formNotice && <div className="text-sm text-primary">{formNotice}</div>}

      <div className="space-y-2">
        <Label htmlFor="new-email">New email</Label>
        <Input
          id="new-email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          {...register("newEmail")}
          className={errors.newEmail ? "border-destructive" : ""}
          disabled={changeEmail.isPending}
        />
        {errors.newEmail && (
          <p className="text-sm text-destructive">{errors.newEmail.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="current-password-for-email">Current password</Label>
        <Input
          id="current-password-for-email"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          {...register("currentPassword")}
          className={errors.currentPassword ? "border-destructive" : ""}
          disabled={changeEmail.isPending}
        />
        {errors.currentPassword && (
          <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
        )}
      </div>

      <Button type="submit" disabled={!isEmailDirty || isSubmitting || changeEmail.isPending}>
        {isSubmitting || changeEmail.isPending ? "Updating..." : "Update email"}
      </Button>
    </form>
  )
}
