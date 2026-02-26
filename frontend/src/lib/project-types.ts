export const PROJECT_TYPE_OPTIONS = [
  { value: "Client Project", label: "Client Project" },
  { value: "Internal", label: "Internal" },
  { value: "Research", label: "Research" },
] as const

export function normalizeProjectType(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}
