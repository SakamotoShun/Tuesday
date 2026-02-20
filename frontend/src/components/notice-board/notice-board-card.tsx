import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { useNoticeBoardItems } from "@/hooks/use-notice-board"
import { NoticeBoardDialog } from "@/components/notice-board/notice-board-dialog"
import { NoticeBoardItemRow } from "@/components/notice-board/notice-board-item"
import type {
  CreateNoticeBoardItemInput,
  NoticeBoardItem,
  UpdateNoticeBoardItemInput,
} from "@/api/types"

export function NoticeBoardCard() {
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

  return (
    <>
      <section className="min-h-0 flex flex-col gap-2 xl:col-start-2 xl:row-start-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Notice Board</h2>
          {canManage && (
            <Button type="button" size="sm" variant="outline" onClick={handleOpenCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          )}
        </div>

        <Card className="min-h-0 flex-1">
          <CardContent className="h-full min-h-0 space-y-4 overflow-y-auto pt-6">
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
          </CardContent>
        </Card>
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
