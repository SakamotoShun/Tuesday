import type { ApiError, ApiResponse } from "./types"

const API_BASE = "/api/v1"
const REQUEST_ID_HEADER = "X-Request-Id"

export function captureRequestId(response: Response) {
  return response.headers.get(REQUEST_ID_HEADER)
}

export class ApiErrorResponse extends Error {
  code: string
  details?: Array<{ field: string; message: string }>
  requestId: string | null

  constructor(error: ApiError, requestId: string | null = null) {
    super(error.message)
    this.name = "ApiErrorResponse"
    this.code = error.code
    this.details = error.details
    this.requestId = requestId
  }
}

export class RequestError extends Error {
  requestId: string | null

  constructor(message: string, requestId: string | null = null) {
    super(message)
    this.name = "RequestError"
    this.requestId = requestId
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

    const requestId = captureRequestId(response)

    let data: ApiResponse<T> | { error: ApiError }
    try {
      data = (await response.json()) as ApiResponse<T> | { error: ApiError }
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
