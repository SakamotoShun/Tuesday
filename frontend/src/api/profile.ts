import { api, ApiErrorResponse } from "./client"
import type { ApiError, ApiResponse, User } from "./types"

const API_BASE = "/api/v1"

type BackendUser = Omit<User, "hourlyRate"> & { hourlyRate: string | number | null }

function normalizeUser(user: BackendUser): User {
  return {
    ...user,
    hourlyRate: user.hourlyRate === null ? null : Number(user.hourlyRate),
  }
}

export interface UpdateProfileInput {
  name?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export async function getProfile(): Promise<User> {
  const response = await api.get<{ user: BackendUser }>("/profile")
  return normalizeUser(response.user)
}

export async function updateProfile(data: UpdateProfileInput): Promise<User> {
  const response = await api.patch<{ user: BackendUser }>("/profile", data)
  return normalizeUser(response.user)
}

export async function uploadAvatar(file: File): Promise<User> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE}/profile/avatar`, {
    method: "POST",
    body: formData,
    credentials: "include",
  })

  const data = (await response.json()) as ApiResponse<{ user: BackendUser }> | { error: ApiError }

  if (!response.ok) {
    if ("error" in data) {
      throw new ApiErrorResponse(data.error)
    }
    throw new Error("Unknown API error")
  }

  if ("data" in data) {
    return normalizeUser(data.data.user)
  }

  throw new Error("Invalid API response format")
}

export async function removeAvatar(): Promise<User> {
  const response = await api.delete<{ user: BackendUser }>("/profile/avatar")
  return normalizeUser(response.user)
}

export async function changePassword(data: ChangePasswordInput): Promise<{ changed: true }> {
  return api.post<{ changed: true }>("/profile/password", data)
}
