import {
  interviewStageRepository,
  jobPositionRepository,
  candidateRepository,
  jobApplicationRepository,
  interviewRepository,
  interviewNoteRepository,
  positionDocRepository,
  docRepository,
} from '../repositories';
import { docService } from './doc';
import { fileService } from './file';
import type { User } from '../types';
import type {
  InterviewStage, NewInterviewStage,
  JobPosition, NewJobPosition,
  PositionDoc,
  Candidate, NewCandidate,
  JobApplication, NewJobApplication,
  Interview, NewInterview,
  InterviewNote, NewInterviewNote,
} from '../db/schema';

// --- Interview Stages ---

export class HiringService {
  private extractUploadedFileId(url?: string | null): string | null {
    if (!url) return null;
    const match = url.match(/\/api\/v1\/files\/([0-9a-f-]{36})$/i);
    return match?.[1] ?? null;
  }

  private async keepResumeFile(url: string | null | undefined, user: User): Promise<void> {
    const fileId = this.extractUploadedFileId(url);
    if (!fileId) return;

    await fileService.getFileForUser(fileId, user);
    await fileService.markAsCandidate(fileId);
  }

  private async deleteResumeFile(url: string | null | undefined, user: User): Promise<void> {
    const fileId = this.extractUploadedFileId(url);
    if (!fileId) return;

    try {
      await fileService.deleteFile(fileId, user);
    } catch (error) {
      if (error instanceof Error && error.message === 'File not found') {
        return;
      }
      throw error;
    }
  }

  // Stages
  async listStages(): Promise<InterviewStage[]> {
    return interviewStageRepository.findAll();
  }

  async createStage(data: NewInterviewStage): Promise<InterviewStage> {
    return interviewStageRepository.create(data);
  }

  async updateStage(id: string, data: Partial<NewInterviewStage>): Promise<InterviewStage | null> {
    return interviewStageRepository.update(id, data);
  }

  async deleteStage(id: string): Promise<boolean> {
    return interviewStageRepository.delete(id);
  }

  async reorderStages(ids: string[]): Promise<void> {
    return interviewStageRepository.reorder(ids);
  }

  // Job Positions
  async listPositions(filters?: { status?: string; search?: string }): Promise<JobPosition[]> {
    return jobPositionRepository.findAll(filters);
  }

  async getPosition(id: string): Promise<JobPosition | null> {
    return jobPositionRepository.findById(id);
  }

