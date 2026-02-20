import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { favoritesApi } from "@/api/favorites"
import type { FavoriteEntityType } from "@/api/types"

export function useFavorites() {
  const queryClient = useQueryClient()

  const favoritesQuery = useQuery({
    queryKey: ["favorites"],
    queryFn: favoritesApi.list,
  })

  const addFavorite = useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: FavoriteEntityType; entityId: string }) =>
      favoritesApi.add(entityType, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] })
    },
  })

  const removeFavorite = useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: FavoriteEntityType; entityId: string }) =>
      favoritesApi.remove(entityType, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] })
    },
  })

  const reorderFavorites = useMutation({
    mutationFn: (favoriteIds: string[]) => favoritesApi.reorder(favoriteIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] })
    },
  })

  const favorites = favoritesQuery.data ?? []
  const favoriteLookup = useMemo(() => {
    return new Set(favorites.map((item) => `${item.entityType}:${item.entityId}`))
  }, [favorites])

  const isFavorite = (entityType: FavoriteEntityType, entityId: string) => {
    return favoriteLookup.has(`${entityType}:${entityId}`)
  }

  return {
    favorites,
    isLoading: favoritesQuery.isLoading,
    error: favoritesQuery.error,
    addFavorite,
    removeFavorite,
    reorderFavorites,
    isFavorite,
  }
}
