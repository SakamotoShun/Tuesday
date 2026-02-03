import { api } from "./client"
import type { User, LoginInput, RegisterInput } from "./types"

export async function login(data: LoginInput): Promise<User> {
  const response = await api.post<{ user: User }>("/auth/login", data)
  return response.user
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout", {})
}

export async function register(data: RegisterInput): Promise<User> {
  const response = await api.post<{ user: User }>("/auth/register", data)
  return response.user
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<{ user: User }>("/auth/me")
  return response.user
}
