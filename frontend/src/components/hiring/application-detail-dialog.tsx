import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Calendar, Star, ExternalLink, Trash2, Pencil } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InterviewFormDialog } from "./interview-form-dialog"
import {
  useInterviews,
  useInterviewMutations,
  useInterviewNotes,
  useInterviewNoteMutations,
} from "@/hooks/use-hiring"
import type { Candidate, JobApplication, Interview, CreateInterviewInput, UpdateInterviewInput } from "@/api/types"

interface ApplicationDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  application: JobApplication | null
  applicationOptions?: JobApplication[]
  candidate?: Candidate | null
  onEditCandidate?: (candidate: Candidate) => void
}

export function ApplicationDetailDialog({
  open,
  onOpenChange,
  application,
  applicationOptions,
  candidate: candidateProp,
  onEditCandidate,
}: ApplicationDetailDialogProps) {
  const navigate = useNavigate()
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false)
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null)

  const orderedApplications = useMemo(() => {
    const source = applicationOptions?.length ? applicationOptions : application ? [application] : []
    return [...source].sort((a, b) => {
      const aTime = a.appliedAt ? new Date(a.appliedAt).getTime() : 0
      const bTime = b.appliedAt ? new Date(b.appliedAt).getTime() : 0
      return bTime - aTime
    })
  }, [application, applicationOptions])

  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("")

  useEffect(() => {
    if (!open) return
    setSelectedApplicationId(application?.id ?? orderedApplications[0]?.id ?? "")
  }, [open, application?.id, orderedApplications])

  const selectedApplication = useMemo(() => {
    if (!orderedApplications.length) {
      return application
    }
    return orderedApplications.find((item) => item.id === selectedApplicationId) ?? orderedApplications[0]
  }, [application, orderedApplications, selectedApplicationId])

  const applicationId = selectedApplication?.id || ""
  const { data: interviews = [] } = useInterviews(applicationId)
  const { data: notes = [] } = useInterviewNotes(applicationId)
  const { createInterview, updateInterview, deleteInterview } = useInterviewMutations(applicationId)
  const { createNote, deleteNote } = useInterviewNoteMutations(applicationId)

  const candidate = candidateProp ?? selectedApplication?.candidate ?? application?.candidate ?? null

  if (!candidate && !selectedApplication) return null

  const handleCreateInterview = async (data: CreateInterviewInput | UpdateInterviewInput) => {
    await createInterview.mutateAsync(data as CreateInterviewInput)
  }

  const handleUpdateInterview = async (data: CreateInterviewInput | UpdateInterviewInput) => {
    if (!editingInterview) return
    await updateInterview.mutateAsync({ id: editingInterview.id, data: data as UpdateInterviewInput })
  }

  const handleDeleteInterview = async () => {
    if (!editingInterview) return
    await deleteInterview.mutateAsync(editingInterview.id)
  }

  const handleCreateNote = async () => {
    if (!applicationId) return

    const title = candidate?.name ? `${candidate.name} - Interview Note` : "Interview Note"
    const note = await createNote.mutateAsync({
      applicationId,
      title,
      content: [],
    })

    onOpenChange(false)
    navigate(`/docs/personal/${note.docId}?from=hiring`)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-10">
              <span>{candidate?.name || "Candidate"}</span>
              {selectedApplication?.stage && (
                <Badge
                  variant="secondary"
                  style={{ backgroundColor: selectedApplication.stage.color + "20", color: selectedApplication.stage.color }}
                >
                  {selectedApplication.stage.name}
                </Badge>
              )}
              {candidate && onEditCandidate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Edit candidate"
                  onClick={() => onEditCandidate(candidate)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Candidate Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {candidate?.email && (
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">
                  {candidate.email}
                </a>
              </div>
            )}
            {candidate?.phone && (
              <div>
                <span className="text-muted-foreground">Phone:</span> {candidate.phone}
              </div>
            )}
            {candidate?.source && (
              <div>
                <span className="text-muted-foreground">Source:</span> {candidate.source}
              </div>
            )}
            {candidate?.resumeUrl && (
              <div>
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> View Resume
                </a>
              </div>
            )}
          </div>

          {orderedApplications.length > 1 && (
            <div className="space-y-2 mt-3">
              <Label htmlFor="candidate-application">Application</Label>
              <Select value={selectedApplication?.id ?? ""} onValueChange={setSelectedApplicationId}>
                <SelectTrigger id="candidate-application">
                  <SelectValue placeholder="Select an application" />
                </SelectTrigger>
                <SelectContent>
                  {orderedApplications.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.position?.title || "Position"} - {new Date(item.appliedAt).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Tabs defaultValue="interviews" className="mt-4">
            <TabsList>
              <TabsTrigger value="interviews">
                Interviews ({interviews.length})
              </TabsTrigger>
              <TabsTrigger value="notes">
                Notes ({notes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="interviews" className="space-y-3 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingInterview(null)
                  setInterviewDialogOpen(true)
                }}
                disabled={!applicationId}
              >
                <Plus className="h-4 w-4 mr-1" /> Schedule Interview
              </Button>

              {!applicationId && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No applications yet.
                </p>
              )}

              {applicationId && interviews.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No interviews scheduled yet.
                </p>
              )}

              {interviews.map((interview) => (
                <Card key={interview.id} className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    setEditingInterview(interview)
                    setInterviewDialogOpen(true)
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          {interview.type && (
                            <Badge variant="secondary" className="text-xs">
                              {interview.type}
                            </Badge>
                          )}
                          {interview.rating && (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Star className="h-3 w-3" /> {interview.rating}/5
                            </span>
                          )}
                        </div>
                        {interview.scheduledAt && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(interview.scheduledAt).toLocaleString()}
                            {interview.durationMinutes && ` (${interview.durationMinutes} min)`}
                          </p>
                        )}
                        {interview.interviewer && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Interviewer: {(interview.interviewer as any).name}
                          </p>
                        )}
                        {interview.feedback && (
                          <p className="text-sm mt-2 text-foreground line-clamp-2">
                            {interview.feedback}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="notes" className="space-y-3 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void handleCreateNote()
                }}
                disabled={createNote.isPending || !applicationId}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Note
              </Button>

              {!applicationId && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No applications yet.
                </p>
              )}

              {applicationId && notes.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No notes yet.
                </p>
              )}

              {notes.map((note) => (
                <Card key={note.id}>
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium cursor-pointer hover:text-primary"
                        onClick={() => {
                          onOpenChange(false)
                          navigate(`/docs/personal/${note.docId}?from=hiring`)
                        }}
                      >
                        {note.doc?.title || note.title}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteNote.mutateAsync(note.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString()}
                      {note.createdByUser && ` by ${(note.createdByUser as any).name}`}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <InterviewFormDialog
        open={interviewDialogOpen}
        onOpenChange={setInterviewDialogOpen}
        applicationId={applicationId}
        interview={editingInterview}
        onSubmit={editingInterview ? handleUpdateInterview : handleCreateInterview}
        onDelete={editingInterview ? handleDeleteInterview : null}
        isSubmitting={createInterview.isPending || updateInterview.isPending}
      />
    </>
  )
}
