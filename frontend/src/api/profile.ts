import { api, ApiErrorResponse } from "./client"
import type { ApiError, ApiResponse, User } from "./types"

const API_BASE = "/api/v1"

export interface UpdateProfileInput {
  name?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export async function getProfile(): Promise<User> {
  const response = await api.get<{ user: User }>("/profile")
  return response.user
}

export async function updateProfile(data: UpdateProfileInput): Promise<User> {
  const response = await api.patch<{ user: User }>("/profile", data)
  return response.user
}

export async function uploadAvatar(file: File): Promise<User> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE}/profile/avatar`, {
    method: "POST",
    body: formData,
    credentials: "include",
  })

  const data = (await response.json()) as ApiResponse<{ user: User }> | { error: ApiError }

  if (!response.ok) {
    if ("error" in data) {
      throw new ApiErrorResponse(data.error)
    }
    throw new Error("Unknown API error")
  }

  if ("data" in data) {
    return data.data.user
  }

  throw new Error("Invalid API response format")
}

export async function removeAvatar(): Promise<User> {
  const response = await api.delete<{ user: User }>("/profile/avatar")
  return response.user
}

export async function changePassword(data: ChangePasswordInput): Promise<{ changed: true }> {
  return api.post<{ changed: true }>("/profile/password", data)
}
