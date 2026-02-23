import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { driver, type Driver } from "driver.js"
import { useNavigate } from "react-router-dom"
import "driver.js/dist/driver.css"
import { completeOnboarding } from "@/api/onboarding"
import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/store/auth-store"
import { getTourSteps } from "./tour-config"

interface OnboardingContextValue {
  startTour: () => void
  isTourActive: boolean
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null)

interface OnboardingProviderProps {
  children: React.ReactNode
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { user } = useAuth()
  const { setUser } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isTourActive, setIsTourActive] = useState(false)
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)

  const markCompleted = useMutation({
    mutationFn: completeOnboarding,
    onSuccess: (data) => {
      if (!user) {
        return
      }

      const completedAt = data.onboardingCompletedAt ?? new Date().toISOString()
      const updatedUser = {
        ...user,
        onboardingCompletedAt: completedAt,
      }

      setUser(updatedUser)
      queryClient.setQueryData(["auth", "me"], updatedUser)
    },
  })

  const launchTour = useCallback(
    (persistCompletion: boolean) => {
      if (!user) {
        return false
      }

      const steps = getTourSteps(user.role, (path) => navigate(path))
      if (steps.length === 0) {
        return false
      }

      if (driverRef.current?.isActive()) {
        driverRef.current.destroy()
      }

      const shouldPersistCompletion = persistCompletion && !user.onboardingCompletedAt

      const tour = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayClickBehavior: "close",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        stagePadding: 8,
        popoverClass: "workhub-tour-popover",
        onDestroyed: () => {
          setIsTourActive(false)

          if (shouldPersistCompletion) {
            markCompleted.mutate()
          }
        },
      })

      tour.setSteps(steps)
      tour.drive()

      driverRef.current = tour
      setIsTourActive(true)

      return true
    },
    [markCompleted, navigate, user]
  )

  const startTour = useCallback(() => {
    launchTour(false)
  }, [launchTour])

  useEffect(() => {
    if (!user) {
      autoStartedRef.current = false
      if (driverRef.current?.isActive()) {
        driverRef.current.destroy()
      }
      return
    }

    if (user.onboardingCompletedAt || autoStartedRef.current) {
      return
    }

    autoStartedRef.current = true

    const timer = window.setTimeout(() => {
      const started = launchTour(true)
      if (!started) {
        autoStartedRef.current = false
      }
    }, 200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [launchTour, user])

  const value = useMemo(
    () => ({
      startTour,
      isTourActive,
    }),
    [isTourActive, startTour]
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}
