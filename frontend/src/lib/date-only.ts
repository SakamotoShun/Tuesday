function padDatePart(value: number): string {
  return String(value).padStart(2, "0")
}

export function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function parseDateOnly(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function addDaysToDateOnly(value: string, days: number): string {
  const date = parseDateOnly(value)
  date.setDate(date.getDate() + days)
  return formatDateOnly(date)
}

export function getDateOnlyRange(start: string, length: number): string[] {
  return Array.from({ length }, (_, index) => addDaysToDateOnly(start, index))
}
