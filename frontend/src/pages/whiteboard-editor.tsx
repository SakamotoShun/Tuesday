import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Excalidraw, exportToCanvas, exportToSvg } from "@excalidraw/excalidraw"
import "@excalidraw/excalidraw/index.css"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MessageSquare, X } from "@/lib/icons"
import { ErrorBoundary } from "@/components/common/error-boundary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ExportMenu } from "@/components/whiteboard/export-menu"
import { ResizableSplit } from "@/components/layout/resizable-split"
import { ChatView } from "@/components/chat/chat-view"
import { useWhiteboard } from "@/hooks/use-whiteboards"
import { useAuth } from "@/hooks/use-auth"
import { useWhiteboardCollab } from "@/hooks/use-whiteboard-collab"
import {
  blankWhiteboardScene,
  filterReferencedWhiteboardFiles,
  getWhiteboardSceneKey,
  mergeWhiteboardScene,
  type WhiteboardScene,
} from "@/lib/whiteboard-scene"
import { useUIStore } from "@/store/ui-store"
import { whiteboardsApi } from "@/api/whiteboards"
import type { Whiteboard } from "@/api/types"

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
  const isFreelancer = user?.role === "freelancer"
  const excalidrawAPI = useRef<any>(null)
  const sceneRef = useRef<WhiteboardScene>(blankWhiteboardScene)
  const observedSceneKeyRef = useRef("")
  const hasCompletedSyncRef = useRef(false)
  const pendingSyncRef = useRef<WhiteboardScene | null>(null)
  const [isApiReady, setIsApiReady] = useState(false)
  const [name, setName] = useState(whiteboard.name)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const chatPanelWidth = useUIStore((state) => state.chatPanelWidth)
  const setChatPanelWidth = useUIStore((state) => state.setChatPanelWidth)

  const initialData = useMemo(() => {
    const data = whiteboard.data as WhiteboardScene | null
    const elements = data?.elements ?? []
    const files = data?.files ?? {}
    return { elements, files, scrollToContent: true } as unknown as NonNullable<
      Parameters<typeof Excalidraw>[0]["initialData"]
    >
  }, [whiteboard.data, whiteboard.id])

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
    sceneRef.current = scene
    observedSceneKeyRef.current = getWhiteboardSceneKey(scene)
    if (!excalidrawAPI.current) {
      pendingSyncRef.current = scene
      return
    }
    const files = scene.files ?? {}
    if (Object.keys(files).length > 0 && typeof excalidrawAPI.current.addFiles === "function") {
      excalidrawAPI.current.addFiles(files)
    }
    excalidrawAPI.current.updateScene({
      elements: scene.elements,
    })
  }, [])

  const handleSync = useCallback(
    (
      message: { snapshot: WhiteboardScene | null; updates: WhiteboardScene[] },
      pendingLocalUpdate: WhiteboardScene | null
    ) => {
      const base = message.snapshot ?? blankWhiteboardScene
      let merged: WhiteboardScene = { elements: base.elements ?? [], files: base.files ?? {} }
      for (const update of message.updates ?? []) {
        merged = mergeWhiteboardScene(merged, update)
      }
      if (pendingLocalUpdate) {
        merged = mergeWhiteboardScene(merged, pendingLocalUpdate)
      } else if (hasCompletedSyncRef.current) {
        merged = mergeWhiteboardScene(merged, sceneRef.current)
      }
      hasCompletedSyncRef.current = true
      applyScene(merged)
    },
    [applyScene]
  )

  const handleRemoteUpdate = useCallback(
    (message: { update: WhiteboardScene; actorId: string }) => {
      if (!excalidrawAPI.current) return
      const currentElements = excalidrawAPI.current.getSceneElementsIncludingDeleted?.()
        ?? sceneRef.current.elements
      const currentFiles = excalidrawAPI.current.getFiles() ?? sceneRef.current.files
      const merged = mergeWhiteboardScene({ elements: currentElements, files: currentFiles }, message.update)
      applyScene(merged)
    },
    [applyScene]
  )

  const getSnapshot = useCallback(() => {
    if (!excalidrawAPI.current) return null
    const elements = excalidrawAPI.current.getSceneElementsIncludingDeleted?.()
      ?? excalidrawAPI.current.getSceneElements()
    const files = excalidrawAPI.current.getFiles()
    return {
      elements,
      files: filterReferencedWhiteboardFiles(elements, files),
    }
  }, [])

  const {
    status,
    isReady,
    isSaving,
    error: collabError,
    collaborators,
    sendUpdate,
    sendPresence,
  } = useWhiteboardCollab({
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
    excalidrawAPI.current.updateScene({
      appState: {
        collaborators,
      },
    })
  }, [collaborators, isApiReady])

  const saveName = async () => {
    if (isFreelancer) return
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

  const saveStatus = collabError
    ? collabError
    : status === "reconnecting"
      ? "Reconnecting..."
      : status === "connecting" || !isReady
        ? "Connecting..."
        : isSaving
          ? "Saving..."
          : "Saved"

  const chatPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="text-sm font-semibold">Project Chat</div>
        <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <ErrorBoundary title="Chat unavailable" message="The project chat panel crashed. Try reloading this section." resetKeys={[whiteboard.id, "chat"]}>
          <ChatView projectId={whiteboard.projectId} variant="panel" />
        </ErrorBoundary>
      </div>
    </div>
  )

  const whiteboardContent = (
    <div className="flex h-full flex-col gap-4 p-1">
      <div className="flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${whiteboard.projectId}/whiteboards`)}
          >
            Back
          </Button>
          {isFreelancer ? (
            <div className="text-lg font-semibold">{name}</div>
          ) : (
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              className="w-64"
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`max-w-80 truncate text-xs ${collabError ? "text-destructive" : "text-muted-foreground"}`}
            title={saveStatus}
          >
            {saveStatus}
          </span>
          <Button variant="outline" onClick={() => setIsChatOpen(!isChatOpen)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Chat
          </Button>
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
        <ErrorBoundary title="Whiteboard unavailable" message="The whiteboard canvas crashed. Try reloading this section." resetKeys={[whiteboard.id, "canvas"]}>
          <Excalidraw
            initialData={initialData}
            isCollaborating
            viewModeEnabled={isFreelancer || !isReady}
            excalidrawAPI={(api: unknown) => {
              excalidrawAPI.current = api
              setIsApiReady(true)
            }}
            onChange={(elements, _appState, files) => {
              if (isFreelancer || !isReady) return
              const filteredFiles = filterReferencedWhiteboardFiles(
                elements as WhiteboardScene["elements"],
                files as Record<string, unknown>
              )
              const scene = {
                elements: elements as WhiteboardScene["elements"],
                files: filteredFiles,
              }
              const sceneKey = getWhiteboardSceneKey(scene)
              if (sceneKey === observedSceneKeyRef.current) return

              sceneRef.current = scene
              observedSceneKeyRef.current = sceneKey
              sendUpdate(scene)
            }}
            onPointerUpdate={({ pointer, button }) => {
              sendPresence({
                pointer,
                button,
              })
            }}
            theme="light"
          />
        </ErrorBoundary>
      </div>
    </div>
  )

  return (
    <div
      className="min-h-0 overflow-hidden bg-background"
      style={{ height: "calc(100vh - 72px)" }}
    >
      <ResizableSplit
        sidePanel={chatPanel}
        sidePanelOpen={isChatOpen}
        sidePanelWidth={chatPanelWidth}
        onWidthChange={setChatPanelWidth}
        minWidth={300}
        maxWidth={700}
      >
        {whiteboardContent}
      </ResizableSplit>
    </div>
  )
}
