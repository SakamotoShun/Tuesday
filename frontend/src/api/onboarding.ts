import { api } from "./client"

export interface CompleteOnboardingResponse {
  completed: true
  onboardingCompletedAt: string | null
}

export async function completeOnboarding(): Promise<CompleteOnboardingResponse> {
  return api.patch<CompleteOnboardingResponse>("/users/me/onboarding", {})
}
