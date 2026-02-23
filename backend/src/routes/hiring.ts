import { Hono } from 'hono';
import { auth, requireAdmin } from '../middleware';
import { hiringService } from '../services';
import { success, errors } from '../utils/response';
import {
  validateBody,
  formatValidationErrors,
  createInterviewStageSchema,
  updateInterviewStageSchema,
  reorderInterviewStagesSchema,
  createJobPositionSchema,
  updateJobPositionSchema,
  createCandidateSchema,
  updateCandidateSchema,
  createJobApplicationSchema,
  updateJobApplicationSchema,
  moveApplicationSchema,
  createInterviewSchema,
  updateInterviewSchema,
  createInterviewNoteSchema,
  updateInterviewNoteSchema,
  createPositionDocSchema,
} from '../utils/validation';

const hiring = new Hono();

// All hiring routes require auth + admin
hiring.use('*', auth, requireAdmin);

// ==========================================
// Interview Stages
// ==========================================

hiring.get('/stages', async (c) => {
  const stages = await hiringService.listStages();
  return success(c, stages);
});

hiring.post('/stages', async (c) => {
  const body = await c.req.json();
  const result = validateBody(createInterviewStageSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const stage = await hiringService.createStage(result.data);
  return success(c, stage, undefined, 201);
});

hiring.patch('/stages/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = validateBody(updateInterviewStageSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const stage = await hiringService.updateStage(id, result.data);
  if (!stage) return errors.notFound(c, 'Interview stage');
  return success(c, stage);
});

hiring.delete('/stages/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const deleted = await hiringService.deleteStage(id);
    if (!deleted) return errors.notFound(c, 'Interview stage');
    return success(c, { deleted: true });
  } catch (err: any) {
    return errors.badRequest(c, err.message);
  }
});

hiring.post('/stages/reorder', async (c) => {
  const body = await c.req.json();
  const result = validateBody(reorderInterviewStagesSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  await hiringService.reorderStages(result.data.ids);
  return success(c, { reordered: true });
});

// ==========================================
// Job Positions
// ==========================================

hiring.get('/positions', async (c) => {
  const status = c.req.query('status');
  const search = c.req.query('search');
  const positions = await hiringService.listPositions({ status, search });
  return success(c, positions);
});

hiring.post('/positions', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const result = validateBody(createJobPositionSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const position = await hiringService.createPosition(result.data, user);
  return success(c, position, undefined, 201);
});

hiring.get('/positions/:id', async (c) => {
  const id = c.req.param('id');
  const position = await hiringService.getPosition(id);
  if (!position) return errors.notFound(c, 'Job position');
  return success(c, position);
});

hiring.patch('/positions/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = validateBody(updateJobPositionSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const position = await hiringService.updatePosition(id, result.data);
  if (!position) return errors.notFound(c, 'Job position');
  return success(c, position);
});

hiring.delete('/positions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const deleted = await hiringService.deletePosition(id, user);
  if (!deleted) return errors.notFound(c, 'Job position');
  return success(c, { deleted: true });
});

hiring.get('/positions/:positionId/docs', async (c) => {
  const positionId = c.req.param('positionId');
  try {
    const docs = await hiringService.listPositionDocs(positionId);
    return success(c, docs);
  } catch (error) {
    if (error instanceof Error) {
      return errors.notFound(c, error.message);
    }
    return errors.internal(c, 'Failed to fetch position docs');
  }
});

hiring.get('/docs', async (c) => {
  const docs = await hiringService.listAllPositionDocs();
  return success(c, docs);
});

hiring.post('/positions/:positionId/docs', async (c) => {
  const user = c.get('user');
  const positionId = c.req.param('positionId');
  const body = await c.req.json();
  const result = validateBody(createPositionDocSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }

  try {
    const positionDoc = await hiringService.createPositionDoc(positionId, result.data, user);
    return success(c, positionDoc, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Job position not found') {
        return errors.notFound(c, 'Job position');
      }
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to create position doc');
  }
});

hiring.delete('/positions/:positionId/docs/:positionDocId', async (c) => {
  const user = c.get('user');
  const positionId = c.req.param('positionId');
  const positionDocId = c.req.param('positionDocId');

  try {
    const deleted = await hiringService.deletePositionDoc(positionId, positionDocId, user);
    if (!deleted) {
      return errors.notFound(c, 'Position doc');
    }
    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to delete position doc');
  }
});

// ==========================================
// Candidates
// ==========================================

hiring.get('/candidates', async (c) => {
  const search = c.req.query('search');
  const candidates = await hiringService.listCandidates({ search });
  return success(c, candidates);
});