  async createPosition(input: {
    title: string;
    department?: string | null;
    descriptionMd?: string;
    status?: string;
    hiringManagerId?: string | null;
  }, user: User): Promise<JobPosition> {
    const position = await jobPositionRepository.create({
      title: input.title.trim(),
      department: input.department || null,
      descriptionMd: input.descriptionMd || '',
      status: input.status || 'open',
      hiringManagerId: input.hiringManagerId || null,
      createdBy: user.id,
    });

    const initialContent = input.descriptionMd?.trim()
      ? [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: input.descriptionMd.trim(),
                styles: {},
              },
            ],
          },
        ]
      : [];

    await this.createPositionDoc(
      position.id,
      {
        title: `${position.title} - Job Description`,
        content: initialContent,
      },
      user
    );

    return position;
  }

  async updatePosition(id: string, input: Partial<NewJobPosition>): Promise<JobPosition | null> {
    const position = await jobPositionRepository.findById(id);
    if (!position) return null;
    return jobPositionRepository.update(id, input);
  }

  async deletePosition(id: string, user: User): Promise<boolean> {
    const position = await jobPositionRepository.findById(id);
    if (!position) return false;

    const linkedDocs = await positionDocRepository.findByPositionId(id);
    for (const linkedDoc of linkedDocs) {
      await docService.deleteDoc(linkedDoc.docId, user);
    }

    return jobPositionRepository.delete(id);
  }

  // Position Docs
  async listAllPositionDocs(): Promise<PositionDoc[]> {
    return positionDocRepository.findAll();
  }

  async listPositionDocs(positionId: string): Promise<PositionDoc[]> {
    const position = await jobPositionRepository.findById(positionId);
    if (!position) {
      throw new Error('Job position not found');
    }

    return positionDocRepository.findByPositionId(positionId);
  }

  async createPositionDoc(
    positionId: string,
    input: {
      title: string;
      content?: unknown[];
    },
    user: User
  ): Promise<PositionDoc> {
    const position = await jobPositionRepository.findById(positionId);
    if (!position) {
      throw new Error('Job position not found');
    }

    const existingDocs = await positionDocRepository.findByPositionId(positionId);

    const doc = await docService.createDoc(
      {
        title: input.title.trim(),
        content: (input.content as Array<Record<string, unknown>> | undefined) ?? [],
        projectId: null,
        properties: {
          source: 'hiring',
          hiringPositionId: positionId,
        },
      },
      user
    );

    const positionDoc = await positionDocRepository.create({
      positionId,
      docId: doc.id,
      sortOrder: existingDocs.length,
      createdBy: user.id,
    });

    return positionDocRepository.findById(positionDoc.id) as Promise<PositionDoc>;
  }

  async deletePositionDoc(positionId: string, positionDocId: string, user: User): Promise<boolean> {
    const positionDoc = await positionDocRepository.findById(positionDocId);
    if (!positionDoc || positionDoc.positionId !== positionId) {
      return false;
    }

    // Deleting the underlying doc cascades and removes the link in position_docs.
    return docService.deleteDoc(positionDoc.docId, user);
  }

  // Candidates
  async listCandidates(filters?: { search?: string }): Promise<Candidate[]> {
    return candidateRepository.findAll(filters);
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    return candidateRepository.findById(id);
  }

  async createCandidate(input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    resumeUrl?: string | null;
    source?: string | null;
    notes?: string | null;
  }, user: User): Promise<Candidate> {
    await this.keepResumeFile(input.resumeUrl, user);

    return candidateRepository.create({
      name: input.name.trim(),
      email: input.email || null,
      phone: input.phone || null,
      resumeUrl: input.resumeUrl || null,
      source: input.source || null,
      notes: input.notes || null,
      createdBy: user.id,
    });
  }

  async updateCandidate(id: string, input: Partial<NewCandidate>, user: User): Promise<Candidate | null> {
    const candidate = await candidateRepository.findById(id);
    if (!candidate) return null;

    const hasResumeUpdate = Object.prototype.hasOwnProperty.call(input, 'resumeUrl');
    const nextResumeUrl = hasResumeUpdate ? (input.resumeUrl ?? null) : candidate.resumeUrl;
    const resumeChanged = hasResumeUpdate && candidate.resumeUrl !== nextResumeUrl;

    if (resumeChanged && nextResumeUrl) {
      await this.keepResumeFile(nextResumeUrl, user);
    }

    const updatedCandidate = await candidateRepository.update(id, input);
    if (!updatedCandidate) return null;

    if (resumeChanged && candidate.resumeUrl) {
      await this.deleteResumeFile(candidate.resumeUrl, user);
    }

    return updatedCandidate;
  }

  async deleteCandidate(id: string, user: User): Promise<boolean> {
    const candidate = await candidateRepository.findById(id);
    if (!candidate) return false;

    const candidateApplications = (candidate as { applications?: Array<{ id: string }> }).applications ?? [];
    const noteDocIds = new Set<string>();

    for (const application of candidateApplications) {
      const notes = await interviewNoteRepository.findByApplicationId(application.id) as Array<{ docId?: string | null }>;
      for (const note of notes) {
        if (note.docId) {
          noteDocIds.add(note.docId);
        }
      }
    }

    for (const docId of noteDocIds) {
      await docRepository.delete(docId);
    }

    await this.deleteResumeFile(candidate.resumeUrl, user);

    return candidateRepository.delete(id);
  }

  // Job Applications
  async listApplications(positionId: string): Promise<JobApplication[]> {
    return jobApplicationRepository.findByPositionId(positionId);
  }

  async getApplication(id: string): Promise<JobApplication | null> {
    return jobApplicationRepository.findById(id);
  }

  async createApplication(input: {
    candidateId: string;
    positionId: string;
    stageId?: string;
  }, user: User): Promise<JobApplication> {
    // Use default stage if none provided
    let stageId = input.stageId;
    if (!stageId) {
      const defaultStage = await interviewStageRepository.findDefault();
      stageId = defaultStage?.id;
    }

    const application = await jobApplicationRepository.create({
      candidateId: input.candidateId,
      positionId: input.positionId,
      stageId: stageId || null,
      sortOrder: 0,
      createdBy: user.id,
    });

    // Return full application with relations
    return jobApplicationRepository.findById(application.id) as Promise<JobApplication>;
  }

  async updateApplication(id: string, input: Partial<NewJobApplication>): Promise<JobApplication | null> {
    const application = await jobApplicationRepository.findById(id);
    if (!application) return null;
    return jobApplicationRepository.update(id, input);
  }

  async moveApplication(id: string, stageId: string, sortOrder?: number): Promise<JobApplication | null> {
    const application = await jobApplicationRepository.findById(id);
    if (!application) return null;

    // Validate stage exists
    const stage = await interviewStageRepository.findById(stageId);
    if (!stage) throw new Error('Invalid stage ID');

    await jobApplicationRepository.updateStage(id, stageId);
    if (sortOrder !== undefined) {
      await jobApplicationRepository.updateSortOrder(id, sortOrder);
    }

    return jobApplicationRepository.findById(id);
  }

  async deleteApplication(id: string): Promise<boolean> {
    const application = await jobApplicationRepository.findById(id);
    if (!application) return false;
    return jobApplicationRepository.delete(id);
  }

  // Interviews
  async listInterviews(applicationId: string): Promise<Interview[]> {
    return interviewRepository.findByApplicationId(applicationId);
  }

  async getInterview(id: string): Promise<Interview | null> {
    return interviewRepository.findById(id);
  }

  async createInterview(input: {
    applicationId: string;
    interviewerId?: string | null;
    scheduledAt?: string | null;
    durationMinutes?: number | null;
    type?: string | null;
    location?: string | null;
    link?: string | null;
    rating?: number | null;
    feedback?: string | null;
  }, user: User): Promise<Interview> {
    return interviewRepository.create({
      applicationId: input.applicationId,
      interviewerId: input.interviewerId || null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      durationMinutes: input.durationMinutes || null,
      type: input.type || null,
      location: input.location || null,
      link: input.link || null,
      rating: input.rating || null,
      feedback: input.feedback || null,
      createdBy: user.id,
    });
  }

  async updateInterview(id: string, input: {
    interviewerId?: string | null;
    scheduledAt?: string | null;
    durationMinutes?: number | null;
    type?: string | null;
    location?: string | null;
    link?: string | null;
    rating?: number | null;
    feedback?: string | null;
  }): Promise<Interview | null> {
    const interview = await interviewRepository.findById(id);
    if (!interview) return null;

    const updateData: Partial<NewInterview> = {};
    if (input.interviewerId !== undefined) updateData.interviewerId = input.interviewerId || null;
    if (input.scheduledAt !== undefined) updateData.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.durationMinutes !== undefined) updateData.durationMinutes = input.durationMinutes || null;
    if (input.type !== undefined) updateData.type = input.type || null;
    if (input.location !== undefined) updateData.location = input.location || null;
    if (input.link !== undefined) updateData.link = input.link || null;
    if (input.rating !== undefined) updateData.rating = input.rating || null;
    if (input.feedback !== undefined) updateData.feedback = input.feedback || null;

    return interviewRepository.update(id, updateData);
  }

  async deleteInterview(id: string): Promise<boolean> {
    const interview = await interviewRepository.findById(id);
    if (!interview) return false;
    return interviewRepository.delete(id);
  }

  // Interview Notes
  async listNotes(applicationId: string): Promise<InterviewNote[]> {
    return interviewNoteRepository.findByApplicationId(applicationId);
  }

  async getNote(id: string): Promise<InterviewNote | null> {
    return interviewNoteRepository.findById(id);
  }

  async createNote(input: {
    applicationId?: string | null;
    interviewId?: string | null;
    title: string;
    content?: unknown[];
  }, user: User): Promise<InterviewNote> {
    const title = input.title.trim();
    const content = (input.content as Array<Record<string, unknown>> | undefined) ?? [];

    const doc = await docRepository.create({
      title,
      content,
      projectId: null,
      properties: {
        source: 'hiring',
        hiringType: 'interview_note',
        hiringApplicationId: input.applicationId ?? null,
        hiringInterviewId: input.interviewId ?? null,
      },
      createdBy: user.id,
    });

    const note = await interviewNoteRepository.create({
      applicationId: input.applicationId || null,
      interviewId: input.interviewId || null,
      docId: doc.id,
      title,
      content,
      createdBy: user.id,
    });

    return interviewNoteRepository.findById(note.id) as Promise<InterviewNote>;
  }

  async updateNote(id: string, input: {
    title?: string;
    content?: unknown[];
  }): Promise<InterviewNote | null> {
    const note = await interviewNoteRepository.findById(id);
    if (!note) return null;

    const nextTitle = input.title?.trim();
    const nextContent = input.content as Array<Record<string, unknown>> | undefined;

    if (nextTitle !== undefined || nextContent !== undefined) {
      await docRepository.update(note.docId, {
        ...(nextTitle !== undefined ? { title: nextTitle } : {}),
        ...(nextContent !== undefined ? { content: nextContent } : {}),
      });
    }

    const updateData: Partial<NewInterviewNote> = {};
    if (nextTitle !== undefined) updateData.title = nextTitle;
    if (nextContent !== undefined) updateData.content = nextContent;

    const updated = await interviewNoteRepository.update(id, updateData);
    if (!updated) return null;

    return interviewNoteRepository.findById(updated.id) as Promise<InterviewNote>;
  }

  async deleteNote(id: string): Promise<boolean> {
    const note = await interviewNoteRepository.findById(id);
    if (!note) return false;

    const deletedDoc = await docRepository.delete(note.docId);
    if (deletedDoc) {
      return true;
    }

    return interviewNoteRepository.delete(id);
  }
}

export const hiringService = new HiringService();
