import { api } from "./client"
import type {
  NoticeBoardItem,
  CreateNoticeBoardItemInput,
  UpdateNoticeBoardItemInput,
} from "./types"

export const noticeBoardApi = {
  list: () => api.get<NoticeBoardItem[]>("/notice-board"),

  create: (input: CreateNoticeBoardItemInput) =>
    api.post<NoticeBoardItem>("/notice-board", input),

  update: (id: string, input: UpdateNoticeBoardItemInput) =>
    api.patch<NoticeBoardItem>(`/notice-board/${id}`, input),

  delete: (id: string) => api.delete<{ deleted: boolean }>(`/notice-board/${id}`),

  toggle: (id: string) => api.patch<NoticeBoardItem>(`/notice-board/${id}/toggle`, {}),
}
