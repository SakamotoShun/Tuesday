import { api } from "./client"
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  User,
} from "./types"

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

export async function forgotPassword(data: ForgotPasswordInput): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/forgot-password", data)
}

export async function resetPassword(data: ResetPasswordInput): Promise<{ reset: boolean }> {
  return api.post<{ reset: boolean }>("/auth/reset-password", data)
}
