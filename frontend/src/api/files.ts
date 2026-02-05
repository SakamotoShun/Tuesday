import type { ApiError, ApiResponse } from "@/api/types"
import { ApiErrorResponse } from "@/api/client"
import type { FileAttachment } from "@/api/types"

const API_BASE = "/api/v1"

export async function uploadFile(file: File): Promise<FileAttachment> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE}/files`, {
    method: "POST",
    body: formData,
    credentials: "include",
  })

  const data = (await response.json()) as ApiResponse<FileAttachment> | { error: ApiError }

  if (!response.ok) {
    if ("error" in data) {
      throw new ApiErrorResponse(data.error)
    }
    throw new Error("Unknown API error")
  }

  if ("data" in data) {
    return data.data
  }

  throw new Error("Invalid API response format")
}

export const getFileUrl = (fileId: string) => `${API_BASE}/files/${fileId}`

export async function deleteFile(fileId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/files/${fileId}`, {
    method: "DELETE",
    credentials: "include",
  })

  // Ignore errors - file may already be deleted, attached, or not found
  // This is a best-effort cleanup
  if (!response.ok) {
    return
  }
}
