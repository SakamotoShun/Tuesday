import { api } from "./client"
import type { FavoriteEntityType, FavoriteItem } from "./types"

export const favoritesApi = {
  list: (): Promise<FavoriteItem[]> => {
    return api.get<FavoriteItem[]>("/favorites")
  },

  add: (entityType: FavoriteEntityType, entityId: string): Promise<FavoriteItem> => {
    return api.post<FavoriteItem>("/favorites", { entityType, entityId })
  },

  remove: (entityType: FavoriteEntityType, entityId: string): Promise<{ deleted: boolean }> => {
    return api.delete<{ deleted: boolean }>(`/favorites/${entityType}/${entityId}`)
  },

  reorder: (favoriteIds: string[]): Promise<{ reordered: boolean }> => {
    return api.post<{ reordered: boolean }>("/favorites/reorder", { favoriteIds })
  },
}
