export type DocSortField = "updatedAt" | "createdAt" | "title"

export type DocSortDirection = "asc" | "desc"

export interface DocSortSettings {
  field: DocSortField
  direction: DocSortDirection
}

export const DEFAULT_DOC_SORT: DocSortSettings = {
  field: "updatedAt",
  direction: "desc",
}

export const DOC_SORT_FIELD_LABELS: Record<DocSortField, string> = {
  updatedAt: "Updated date",
  createdAt: "Created date",
  title: "Title",
}

export const DOC_SORT_DIRECTION_LABELS: Record<DocSortDirection, string> = {
  asc: "Ascending",
  desc: "Descending",
}

export function isDocSortField(value: unknown): value is DocSortField {
  return value === "updatedAt" || value === "createdAt" || value === "title"
}

export function isDocSortDirection(value: unknown): value is DocSortDirection {
  return value === "asc" || value === "desc"
}