hiring.post('/candidates', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const result = validateBody(createCandidateSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  try {
    const candidate = await hiringService.createCandidate(result.data, user);
    return success(c, candidate, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to create candidate');
  }
});

hiring.get('/candidates/:id', async (c) => {
  const id = c.req.param('id');
  const candidate = await hiringService.getCandidate(id);
  if (!candidate) return errors.notFound(c, 'Candidate');
  return success(c, candidate);
});

hiring.patch('/candidates/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = validateBody(updateCandidateSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  try {
    const candidate = await hiringService.updateCandidate(id, result.data, user);
    if (!candidate) return errors.notFound(c, 'Candidate');
    return success(c, candidate);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to update candidate');
  }
});

hiring.delete('/candidates/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  try {
    const deleted = await hiringService.deleteCandidate(id, user);
    if (!deleted) return errors.notFound(c, 'Candidate');
    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to delete candidate');
  }
});

// ==========================================
// Job Applications
// ==========================================

hiring.get('/positions/:positionId/applications', async (c) => {
  const positionId = c.req.param('positionId');
  const applications = await hiringService.listApplications(positionId);
  return success(c, applications);
});

hiring.post('/applications', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const result = validateBody(createJobApplicationSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  try {
    const application = await hiringService.createApplication(result.data, user);
    return success(c, application, undefined, 201);
  } catch (err: any) {
    return errors.badRequest(c, err.message);
  }
});

hiring.get('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const application = await hiringService.getApplication(id);
  if (!application) return errors.notFound(c, 'Application');
  return success(c, application);
});

hiring.patch('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = validateBody(updateJobApplicationSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const application = await hiringService.updateApplication(id, result.data);
  if (!application) return errors.notFound(c, 'Application');
  return success(c, application);
});

hiring.patch('/applications/:id/move', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = validateBody(moveApplicationSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  try {
    const application = await hiringService.moveApplication(id, result.data.stageId, result.data.sortOrder);
    if (!application) return errors.notFound(c, 'Application');
    return success(c, application);
  } catch (err: any) {
    return errors.badRequest(c, err.message);
  }
});

hiring.delete('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await hiringService.deleteApplication(id);
  if (!deleted) return errors.notFound(c, 'Application');
  return success(c, { deleted: true });
});

// ==========================================
// Interviews
// ==========================================

hiring.get('/applications/:applicationId/interviews', async (c) => {
  const applicationId = c.req.param('applicationId');
  const interviews = await hiringService.listInterviews(applicationId);
  return success(c, interviews);
});

hiring.post('/interviews', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const result = validateBody(createInterviewSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const interview = await hiringService.createInterview(result.data, user);
  return success(c, interview, undefined, 201);
});

hiring.get('/interviews/:id', async (c) => {
  const id = c.req.param('id');
  const interview = await hiringService.getInterview(id);
  if (!interview) return errors.notFound(c, 'Interview');
  return success(c, interview);
});

hiring.patch('/interviews/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = validateBody(updateInterviewSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const interview = await hiringService.updateInterview(id, result.data);
  if (!interview) return errors.notFound(c, 'Interview');
  return success(c, interview);
});

hiring.delete('/interviews/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await hiringService.deleteInterview(id);
  if (!deleted) return errors.notFound(c, 'Interview');
  return success(c, { deleted: true });
});

// ==========================================
// Interview Notes
// ==========================================

hiring.get('/applications/:applicationId/notes', async (c) => {
  const applicationId = c.req.param('applicationId');
  const notes = await hiringService.listNotes(applicationId);
  return success(c, notes);
});

hiring.post('/notes', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const result = validateBody(createInterviewNoteSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const note = await hiringService.createNote(result.data, user);
  return success(c, note, undefined, 201);
});

hiring.get('/notes/:id', async (c) => {
  const id = c.req.param('id');
  const note = await hiringService.getNote(id);
  if (!note) return errors.notFound(c, 'Interview note');
  return success(c, note);
});

hiring.patch('/notes/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = validateBody(updateInterviewNoteSchema, body);
  if (!result.success) {
    return errors.validation(c, formatValidationErrors(result.errors));
  }
  const note = await hiringService.updateNote(id, result.data);
  if (!note) return errors.notFound(c, 'Interview note');
  return success(c, note);
});

hiring.delete('/notes/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await hiringService.deleteNote(id);
  if (!deleted) return errors.notFound(c, 'Interview note');
  return success(c, { deleted: true });
});

export { hiring };
