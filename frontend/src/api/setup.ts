import { api } from "./client"
import type { SetupStatus, SetupInput } from "./types"

export async function getStatus(): Promise<SetupStatus> {
  return api.get<SetupStatus>("/setup/status")
}

export async function complete(data: SetupInput): Promise<{ message: string }> {
  return api.post<{ message: string }>("/setup/complete", data)
}
