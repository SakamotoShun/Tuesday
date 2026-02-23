import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ExternalLink, FileText, Plus, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LoadingSpinner } from "@/components/common/loading-spinner"
import { HiringKanbanBoard } from "@/components/hiring/hiring-kanban-board"
import { ApplicationDetailDialog } from "@/components/hiring/application-detail-dialog"
import { AddApplicationDialog } from "@/components/hiring/add-application-dialog"
import { CandidateFormDialog } from "@/components/hiring/candidate-form-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  useJobPosition,
  useApplications,
  useApplicationMutations,
  useInterviewStages,
  useCandidateMutations,
  usePositionDocs,
  usePositionDocMutations,
} from "@/hooks/use-hiring"
import type {
  Candidate,
  CreateCandidateInput,
  JobApplication,
  JobPositionStatus,
} from "@/api/types"

const statusColors: Record<JobPositionStatus, string> = {
  open: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
}

const statusLabels: Record<JobPositionStatus, string> = {
  open: "Open",
  on_hold: "On Hold",
  closed: "Closed",
}

export function PositionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const positionId = id || ""

  const { data: position, isLoading: positionLoading } = useJobPosition(positionId)
  const { data: applications = [], isLoading: applicationsLoading } = useApplications(positionId)
  const { data: stages = [] } = useInterviewStages()
  const { createApplication, moveApplication } = useApplicationMutations(positionId)
  const { createCandidate, updateCandidate, deleteCandidate } = useCandidateMutations()

  const { data: positionDocs = [], isLoading: positionDocsLoading } = usePositionDocs(positionId)
  const { createPositionDoc, deletePositionDoc } = usePositionDocMutations(positionId)

  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null)
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false)

  const [createDocDialogOpen, setCreateDocDialogOpen] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState("")

  const handleApplicationMove = (applicationId: string, stageId: string) => {
    moveApplication.mutate({ id: applicationId, data: { stageId } })
  }

  const handleApplicationClick = (application: JobApplication) => {
    setSelectedApplication(application)
    setDetailDialogOpen(true)
  }

  const handleCreateCandidate = async (data: CreateCandidateInput) => {
    await createCandidate.mutateAsync(data)
    setCandidateDialogOpen(false)
    setAddDialogOpen(true)
  }

  const handleUpdateCandidate = async (data: CreateCandidateInput) => {
    if (!editingCandidate) return
    await updateCandidate.mutateAsync({ id: editingCandidate.id, data })
  }

  const handleDeleteCandidate = async () => {
    if (!editingCandidate) return
    await deleteCandidate.mutateAsync(editingCandidate.id)
  }

  const handleCreatePositionDoc = async () => {
    if (!newDocTitle.trim()) {
      return
    }

    await createPositionDoc.mutateAsync({
      title: newDocTitle.trim(),
    })

    setCreateDocDialogOpen(false)
    setNewDocTitle("")
  }

  if (positionLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!position) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Position not found.</p>
          <Button variant="link" onClick={() => navigate("/hiring")}>
            Back to Hiring
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/hiring")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{position.title}</h1>
              <Badge
                variant="secondary"
                className={statusColors[position.status as JobPositionStatus]}
              >
                {statusLabels[position.status as JobPositionStatus] || position.status}
              </Badge>
            </div>

            {position.department && (
              <p className="text-sm text-muted-foreground mt-0.5">{position.department}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="h-4 w-4" />
              {applications.length} candidate{applications.length !== 1 ? "s" : ""}
            </span>
            <Button variant="outline" onClick={() => setCreateDocDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-1" /> Add Hiring Doc
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Candidate
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 min-h-0 flex flex-col">
        <Tabs defaultValue="pipeline" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="docs">Hiring Docs ({positionDocs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="flex-1 min-h-0 mt-4">
            <div className="h-full overflow-hidden">
              {applicationsLoading ? (
                <LoadingSpinner />
              ) : (
                <HiringKanbanBoard
                  applications={applications}
                  stages={stages}
                  onApplicationMove={handleApplicationMove}
                  onApplicationClick={handleApplicationClick}
                  isLoading={moveApplication.isPending}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="docs" className="flex-1 min-h-0 mt-4 overflow-y-auto">
            {positionDocsLoading ? (
              <LoadingSpinner />
            ) : positionDocs.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center">
                No hiring docs yet. Create your first doc for this position.
              </div>
            ) : (
              <div className="grid gap-3">
                {positionDocs.map((positionDoc) => (
                  <Card key={positionDoc.id}>
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">
                            {positionDoc.doc?.title ?? "Untitled doc"}
                          </CardTitle>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Created {new Date(positionDoc.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/docs/personal/${positionDoc.docId}?from=hiring`)}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" /> Open
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => deletePositionDoc.mutate(positionDoc.id)}
                            disabled={deletePositionDoc.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ApplicationDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        application={selectedApplication}
        onEditCandidate={(candidate) => {
          setDetailDialogOpen(false)
          setEditingCandidate(candidate)
          setCandidateDialogOpen(true)
        }}
      />

      <AddApplicationDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        positionId={positionId}
        onSubmit={async (data) => {
          await createApplication.mutateAsync(data)
        }}
        onCreateCandidate={() => {
          setEditingCandidate(null)
          setCandidateDialogOpen(true)
        }}
        isSubmitting={createApplication.isPending}
      />

      <CandidateFormDialog
        open={candidateDialogOpen}
        onOpenChange={(open) => {
          setCandidateDialogOpen(open)
          if (!open) {
            setEditingCandidate(null)
          }
        }}
        candidate={editingCandidate}
        onSubmit={editingCandidate ? handleUpdateCandidate : handleCreateCandidate}
        onDelete={editingCandidate ? handleDeleteCandidate : null}
        isSubmitting={createCandidate.isPending || updateCandidate.isPending}
      />

      <Dialog open={createDocDialogOpen} onOpenChange={setCreateDocDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Hiring Doc</DialogTitle>
            <DialogDescription>
              Create a rich collaborative doc for this position.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="docTitle">Title</Label>
              <Input
                id="docTitle"
                value={newDocTitle}
                onChange={(event) => setNewDocTitle(event.target.value)}
                placeholder="e.g. Senior Frontend Engineer - Candidate Evaluation"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDocDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePositionDoc}
              disabled={createPositionDoc.isPending || !newDocTitle.trim()}
            >
              {createPositionDoc.isPending ? "Creating..." : "Create Doc"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
