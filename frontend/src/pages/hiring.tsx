import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, Settings2, Users, Briefcase, FileText, ExternalLink, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LoadingSpinner } from "@/components/common/loading-spinner"
import { PositionFormDialog } from "@/components/hiring/position-form-dialog"
import { CandidateFormDialog } from "@/components/hiring/candidate-form-dialog"
import { ApplicationDetailDialog } from "@/components/hiring/application-detail-dialog"
import { InterviewStageManager } from "@/components/hiring/interview-stage-manager"
import { hiringApi } from "@/api/hiring"
import {
  useJobPositions,
  useJobPositionMutations,
  useCandidates,
  useCandidateMutations,
  useHiringDocs,
} from "@/hooks/use-hiring"
import type {
  JobPosition,
  JobApplication,
  Candidate,
  JobPositionStatus,
  CreateJobPositionInput,
  UpdateJobPositionInput,
  CreateCandidateInput,
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

export function HiringPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [candidateSearch, setCandidateSearch] = useState("")
  const [candidatePositionFilter, setCandidatePositionFilter] = useState<string>("all")
  const [candidateSourceFilter, setCandidateSourceFilter] = useState<string>("all")
  const [docSearch, setDocSearch] = useState("")

  // Dialogs
  const [positionDialogOpen, setPositionDialogOpen] = useState(false)
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null)
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false)
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null)
  const [applicationDetailOpen, setApplicationDetailOpen] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [docDialogOpen, setDocDialogOpen] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState("")
  const [newDocPositionId, setNewDocPositionId] = useState("")

  // Data
  const { data: positions = [], isLoading: positionsLoading } = useJobPositions({
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  })
  const { data: allPositions = [] } = useJobPositions()
  const { createPosition, updatePosition, deletePosition } = useJobPositionMutations()

  const { data: allCandidates = [], isLoading: candidatesLoading } = useCandidates({
    search: candidateSearch || undefined,
  })
  const { createCandidate, updateCandidate, deleteCandidate } = useCandidateMutations()

  const { data: allDocs = [], isLoading: docsLoading } = useHiringDocs()

  const filteredCandidates = useMemo(() => {
    return allCandidates.filter((candidate) => {
      if (candidatePositionFilter !== "all") {
        const hasPosition = (candidate.applications || []).some(
          (application) => application.positionId === candidatePositionFilter,
        )
        if (!hasPosition) return false
      }

      if (candidateSourceFilter !== "all" && candidate.source !== candidateSourceFilter) {
        return false
      }

      return true
    })
  }, [allCandidates, candidatePositionFilter, candidateSourceFilter])

  const createDoc = useMutation({
    mutationFn: ({ positionId, title }: { positionId: string; title: string }) =>
      hiringApi.createPositionDoc(positionId, { title }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hiring-docs"] }),
        queryClient.invalidateQueries({ queryKey: ["position-docs", variables.positionId] }),
      ])
    },
  })

  const deleteDoc = useMutation({
    mutationFn: ({ positionId, positionDocId }: { positionId: string; positionDocId: string }) =>
      hiringApi.deletePositionDoc(positionId, positionDocId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hiring-docs"] }),
        queryClient.invalidateQueries({ queryKey: ["position-docs", variables.positionId] }),
      ])
    },
  })

  const filteredDocs = allDocs.filter((doc) => {
    if (!docSearch.trim()) {
      return true
    }

    const query = docSearch.trim().toLowerCase()
    return (
      (doc.doc?.title ?? "").toLowerCase().includes(query) ||
      (doc.position?.title ?? "").toLowerCase().includes(query)
    )
  })

  const handleCreatePosition = async (data: CreateJobPositionInput) => {
    await createPosition.mutateAsync(data)
  }

  const handleUpdatePosition = async (data: UpdateJobPositionInput) => {
    if (!editingPosition) return
    await updatePosition.mutateAsync({ id: editingPosition.id, data })
  }

  const handleDeletePosition = async () => {
    if (!editingPosition) return
    await deletePosition.mutateAsync(editingPosition.id)
  }

  const handleCreateCandidate = async (data: CreateCandidateInput) => {
    await createCandidate.mutateAsync(data)
  }

  const handleUpdateCandidate = async (data: CreateCandidateInput) => {
    if (!editingCandidate) return
    await updateCandidate.mutateAsync({ id: editingCandidate.id, data })
  }

  const handleDeleteCandidate = async () => {
    if (!editingCandidate) return
    await deleteCandidate.mutateAsync(editingCandidate.id)
  }

  const handleCreateDoc = async () => {
    if (!newDocTitle.trim() || !newDocPositionId) {
      return
    }

    await createDoc.mutateAsync({
      positionId: newDocPositionId,
      title: newDocTitle.trim(),
    })

    setDocDialogOpen(false)
    setNewDocTitle("")
    setNewDocPositionId("")
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hiring</h1>
          <p className="text-sm text-muted-foreground">
            Manage job positions, candidates, and hiring documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className="h-4 w-4 mr-1" /> Pipeline Settings
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="max-w-lg">
          <InterviewStageManager />
        </div>
      )}

      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions" className="flex items-center gap-1">
            <Briefcase className="h-4 w-4" /> Positions
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-1">
            <Users className="h-4 w-4" /> Candidates
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-1">
            <FileText className="h-4 w-4" /> Documents
          </TabsTrigger>
        </TabsList>

        {/* Positions Tab */}
        <TabsContent value="positions" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search positions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setEditingPosition(null)
                setPositionDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> New Position
            </Button>
          </div>

          {positionsLoading ? (
            <LoadingSpinner />
          ) : positions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No positions found.</p>
              <p className="text-sm">Create your first job position to get started.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {positions.map((position) => (
                <Card
                  key={position.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => navigate(`/hiring/positions/${position.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{position.title}</h3>
                          <Badge
                            variant="secondary"
                            className={statusColors[position.status as JobPositionStatus]}
                          >
                            {statusLabels[position.status as JobPositionStatus] || position.status}
                          </Badge>
                        </div>
                        {position.department && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {position.department}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingPosition(position)
                            setPositionDialogOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Created {new Date(position.createdAt).toLocaleDateString()}</span>
                      {position.hiringManager && (
                        <span>
                          Manager: {(position.hiringManager as any).name}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Candidates Tab */}
        <TabsContent value="candidates" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search candidates..."
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={candidatePositionFilter} onValueChange={setCandidatePositionFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All positions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All positions</SelectItem>
                {allPositions.map((position) => (
                  <SelectItem key={position.id} value={position.id}>
                    {position.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={candidateSourceFilter} onValueChange={setCandidateSourceFilter}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="MyCareersFuture">MyCareersFuture</SelectItem>
                <SelectItem value="Referal">Referal</SelectItem>
                <SelectItem value="Linkedin">Linkedin</SelectItem>
                <SelectItem value="Others">Others</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setEditingCandidate(null)
                setCandidateDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Candidate
            </Button>
          </div>

          {candidatesLoading ? (
            <LoadingSpinner />
          ) : filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No candidates found.</p>
              <p className="text-sm">Try changing filters or add a candidate.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredCandidates.map((candidate) => {
                const uniquePositions = Array.from(
                  new Map(
                    (candidate.applications || [])
                      .filter((application) => application.position)
                      .map((application) => [application.positionId, application.position!]),
                  ).values(),
                )
                const visiblePositions = uniquePositions.slice(0, 2)
                const hiddenCount = uniquePositions.length - visiblePositions.length

                return (
                <Card
                  key={candidate.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    const sortedApplications = [...(candidate.applications || [])].sort((a, b) => {
                      const aTime = a.appliedAt ? new Date(a.appliedAt).getTime() : 0
                      const bTime = b.appliedAt ? new Date(b.appliedAt).getTime() : 0
                      return bTime - aTime
                    })

                    setSelectedCandidate(candidate)
                    setSelectedApplication(sortedApplications[0] || null)
                    setApplicationDetailOpen(true)
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <h3 className="font-medium">{candidate.name}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          {candidate.email && <span>{candidate.email}</span>}
                          {candidate.phone && <span>{candidate.phone}</span>}
                          {candidate.source && (
                            <Badge variant="secondary" className="text-xs">
                              {candidate.source}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {visiblePositions.length > 0 ? (
                            <>
                              {visiblePositions.map((position) => (
                                <Badge key={position.id} variant="outline" className="text-xs">
                                  {position.title}
                                </Badge>
                              ))}
                              {hiddenCount > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  +{hiddenCount}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">No applications</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(candidate.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="docs" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              onClick={() => {
                if (!newDocPositionId) {
                  const firstPosition = allPositions.at(0)
                  if (firstPosition) {
                    setNewDocPositionId(firstPosition.id)
                  }
                }
                setDocDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Document
            </Button>
          </div>

          {docsLoading ? (
            <LoadingSpinner />
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No documents found.</p>
              <p className="text-sm">Create a document and link it to a position.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredDocs.map((positionDoc) => (
                <Card key={positionDoc.id}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">
                          {positionDoc.doc?.title ?? "Untitled doc"}
                        </CardTitle>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {positionDoc.position?.title ?? "Unknown position"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Created {new Date(positionDoc.createdAt).toLocaleDateString()}
                          </span>
                        </div>
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
                          onClick={() =>
                            deleteDoc.mutate({
                              positionId: positionDoc.positionId,
                              positionDocId: positionDoc.id,
                            })
                          }
                          disabled={deleteDoc.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="py-0 px-4 pb-4">
                    <p className="text-xs text-muted-foreground">
                      Linked to hiring position resources and opened in the full Docs editor.
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <PositionFormDialog
        open={positionDialogOpen}
        onOpenChange={setPositionDialogOpen}
        position={editingPosition}
        onSubmit={editingPosition ? handleUpdatePosition : handleCreatePosition}
        onDelete={editingPosition ? handleDeletePosition : null}
        isSubmitting={createPosition.isPending || updatePosition.isPending}
      />

      <CandidateFormDialog
        open={candidateDialogOpen}
        onOpenChange={setCandidateDialogOpen}
        candidate={editingCandidate}
        onSubmit={editingCandidate ? handleUpdateCandidate : handleCreateCandidate}
        onDelete={editingCandidate ? handleDeleteCandidate : null}
        isSubmitting={createCandidate.isPending || updateCandidate.isPending}
      />

      <ApplicationDetailDialog
        open={applicationDetailOpen}
        onOpenChange={setApplicationDetailOpen}
        application={selectedApplication}
        applicationOptions={selectedCandidate?.applications || []}
        candidate={selectedCandidate}
        onEditCandidate={(candidateToEdit) => {
          setApplicationDetailOpen(false)
          setEditingCandidate(candidateToEdit)
          setCandidateDialogOpen(true)
        }}
      />

      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Hiring Document</DialogTitle>
            <DialogDescription>
              Create a document and link it to a specific position.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="docTitle">Title</Label>
              <Input
                id="docTitle"
                value={newDocTitle}
                onChange={(event) => setNewDocTitle(event.target.value)}
                placeholder="e.g. Senior Backend Engineer - Interview Guide"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="docPosition">Position</Label>
              <Select value={newDocPositionId} onValueChange={setNewDocPositionId}>
                <SelectTrigger id="docPosition">
                  <SelectValue placeholder="Select a position" />
                </SelectTrigger>
                <SelectContent>
                  {allPositions.map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateDoc}
              disabled={createDoc.isPending || !newDocTitle.trim() || !newDocPositionId}
            >
              {createDoc.isPending ? "Creating..." : "Create Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
