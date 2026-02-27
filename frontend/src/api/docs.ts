import { api } from "./client"
import type {
  Doc,
  DocShare,
  DocWithChildren,
  CreateDocInput,
  UpdateDocInput,
  UpdateDocSharesInput,
  SharedDocShareLink,
  SharedDocView,
} from "./types"

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

  getWithChildren: (docId: string): Promise<DocWithChildren> => {
    return api.get<DocWithChildren>(`/docs/${docId}/children`)
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

  listShares: (docId: string): Promise<DocShare[]> => {
    return api.get<DocShare[]>(`/docs/${docId}/shares`)
  },

  updateShares: (docId: string, input: UpdateDocSharesInput): Promise<DocShare[]> => {
    return api.put<DocShare[]>(`/docs/${docId}/shares`, input)
  },

  getShareLink: (docId: string): Promise<SharedDocShareLink | null> => {
    return api.get<SharedDocShareLink | null>(`/docs/${docId}/share-link`)
  },

  createShareLink: (docId: string): Promise<SharedDocShareLink> => {
    return api.put<SharedDocShareLink>(`/docs/${docId}/share-link`, {})
  },

  deleteShareLink: (docId: string): Promise<{ deleted: boolean }> => {
    return api.delete<{ deleted: boolean }>(`/docs/${docId}/share-link`)
  },

  getSharedDoc: (token: string): Promise<SharedDocView> => {
    return api.get<SharedDocView>(`/shared/docs/${token}`)
  },

  delete: (docId: string): Promise<void> => {
    return api.delete<void>(`/docs/${docId}`)
  },
}
