import type { ApiError, ApiResponse } from "@/api/types"
import { ApiErrorResponse, RequestError, captureRequestId } from "@/api/client"
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

  const requestId = captureRequestId(response)

  let data: ApiResponse<FileAttachment> | { error: ApiError }
  try {
    data = (await response.json()) as ApiResponse<FileAttachment> | { error: ApiError }
  } catch {
    throw new RequestError("Invalid API response format", requestId)
  }

  if (!response.ok) {
    if ("error" in data) {
      throw new ApiErrorResponse(data.error, requestId)
    }
    throw new RequestError("Unknown API error", requestId)
  }

  if ("data" in data) {
    return data.data
  }

  throw new RequestError("Invalid API response format", requestId)
}

export const getFileUrl = (fileId: string) => `${API_BASE}/files/${fileId}`

export async function deleteFile(fileId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/files/${fileId}`, {
    method: "DELETE",
    credentials: "include",
  })

  captureRequestId(response)

  // Ignore errors - file may already be deleted, attached, or not found
  // This is a best-effort cleanup
  if (!response.ok) {
    return
  }
}
