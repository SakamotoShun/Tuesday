import { api } from "./client"
import type { User, LoginInput, RegisterInput } from "./types"

type BackendUser = Omit<User, "hourlyRate"> & { hourlyRate: string | number | null }

function normalizeUser(user: BackendUser): User {
  return {
    ...user,
    hourlyRate: user.hourlyRate === null ? null : Number(user.hourlyRate),
  }
}

export async function login(data: LoginInput): Promise<User> {
  const response = await api.post<{ user: BackendUser }>("/auth/login", data)
  return normalizeUser(response.user)
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout", {})
}

export async function register(data: RegisterInput): Promise<User> {
  const response = await api.post<{ user: BackendUser }>("/auth/register", data)
  return normalizeUser(response.user)
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<{ user: BackendUser }>("/auth/me")
  return normalizeUser(response.user)
}
