import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiErrorResponse } from "@/api/client"
import { useCandidates } from "@/hooks/use-hiring"
import type { CreateJobApplicationInput, Candidate } from "@/api/types"

interface AddApplicationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string
  onSubmit: (data: CreateJobApplicationInput) => Promise<void>
  onCreateCandidate: () => void
  isSubmitting?: boolean
}

export function AddApplicationDialog({
  open,
  onOpenChange,
  positionId,
  onSubmit,
  onCreateCandidate,
  isSubmitting,
}: AddApplicationDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("")

  const { data: candidates = [] } = useCandidates({ search: search || undefined })

  useEffect(() => {
    if (!open) {
      setSearch("")
      setSelectedCandidateId("")
      setError(null)
    }
  }, [open])

  const handleSave = async () => {
    if (!selectedCandidateId) {
      setError("Please select a candidate")
      return
    }

    try {
      setError(null)
      await onSubmit({
        candidateId: selectedCandidateId,
        positionId,
      })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiErrorResponse) setError(err.message)
      else setError("Failed to add application")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Add Candidate to Position</DialogTitle>
          <DialogDescription>
            Select an existing candidate or create a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Search Candidates</Label>
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Select Candidate</Label>
            <Select
              value={selectedCandidateId}
              onValueChange={setSelectedCandidateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a candidate" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                    {candidate.email ? ` (${candidate.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="link"
            className="p-0 h-auto text-sm"
            onClick={() => {
              onOpenChange(false)
              onCreateCandidate()
            }}
          >
            + Create new candidate
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting || !selectedCandidateId}>
            {isSubmitting ? "Adding..." : "Add to Position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
