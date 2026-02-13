import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as adminApi from "@/api/admin"
import type {
  AdminCreateUserInput,
  AdminDeleteUserInput,
  AdminUpdateUserInput,
  UpdateAdminSettingsInput,
  ProjectStatus,
  TaskStatus,
  AdminUserOwnerships,
} from "@/api/types"

export function useAdminTemplates() {
  const queryClient = useQueryClient()

  const templatesQuery = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: adminApi.listTemplates,
  })

  const projectsQuery = useQuery({
    queryKey: ["admin", "templates", "projects"],
    queryFn: adminApi.listNonTemplateProjects,
  })

  const toggleTemplate = useMutation({
    mutationFn: ({ projectId, isTemplate }: { projectId: string; isTemplate: boolean }) =>
      adminApi.toggleTemplate(projectId, isTemplate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["project-templates"] })
    },
  })

  return {
    templates: templatesQuery.data ?? [],
    projects: projectsQuery.data ?? [],
    isLoading: templatesQuery.isLoading || projectsQuery.isLoading,
    error: templatesQuery.error || projectsQuery.error,
    toggleTemplate,
  }
}

export function useAdminSettings() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: adminApi.getSettings,
  })

  const updateSettings = useMutation({
    mutationFn: (data: UpdateAdminSettingsInput) => adminApi.updateSettings(data),
    onSuccess: (data) => queryClient.setQueryData(["admin", "settings"], data),
  })

  return { settings: settingsQuery.data, isLoading: settingsQuery.isLoading, error: settingsQuery.error, updateSettings }
}

export function useAdminUsers() {
  const queryClient = useQueryClient()
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: adminApi.listUsers,
  })

  const createUser = useMutation({
    mutationFn: (data: AdminCreateUserInput) => adminApi.createUser(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  })

  const updateUser = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: AdminUpdateUserInput }) =>
      adminApi.updateUser(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  })

  const deleteUser = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: AdminDeleteUserInput }) =>
      adminApi.deleteUser(userId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "users", variables.userId, "ownerships"] })
    },
  })

  return {
    users: usersQuery.data ?? [],
    isLoading: usersQuery.isLoading,
    error: usersQuery.error,
    createUser,
    updateUser,
    deleteUser,
  }
}

export function useAdminUserOwnerships(userId?: string, enabled = true) {
  return useQuery<AdminUserOwnerships>({
    queryKey: ["admin", "users", userId, "ownerships"],
    queryFn: () => adminApi.getUserOwnerships(userId ?? ""),
    enabled: Boolean(userId) && enabled,
  })
}

export function useAdminStatuses() {
  const queryClient = useQueryClient()

  const projectStatusesQuery = useQuery({
    queryKey: ["admin", "statuses", "project"],
    queryFn: adminApi.listProjectStatuses,
  })

  const taskStatusesQuery = useQuery({
    queryKey: ["admin", "statuses", "task"],
    queryFn: adminApi.listTaskStatuses,
  })

  const createProjectStatus = useMutation({
    mutationFn: (data: Pick<ProjectStatus, "name" | "color" | "sortOrder">) => adminApi.createProjectStatus(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "project"] }),
  })

  const updateProjectStatus = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<ProjectStatus, "name" | "color" | "sortOrder">> }) =>
      adminApi.updateProjectStatus(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "project"] }),
  })

  const deleteProjectStatus = useMutation({
    mutationFn: (id: string) => adminApi.deleteProjectStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "project"] }),
  })

  const createTaskStatus = useMutation({
    mutationFn: (data: Pick<TaskStatus, "name" | "color" | "sortOrder">) => adminApi.createTaskStatus(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "task"] }),
  })

  const updateTaskStatus = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<TaskStatus, "name" | "color" | "sortOrder">> }) =>
      adminApi.updateTaskStatus(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "task"] }),
  })

  const deleteTaskStatus = useMutation({
    mutationFn: (id: string) => adminApi.deleteTaskStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "statuses", "task"] }),
  })

  return {
    projectStatuses: projectStatusesQuery.data ?? [],
    taskStatuses: taskStatusesQuery.data ?? [],
    createProjectStatus,
    updateProjectStatus,
    deleteProjectStatus,
    createTaskStatus,
    updateTaskStatus,
    deleteTaskStatus,
  }
}

