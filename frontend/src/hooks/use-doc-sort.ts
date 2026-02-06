import { useEffect, useState } from "react"
import {
  DEFAULT_DOC_SORT,
  isDocSortDirection,
  isDocSortField,
  type DocSortSettings,
} from "@/components/docs/doc-sorting"

function readStoredDocSort(storageKey: string): DocSortSettings {
  if (typeof window === "undefined") {
    return DEFAULT_DOC_SORT
  }

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) {
    return DEFAULT_DOC_SORT
  }

  try {
    const parsed = JSON.parse(raw) as { field?: unknown; direction?: unknown }
    if (!isDocSortField(parsed.field) || !isDocSortDirection(parsed.direction)) {
      return DEFAULT_DOC_SORT
    }

    return {
      field: parsed.field,
      direction: parsed.direction,
    }
  } catch {
    return DEFAULT_DOC_SORT
  }
}

export function useDocSort(storageKey: string) {
  const [sort, setSort] = useState<DocSortSettings>(() => readStoredDocSort(storageKey))

  useEffect(() => {
    setSort(readStoredDocSort(storageKey))
  }, [storageKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(storageKey, JSON.stringify(sort))
  }, [storageKey, sort])

  return {
    sort,
    setSort,
  }
}
