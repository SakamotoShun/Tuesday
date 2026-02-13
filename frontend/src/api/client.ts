import type { ApiError, ApiResponse } from "./types"

const API_BASE = "/api/v1"

export class ApiErrorResponse extends Error {
  code: string
  details?: Array<{ field: string; message: string }>

  constructor(error: ApiError) {
    super(error.message)
    this.name = "ApiErrorResponse"
    this.code = error.code
    this.details = error.details
  }
}

class ApiClient {
  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })

    const data = (await response.json()) as ApiResponse<T> | { error: ApiError }

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

  get<T>(path: string) {
    return this.request<T>(path, { method: "GET" })
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    })
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    })
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" })
  }
}

export const api = new ApiClient()