export function useAdminBots() {
  const queryClient = useQueryClient()

  const botsQuery = useQuery({
    queryKey: ["admin", "bots"],
    queryFn: adminApi.listBots,
  })

  const availableChannelsQuery = useQuery({
    queryKey: ["admin", "bots", "channels"],
    queryFn: adminApi.listBotAvailableChannels,
  })

  const createBot = useMutation({
    mutationFn: (data: { name: string; avatarUrl?: string | null; type?: "webhook" | "ai"; systemPrompt?: string | null; model?: string | null }) => adminApi.createBot(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "bots"] }),
  })

  const updateBot = useMutation({
    mutationFn: ({ botId, data }: { botId: string; data: { name?: string; avatarUrl?: string | null; isDisabled?: boolean; systemPrompt?: string | null; model?: string | null } }) =>
      adminApi.updateBot(botId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "bots"] }),
  })

  const deleteBot = useMutation({
    mutationFn: (botId: string) => adminApi.deleteBot(botId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "bots"] }),
  })

  const regenerateToken = useMutation({
    mutationFn: (botId: string) => adminApi.regenerateBotToken(botId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "bots"] }),
  })

  const addBotToChannel = useMutation({
    mutationFn: ({ botId, channelId }: { botId: string; channelId: string }) => adminApi.addBotToChannel(botId, channelId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "bots", variables.botId, "channels"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "bots", "channels"] })
    },
  })

  const removeBotFromChannel = useMutation({
    mutationFn: ({ botId, channelId }: { botId: string; channelId: string }) => adminApi.removeBotFromChannel(botId, channelId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "bots", variables.botId, "channels"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "bots", "channels"] })
    },
  })

  return {
    bots: botsQuery.data ?? [],
    availableChannels: availableChannelsQuery.data ?? [],
    isLoading: botsQuery.isLoading || availableChannelsQuery.isLoading,
    error: botsQuery.error || availableChannelsQuery.error,
    createBot,
    updateBot,
    deleteBot,
    regenerateToken,
    addBotToChannel,
    removeBotFromChannel,
  }
}

export function useAdminBotChannels(botId?: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "bots", botId, "channels"],
    queryFn: () => adminApi.listBotChannels(botId ?? ""),
    enabled: Boolean(botId) && enabled,
  })
}

export function useAdminTimesheet(week: string) {
  return useQuery({
    queryKey: ["admin", "timesheet", week],
    queryFn: () => adminApi.getWorkspaceWeeklyTimesheet(week),
    enabled: !!week,
  })
}

export function useAdminMonthlyTimesheet(month: string) {
  return useQuery({
    queryKey: ["admin", "timesheet", "overview", month],
    queryFn: () => adminApi.getWorkspaceMonthlyOverview(month),
    enabled: !!month,
  })
}

export function useExportAdminTimesheet() {
  return useMutation({
    mutationFn: ({ start, end }: { start: string; end: string }) =>
      adminApi.exportWorkspaceTimesheetCsv(start, end),
  })
}

export function useAdminPayrollSummary(query: adminApi.PayrollQuery) {
  return useQuery({
    queryKey: ["admin", "payroll", "summary", query],
    queryFn: () => adminApi.getPayrollSummary(query),
    enabled: !!query.start && !!query.end,
  })
}

export function useAdminPayrollBreakdown(query: adminApi.PayrollQuery) {
  return useQuery({
    queryKey: ["admin", "payroll", "breakdown", query],
    queryFn: () => adminApi.getPayrollBreakdown(query),
    enabled: !!query.start && !!query.end,
  })
}

export function useExportAdminPayroll() {
  return useMutation({
    mutationFn: (query: Omit<adminApi.PayrollQuery, "page" | "pageSize">) =>
      adminApi.exportPayrollCsv(query),
  })
}
