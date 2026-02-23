import { api } from "./client"
import type { CreateDocInput, Doc, DocWithChildren, UpdateDocInput } from "./types"

export const policiesApi = {
  list: (): Promise<Doc[]> => {
    return api.get<Doc[]>("/policies")
  },

  getDatabase: (databaseId: string): Promise<DocWithChildren> => {
    return api.get<DocWithChildren>(`/policies/${databaseId}`)
  },

  createDatabase: (input: CreateDocInput): Promise<Doc> => {
    return api.post<Doc>("/policies", input)
  },

  updateDatabase: (databaseId: string, input: UpdateDocInput): Promise<Doc> => {
    return api.patch<Doc>(`/policies/${databaseId}`, input)
  },

  deleteDatabase: (databaseId: string): Promise<void> => {
    return api.delete<void>(`/policies/${databaseId}`)
  },

  createRow: (databaseId: string, input: CreateDocInput): Promise<Doc> => {
    return api.post<Doc>(`/policies/${databaseId}/rows`, input)
  },

  getRow: (databaseId: string, rowId: string): Promise<Doc> => {
    return api.get<Doc>(`/policies/${databaseId}/rows/${rowId}`)
  },

  updateRow: (databaseId: string, rowId: string, input: UpdateDocInput): Promise<Doc> => {
    return api.patch<Doc>(`/policies/${databaseId}/rows/${rowId}`, input)
  },

  deleteRow: (databaseId: string, rowId: string): Promise<void> => {
    return api.delete<void>(`/policies/${databaseId}/rows/${rowId}`)
  },
}
