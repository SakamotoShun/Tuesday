import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import * as searchApi from "@/api/search"
import { useDebounce } from "@/hooks/use-debounce"
import { Logo } from "./logo"
import { UserMenu } from "./user-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"

const MIN_SEARCH_LENGTH = 2
const RESULTS_LIMIT = 6

function getDocPath(docId: string, projectId: string | null) {
  if (projectId) {
    return `/projects/${projectId}/docs/${docId}`
  }
  return `/docs/personal/${docId}`
}

export function TopBar() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [isFocused, setIsFocused] = useState(false)

  const debouncedQuery = useDebounce(query, 250)
  const normalizedQuery = debouncedQuery.trim()

  const { data, isLoading } = useQuery({
    queryKey: ["global-search", normalizedQuery],
    queryFn: () => searchApi.search(normalizedQuery, RESULTS_LIMIT),
    enabled: normalizedQuery.length >= MIN_SEARCH_LENGTH,
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const projects = data?.projects ?? []
  const docs = data?.docs ?? []
  const tasks = data?.tasks ?? []

  const firstResultPath = useMemo(() => {
    if (projects[0]) {
      return `/projects/${projects[0].id}`
    }

    if (docs[0]) {
      return getDocPath(docs[0].id, docs[0].projectId)
    }

    if (tasks[0]) {
      return `/projects/${tasks[0].projectId}/tasks`
    }

    return null
  }, [docs, projects, tasks])

  const hasResults = projects.length > 0 || docs.length > 0 || tasks.length > 0
  const shouldShowDropdown = isFocused && query.trim().length > 0

  const handleSelect = (path: string) => {
    navigate(path)
    setQuery("")
    setIsFocused(false)
  }

  const handleEnter = () => {
    if (!firstResultPath) return
    handleSelect(firstResultPath)
  }

  return (
    <header className="h-[72px] bg-card border-b border-border flex items-center px-6 gap-6 shrink-0">
      <Logo />

      <div ref={containerRef} className="flex-1 max-w-[460px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects, docs, tasks..."
            className="pl-9 bg-background border-border"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setIsFocused(false)
                return
              }

              if (event.key === "Enter") {
                event.preventDefault()
                handleEnter()
              }
            }}
          />
          {isLoading && normalizedQuery.length >= MIN_SEARCH_LENGTH && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}

          {shouldShowDropdown && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-md border border-border bg-card shadow-lg">
              {normalizedQuery.length < MIN_SEARCH_LENGTH ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Type at least {MIN_SEARCH_LENGTH} characters
                </div>
              ) : isLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
              ) : !hasResults ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No results found</div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto py-2">
                  {projects.length > 0 && (
                    <div>
                      <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects</div>
                      {projects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSelect(`/projects/${project.id}`)}
                        >
                          <div className="text-sm font-medium">{project.name}</div>
                          {project.client && (
                            <div className="text-xs text-muted-foreground">{project.client}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {docs.length > 0 && (
                    <div>
                      <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Docs</div>
                      {docs.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSelect(getDocPath(doc.id, doc.projectId))}
                        >
                          <div className="text-sm font-medium">{doc.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {doc.isPersonal ? "Personal doc" : doc.projectName || "Project doc"}
                          </div>
                          {doc.snippet && (
                            <div className="text-xs text-muted-foreground/90 mt-0.5 break-words">{doc.snippet}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {tasks.length > 0 && (
                    <div>
                      <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tasks</div>
                      {tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSelect(`/projects/${task.projectId}/tasks`)}
                        >
                          <div className="text-sm font-medium">{task.title}</div>
                          <div className="text-xs text-muted-foreground">{task.projectName}</div>
                          {task.snippet && (
                            <div className="text-xs text-muted-foreground/90 mt-0.5 break-words">{task.snippet}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <NotificationBell />

        <UserMenu />
      </div>
    </header>
  )
}
