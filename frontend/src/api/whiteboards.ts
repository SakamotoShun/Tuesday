import { api } from "./client"
import type { Whiteboard, CreateWhiteboardInput, UpdateWhiteboardInput, User } from "./types"

type BackendWhiteboard = Whiteboard & { createdBy?: User | string }

const normalizeWhiteboard = (whiteboard: BackendWhiteboard): Whiteboard => {
  const createdByUser = whiteboard.createdBy && typeof whiteboard.createdBy === "object"
    ? (whiteboard.createdBy as User)
    : undefined
  const createdById = typeof whiteboard.createdBy === "string"
    ? whiteboard.createdBy
    : createdByUser?.id ?? whiteboard.createdBy

  return {
    ...whiteboard,
    createdBy: createdById as string,
    createdByUser,
  }
}

const normalizeWhiteboards = (whiteboards: BackendWhiteboard[]) =>
  whiteboards.map(normalizeWhiteboard)

export const whiteboardsApi = {
  list: async (projectId: string): Promise<Whiteboard[]> => {
    const whiteboards = await api.get<BackendWhiteboard[]>(`/whiteboards/projects/${projectId}/whiteboards`)
    return normalizeWhiteboards(whiteboards)
  },

  get: async (whiteboardId: string): Promise<Whiteboard> => {
    const whiteboard = await api.get<BackendWhiteboard>(`/whiteboards/${whiteboardId}`)
    return normalizeWhiteboard(whiteboard)
  },

  create: async (projectId: string, input: CreateWhiteboardInput): Promise<Whiteboard> => {
    const whiteboard = await api.post<BackendWhiteboard>(`/whiteboards/projects/${projectId}/whiteboards`, input)
    return normalizeWhiteboard(whiteboard)
  },

  update: async (whiteboardId: string, input: UpdateWhiteboardInput): Promise<Whiteboard> => {
    const whiteboard = await api.patch<BackendWhiteboard>(`/whiteboards/${whiteboardId}`, input)
    return normalizeWhiteboard(whiteboard)
  },

  delete: (whiteboardId: string): Promise<void> => {
    return api.delete<void>(`/whiteboards/${whiteboardId}`)
  },
}
