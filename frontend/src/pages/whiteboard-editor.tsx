import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Excalidraw, exportToCanvas, exportToSvg } from "@excalidraw/excalidraw"
import "@excalidraw/excalidraw/index.css"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ExportMenu } from "@/components/whiteboard/export-menu"
import { useWhiteboard } from "@/hooks/use-whiteboards"
import { useAuth } from "@/hooks/use-auth"
import { useWhiteboardCollab, type WhiteboardSceneUpdate } from "@/hooks/use-whiteboard-collab"
import { whiteboardsApi } from "@/api/whiteboards"
import type { Whiteboard } from "@/api/types"

type WhiteboardScene = WhiteboardSceneUpdate

const blankScene: WhiteboardScene = {
  elements: [],
  files: {},
}

const mergeElements = (base: WhiteboardScene["elements"], incoming: WhiteboardScene["elements"]) => {
  const merged = new Map(base.map((element) => [element.id, element]))
  for (const element of incoming) {
    const current = merged.get(element.id)
    const currentVersion = current?.version ?? 0
    const nextVersion = element.version ?? 0
    if (!current || nextVersion >= currentVersion) {
      merged.set(element.id, element)
    }
  }
  return Array.from(merged.values())
}

const mergeScene = (base: WhiteboardScene, update: WhiteboardScene) => ({
  elements: mergeElements(base.elements, update.elements),
  files: { ...(base.files ?? {}), ...(update.files ?? {}) },
})

const LoadingState = () => (
  <div className="min-h-[60vh] bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
)

export function WhiteboardEditorPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const whiteboardId = id ?? ""
  const { data: whiteboard, isLoading } = useWhiteboard(whiteboardId)

  if (isLoading) {
    return <LoadingState />
  }

  if (!whiteboard) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Whiteboard not found.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    )
  }

  return <WhiteboardEditorCanvas whiteboard={whiteboard} />
}

interface WhiteboardEditorCanvasProps {
  whiteboard: Whiteboard
}

