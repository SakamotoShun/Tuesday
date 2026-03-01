import { useMemo, useState } from "react"
import { Plus } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useNoticeBoardItems } from "@/hooks/use-notice-board"
import { NoticeBoardDialog } from "@/components/notice-board/notice-board-dialog"
import { NoticeBoardItemRow } from "@/components/notice-board/notice-board-item"
import { cn } from "@/lib/utils"
import type {
  CreateNoticeBoardItemInput,
  NoticeBoardItem,
  UpdateNoticeBoardItemInput,
} from "@/api/types"

interface NoticeBoardCardProps {
  className?: string
  embedded?: boolean
}

export function NoticeBoardCard({ className, embedded = false }: NoticeBoardCardProps) {
  const { user } = useAuth()
  const { items, isLoading, createItem, updateItem, deleteItem, toggleItem } = useNoticeBoardItems()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<NoticeBoardItem | null>(null)

  const canManage = user?.role === "admin"

  const { activeItems, completedTodos } = useMemo(() => {
    const active = items.filter((item) => !(item.type === "todo" && item.isCompleted))
    const completed = items.filter((item) => item.type === "todo" && item.isCompleted)
    return { activeItems: active, completedTodos: completed }
  }, [items])

  const handleOpenCreate = () => {
    setSelectedItem(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (item: NoticeBoardItem) => {
    setSelectedItem(item)
    setIsDialogOpen(true)
  }

  const handleCreate = async (input: CreateNoticeBoardItemInput) => {
    await createItem.mutateAsync(input)
  }

  const handleUpdate = async (id: string, input: UpdateNoticeBoardItemInput) => {
    await updateItem.mutateAsync({ id, input })
  }

  const handleDelete = async (id: string) => {
    await deleteItem.mutateAsync(id)
  }

  const handleToggle = (id: string) => {
    toggleItem.mutate(id)
  }

  const content = (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-background/80 p-3 md:p-4">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notice board...</p>
      ) : activeItems.length === 0 && completedTodos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No announcements or todos yet.</p>
      ) : (
        <>
          {activeItems.length > 0 && (
            <div className="space-y-2">
              {activeItems.map((item) => (
                <NoticeBoardItemRow
                  key={item.id}
                  item={item}
                  canManage={canManage}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                />
              ))}
            </div>
          )}

          {completedTodos.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Completed Todos
              </h3>
              {completedTodos.map((item) => (
                <NoticeBoardItemRow
                  key={item.id}
                  item={item}
                  canManage={canManage}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <>
      <section className={cn("min-h-0 flex flex-col", !embedded && "rounded-2xl border border-border bg-card p-4 md:p-5", className)}>
        {embedded ? (
          canManage ? (
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={handleOpenCreate}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          ) : null
        ) : (
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Notice Board</h2>
              <p className="text-xs text-muted-foreground">Announcements and team todos.</p>
            </div>
            {canManage && (
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={handleOpenCreate}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            )}
          </div>
        )}

        {content}
      </section>

      {canManage && (
        <NoticeBoardDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          item={selectedItem}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          isSaving={createItem.isPending || updateItem.isPending}
        />
      )}
    </>
  )
}
