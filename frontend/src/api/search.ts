import { api } from "./client"
import type { GlobalSearchResults } from "./types"

export async function search(query: string, limit = 6): Promise<GlobalSearchResults> {
  const params = new URLSearchParams()
  params.set("q", query)
  params.set("limit", String(limit))
  return api.get<GlobalSearchResults>(`/search?${params.toString()}`)
}
