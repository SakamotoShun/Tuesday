import { activityRepository } from '../repositories/activity';
import { type ActivityEntityType } from '../db/schema';
import type { User } from '../types';

export interface RecordActivityInput {
  actorId: string;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  entityName: string;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}

export class ActivityService {
  async record(input: RecordActivityInput): Promise<void> {
    try {
      await activityRepository.create({
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityName: input.entityName,
        projectId: input.projectId ?? null,
        metadata: input.metadata ?? {},
      });
    } catch (error) {
      console.error('Failed to record activity:', error);
    }
  }

  async getRecentActivity(user: User, limit = 25) {
    return activityRepository.findRecentForUser(user.id, user.role === 'admin', limit);
  }

  async getProjectActivity(projectId: string, user: User, limit = 25) {
    const { projectService } = await import('./project');
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }
    return activityRepository.findByProject(projectId, limit);
  }
}

export const activityService = new ActivityService();
