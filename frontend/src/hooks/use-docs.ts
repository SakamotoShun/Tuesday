import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { docsApi } from "@/api/docs"
import type { CreateDocInput, UpdateDocInput } from "@/api/types"

export function useDocs(projectId: string) {
  const queryClient = useQueryClient()

  const docs = useQuery({
    queryKey: ["projects", projectId, "docs"],
    queryFn: () => docsApi.list(projectId),
    enabled: !!projectId,
  })

  const createDoc = useMutation({
    mutationFn: (data: CreateDocInput) => docsApi.create(projectId, data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "docs"],
      })
      queryClient.setQueryData(["docs", doc.id], doc)
    },
  })

  const updateDoc = useMutation({
    mutationFn: ({ docId, data }: { docId: string; data: UpdateDocInput }) =>
      docsApi.update(docId, data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "docs"],
      })
      queryClient.setQueryData(["docs", doc.id], doc)
    },
  })

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => docsApi.delete(docId),
    onSuccess: (_, docId) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "docs"],
      })
      queryClient.removeQueries({ queryKey: ["docs", docId] })
    },
  })

  return {
    docs: docs.data ?? [],
    isLoading: docs.isLoading,
    error: docs.error,
    createDoc,
    updateDoc,
    deleteDoc,
  }
}

export function useDoc(docId: string) {
  return useQuery({
    queryKey: ["docs", docId],
    queryFn: () => docsApi.get(docId),
    enabled: !!docId,
  })
}

export function usePersonalDocs() {
  return useQuery({
    queryKey: ["docs", "personal"],
    queryFn: () => docsApi.listPersonal(),
  })
}
