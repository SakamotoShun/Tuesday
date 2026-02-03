import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as projectsApi from "@/api/projects"
import type { CreateProjectInput, UpdateProjectInput } from "@/api/types"

export function useProjects() {
  const queryClient = useQueryClient()

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  })

  const createProject = useMutation({
    mutationFn: (data: CreateProjectInput) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const updateProject = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectInput }) =>
      projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const deleteProject = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  return {
    projects: projects.data ?? [],
    isLoading: projects.isLoading,
    error: projects.error,
    createProject,
    updateProject,
    deleteProject,
  }
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  })
}