function WhiteboardEditorCanvas({ whiteboard }: WhiteboardEditorCanvasProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const excalidrawAPI = useRef<any>(null)
  const sceneRef = useRef<WhiteboardScene>(blankScene)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentSignatureRef = useRef("")
  const lastRemoteSignatureRef = useRef("")
  const ignoreAppStateChangeRef = useRef(false)
  const pendingSyncRef = useRef<WhiteboardScene | null>(null)
  const [isApiReady, setIsApiReady] = useState(false)
  const [name, setName] = useState(whiteboard.name)

  const initialData = useMemo(() => {
    const data = whiteboard.data as WhiteboardScene | null
    const elements = data?.elements ?? []
    const files = data?.files ?? {}
    return { elements, files, scrollToContent: true } as unknown as NonNullable<
      Parameters<typeof Excalidraw>[0]["initialData"]
    >
  }, [whiteboard.id])

  const updateWhiteboard = useMutation({
    mutationFn: ({ data, name: nextName }: { data?: WhiteboardScene; name?: string }) =>
      whiteboardsApi.update(whiteboard.id, {
        ...(data ? { data } : {}),
        ...(nextName ? { name: nextName } : {}),
      }),
    onSuccess: (updatedWhiteboard) => {
      queryClient.setQueryData(["whiteboards", whiteboard.id], updatedWhiteboard)
    },
  })

  const applyScene = useCallback((scene: WhiteboardScene) => {
    if (!excalidrawAPI.current) {
      pendingSyncRef.current = scene
      return
    }
    excalidrawAPI.current.updateScene({
      elements: scene.elements,
      files: scene.files ?? {},
    })
    sceneRef.current = scene
    const signature = JSON.stringify(scene.elements)
    lastSentSignatureRef.current = signature
    lastRemoteSignatureRef.current = signature
  }, [])

  const handleSync = useCallback(
    (message: { snapshot: WhiteboardScene | null; updates: WhiteboardScene[] }) => {
      const base = message.snapshot ?? blankScene
      let merged = { elements: base.elements ?? [], files: base.files ?? {} }
      for (const update of message.updates ?? []) {
        merged = mergeScene(merged, update)
      }
      applyScene(merged)
    },
    [applyScene]
  )

  const handleRemoteUpdate = useCallback(
    (message: { update: WhiteboardScene; actorId: string }) => {
      if (!excalidrawAPI.current) return
      const currentElements = excalidrawAPI.current.getSceneElements() ?? sceneRef.current.elements
      const currentFiles = excalidrawAPI.current.getFiles() ?? sceneRef.current.files
      const merged = mergeScene({ elements: currentElements, files: currentFiles }, message.update)
      applyScene(merged)
    },
    [applyScene]
  )

  const getSnapshot = useCallback(() => {
    if (!excalidrawAPI.current) return null
    return {
      elements: excalidrawAPI.current.getSceneElements(),
      files: excalidrawAPI.current.getFiles(),
    }
  }, [])

  const { collaborators, sendUpdate, sendPresence } = useWhiteboardCollab({
    whiteboardId: whiteboard.id,
    currentUser: user
      ? {
          id: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl ?? undefined,
        }
      : null,
    onSync: handleSync,
    onRemoteUpdate: handleRemoteUpdate,
    getSnapshot,
  })

  useEffect(() => {
    if (!isApiReady || !pendingSyncRef.current) return
    applyScene(pendingSyncRef.current)
    pendingSyncRef.current = null
  }, [applyScene, isApiReady])

  useEffect(() => {
    if (!isApiReady || !excalidrawAPI.current) return
    ignoreAppStateChangeRef.current = true
    excalidrawAPI.current.updateScene({
      appState: {
        collaborators,
      },
    })
  }, [collaborators, isApiReady])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const saveName = async () => {
    if (!name.trim()) return
    await updateWhiteboard.mutateAsync({ name: name.trim() })
  }

  const exportPng = async () => {
    if (!excalidrawAPI.current) return
    const elements = excalidrawAPI.current.getSceneElements()
    const appState = excalidrawAPI.current.getAppState()
    const files = excalidrawAPI.current.getFiles()
    const canvas = await exportToCanvas({ elements, appState, files })
    canvas.toBlob((blob: Blob | null) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${name || "whiteboard"}.png`
      link.click()
      URL.revokeObjectURL(url)
    })
  }

  const exportSvg = async () => {
    if (!excalidrawAPI.current) return
    const elements = excalidrawAPI.current.getSceneElements()
    const appState = excalidrawAPI.current.getAppState()
    const files = excalidrawAPI.current.getFiles()
    const svg = await exportToSvg({ elements, appState, files })
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${name || "whiteboard"}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  const collaboratorList = useMemo(
    () => Array.from(collaborators.values()).filter((collaborator) => !collaborator.isCurrentUser),
    [collaborators]
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-3">
          {collaboratorList.length > 0 && (
            <div className="flex items-center -space-x-2">
              {collaboratorList.map((collaborator) => (
                <Avatar key={collaborator.id} className="h-7 w-7 border-2 border-background">
                  <AvatarImage src={collaborator.avatarUrl} alt={collaborator.username ?? ""} />
                  <AvatarFallback className="bg-muted text-[10px]">
                    {(collaborator.username ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
          <ExportMenu onExportPng={exportPng} onExportSvg={exportSvg} />
        </div>
      </div>

      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
        <Excalidraw
          initialData={initialData}
          isCollaborating
          excalidrawAPI={(api: unknown) => {
            excalidrawAPI.current = api
            setIsApiReady(true)
          }}
          onChange={(elements, _appState, files) => {
            if (ignoreAppStateChangeRef.current) {
              ignoreAppStateChangeRef.current = false
              return
            }
            const scene = {
              elements: elements as WhiteboardScene["elements"],
              files: files as Record<string, unknown>,
            }
            sceneRef.current = scene
            const signature = JSON.stringify(elements)
            if (signature === lastRemoteSignatureRef.current) {
              return
            }
            if (signature === lastSentSignatureRef.current) {
              return
            }

            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current)
            }

            saveTimeoutRef.current = setTimeout(() => {
              sendUpdate(scene)
              lastSentSignatureRef.current = signature
            }, 600)
          }}
          onPointerUpdate={({ pointer, button }) => {
            sendPresence({
              pointer,
              button,
            })
          }}
          theme="light"
        />
      </div>
    </div>
  )
}
