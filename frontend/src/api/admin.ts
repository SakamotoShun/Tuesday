import { api } from "./client"
import type { AdminSettings, UpdateAdminSettingsInput } from "./types"

export async function getSettings(): Promise<AdminSettings> {
  return api.get<AdminSettings>("/admin/settings")
}

export async function updateSettings(data: UpdateAdminSettingsInput): Promise<AdminSettings> {
  return api.patch<AdminSettings>("/admin/settings", data)
}
