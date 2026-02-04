import { api } from "./client"
import type { Doc, CreateDocInput, UpdateDocInput } from "./types"

export const docsApi = {
  list: (projectId: string): Promise<Doc[]> => {
    return api.get<Doc[]>(`/docs/projects/${projectId}/docs`)
  },

  listPersonal: (): Promise<Doc[]> => {
    return api.get<Doc[]>("/docs/personal")
  },

  get: (docId: string): Promise<Doc> => {
    return api.get<Doc>(`/docs/${docId}`)
  },

  create: (projectId: string, input: CreateDocInput): Promise<Doc> => {
    return api.post<Doc>(`/docs/projects/${projectId}/docs`, input)
  },

  createPersonal: (input: CreateDocInput): Promise<Doc> => {
    return api.post<Doc>("/docs/personal", input)
  },

  update: (docId: string, input: UpdateDocInput): Promise<Doc> => {
    return api.patch<Doc>(`/docs/${docId}`, input)
  },

  delete: (docId: string): Promise<void> => {
    return api.delete<void>(`/docs/${docId}`)
  },
}
