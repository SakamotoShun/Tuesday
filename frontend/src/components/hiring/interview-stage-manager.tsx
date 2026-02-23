import { useState, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useInterviewStages, useInterviewStageMutations } from "@/hooks/use-hiring"
import type { InterviewStage } from "@/api/types"

interface StageEditState {
  name: string
  color: string
}

export function InterviewStageManager() {
  const { data: stages = [], isLoading } = useInterviewStages()
  const { createStage, updateStage, deleteStage } = useInterviewStageMutations()

  const [edits, setEdits] = useState<Record<string, StageEditState>>({})
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("#6b7280")

  useEffect(() => {
    const initial: Record<string, StageEditState> = {}
    stages.forEach((s) => {
      initial[s.id] = { name: s.name, color: s.color }
    })
    setEdits(initial)
  }, [stages])

  const handleEdit = (id: string, field: keyof StageEditState, value: string) => {
    setEdits((prev) => {
      const current = prev[id]
      if (!current) return prev
      return { ...prev, [id]: { ...current, [field]: value } }
    })
  }

  const handleSave = (stage: InterviewStage) => {
    const edit = edits[stage.id]
    if (!edit) return
    if (edit.name === stage.name && edit.color === stage.color) return
    updateStage.mutate({ id: stage.id, data: { name: edit.name, color: edit.color } })
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    createStage.mutate(
      { name: newName.trim(), color: newColor, sortOrder: stages.length },
      {
        onSuccess: () => {
          setNewName("")
          setNewColor("#6b7280")
        },
      }
    )
  }

  const handleDelete = (id: string) => {
    deleteStage.mutate(id)
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading stages...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interview Pipeline Stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage) => {
          const edit = edits[stage.id]
          if (!edit) return null
          const hasChanges = edit.name !== stage.name || edit.color !== stage.color
          const isLastRemainingStage = stages.length <= 1

          return (
            <div key={stage.id} className="flex items-center gap-2">
              <Input
                type="color"
                value={edit.color}
                onChange={(e) => handleEdit(stage.id, "color", e.target.value)}
                className="w-10 h-9 p-1 cursor-pointer"
              />
              <Input
                value={edit.name}
                onChange={(e) => handleEdit(stage.id, "name", e.target.value)}
                className="flex-1"
              />
              {hasChanges && (
                <Button
                  size="sm"
                  onClick={() => handleSave(stage)}
                  disabled={updateStage.isPending}
                >
                  Save
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(stage.id)}
                disabled={deleteStage.isPending || isLastRemainingStage}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        })}

        {/* Add new stage */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-9 p-1 cursor-pointer"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New stage name"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreate()
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!newName.trim() || createStage.isPending}
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
