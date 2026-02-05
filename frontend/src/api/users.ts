import { api } from "./client"
import type { User } from "./types"

export const usersApi = {
  listMentionable: () => api.get<User[]>("/users/mentionable"),
}
