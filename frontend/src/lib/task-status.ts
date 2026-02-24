export function isCompletedStatus(statusName?: string | null): boolean {
  if (!statusName) {
    return false
  }

  const normalized = statusName.toLowerCase()
  return normalized.includes("done") || normalized.includes("complete")
}
