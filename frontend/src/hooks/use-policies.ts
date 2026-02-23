import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { policiesApi } from "@/api/policies"
import type { CreateDocInput, Doc, DocWithChildren, UpdateDocInput } from "@/api/types"

const policyDatabasesQueryKey = ["policies", "databases"]

export function usePolicies() {
  const queryClient = useQueryClient()

  const databases = useQuery({
    queryKey: policyDatabasesQueryKey,
    queryFn: () => policiesApi.list(),
  })

  const createDatabase = useMutation({
    mutationFn: (data: CreateDocInput) => policiesApi.createDatabase(data),
    onSuccess: (database) => {
      queryClient.invalidateQueries({ queryKey: policyDatabasesQueryKey })
      queryClient.setQueryData(["policies", "database", database.id], {
        ...database,
        children: [],
      } satisfies DocWithChildren)
    },
  })

  const updateDatabase = useMutation({
    mutationFn: ({ databaseId, data }: { databaseId: string; data: UpdateDocInput }) =>
      policiesApi.updateDatabase(databaseId, data),
    onSuccess: (database) => {
      queryClient.invalidateQueries({ queryKey: policyDatabasesQueryKey })
      queryClient.setQueryData(["policies", "database", database.id], (current?: DocWithChildren) => {
        if (!current) return current
        return { ...current, ...database }
      })
    },
  })

  const deleteDatabase = useMutation({
    mutationFn: (databaseId: string) => policiesApi.deleteDatabase(databaseId),
    onSuccess: (_, databaseId) => {
      queryClient.invalidateQueries({ queryKey: policyDatabasesQueryKey })
      queryClient.removeQueries({ queryKey: ["policies", "database", databaseId] })
    },
  })

  const createRow = useMutation({
    mutationFn: ({ databaseId, data }: { databaseId: string; data: CreateDocInput }) =>
      policiesApi.createRow(databaseId, data),
    onSuccess: (row, variables) => {
      queryClient.invalidateQueries({ queryKey: ["policies", "database", variables.databaseId] })
      queryClient.setQueryData(["policies", "row", variables.databaseId, row.id], row)
    },
  })

  const updateRow = useMutation({
    mutationFn: ({ databaseId, rowId, data }: { databaseId: string; rowId: string; data: UpdateDocInput }) =>
      policiesApi.updateRow(databaseId, rowId, data),
    onSuccess: (row, variables) => {
      queryClient.invalidateQueries({ queryKey: ["policies", "database", variables.databaseId] })
      queryClient.setQueryData(["policies", "row", variables.databaseId, row.id], (current?: Doc) => {
        if (!current) return current
        return { ...current, ...row }
      })
    },
  })

  const deleteRow = useMutation({
    mutationFn: ({ databaseId, rowId }: { databaseId: string; rowId: string }) =>
      policiesApi.deleteRow(databaseId, rowId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["policies", "database", variables.databaseId] })
      queryClient.removeQueries({ queryKey: ["policies", "row", variables.databaseId, variables.rowId] })
    },
  })

  return {
    databases: databases.data ?? [],
    isLoading: databases.isLoading,
    error: databases.error,
    createDatabase,
    updateDatabase,
    deleteDatabase,
    createRow,
    updateRow,
    deleteRow,
  }
}

export function usePolicyDatabase(databaseId: string) {
  return useQuery({
    queryKey: ["policies", "database", databaseId],
    queryFn: () => policiesApi.getDatabase(databaseId),
    enabled: !!databaseId,
  })
}

export function usePolicyRow(databaseId: string, rowId: string) {
  return useQuery({
    queryKey: ["policies", "row", databaseId, rowId],
    queryFn: () => policiesApi.getRow(databaseId, rowId),
    enabled: !!databaseId && !!rowId,
  })
}
