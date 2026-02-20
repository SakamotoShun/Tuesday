import { docRepository, favoriteRepository, projectRepository, taskRepository } from '../repositories';
import { FavoriteEntityType } from '../db/schema';
import { projectService } from './project';
import type { User } from '../types';

export type FavoriteEntityTypeValue = 'project' | 'task' | 'doc';

export interface FavoriteItem {
  id: string;
  entityType: FavoriteEntityTypeValue;
  entityId: string;
  title: string;
  subtitle: string | null;
  link: string;
  projectId: string | null;
  sortOrder: number;
  createdAt: Date;
}

export class FavoriteService {
  async listFavorites(user: User): Promise<FavoriteItem[]> {
    const favorites = await favoriteRepository.listByUserId(user.id);
    const resolved = await Promise.all(favorites.map((favorite) => this.resolveFavorite(user, favorite)));
    return resolved.filter((item): item is FavoriteItem => item !== null);
  }

  async addFavorite(user: User, entityType: FavoriteEntityTypeValue, entityId: string): Promise<FavoriteItem> {
    await this.assertEntityAccess(user, entityType, entityId);

    const existing = await favoriteRepository.findByUserEntity(user.id, entityType, entityId);
    if (existing) {
      const resolvedExisting = await this.resolveFavorite(user, existing);
      if (!resolvedExisting) {
        throw new Error('Favorite is no longer accessible');
      }
      return resolvedExisting;
    }

    const sortOrder = await favoriteRepository.getNextSortOrder(user.id);
    const created = await favoriteRepository.create({
      userId: user.id,
      entityType,
      entityId,
      sortOrder,
    });

    const resolved = await this.resolveFavorite(user, created);
    if (!resolved) {
      throw new Error('Failed to resolve favorite');
    }
    return resolved;
  }

  async removeFavorite(userId: string, entityType: FavoriteEntityTypeValue, entityId: string): Promise<boolean> {
    return favoriteRepository.deleteByUserEntity(userId, entityType, entityId);
  }

  async reorderFavorites(userId: string, favoriteIds: string[]): Promise<void> {
    const current = await favoriteRepository.listByUserId(userId);
    const byId = new Map(current.map((item) => [item.id, item]));
    const updates = favoriteIds
      .map((id, index) => {
        const existing = byId.get(id);
        if (!existing) {
          return null;
        }
        return { id: existing.id, sortOrder: index };
      })
      .filter((item): item is { id: string; sortOrder: number } => item !== null);

    if (updates.length === 0) {
      return;
    }

    await favoriteRepository.reorder(userId, updates);
  }

  private async assertEntityAccess(user: User, entityType: FavoriteEntityTypeValue, entityId: string): Promise<void> {
    if (entityType === FavoriteEntityType.PROJECT) {
      const project = await projectRepository.findById(entityId);
      if (!project) {
        throw new Error('Project not found');
      }
      const hasAccess = await projectService.hasAccess(project.id, user);
      if (!hasAccess) {
        throw new Error('Access denied to this project');
      }
      return;
    }

    if (entityType === FavoriteEntityType.TASK) {
      const task = await taskRepository.findById(entityId);
      if (!task) {
        throw new Error('Task not found');
      }
      const hasAccess = await projectService.hasAccess(task.projectId, user);
      if (!hasAccess) {
        throw new Error('Access denied to this task');
      }
      return;
    }

    if (entityType === FavoriteEntityType.DOC) {
      const doc = await docRepository.findById(entityId);
      if (!doc) {
        throw new Error('Doc not found');
      }
      if (doc.projectId) {
        const hasAccess = await projectService.hasAccess(doc.projectId, user);
        if (!hasAccess) {
          throw new Error('Access denied to this doc');
        }
      } else if (doc.createdBy !== user.id && user.role !== 'admin') {
        throw new Error('Access denied to this doc');
      }
      return;
    }

    throw new Error('Unsupported favorite entity type');
  }

  private async resolveFavorite(
    user: User,
    favorite: {
      id: string;
      entityType: string;
      entityId: string;
      sortOrder: number;
      createdAt: Date;
    }
  ): Promise<FavoriteItem | null> {
    const entityType = favorite.entityType as FavoriteEntityTypeValue;

    if (entityType === FavoriteEntityType.PROJECT) {
      const project = await projectRepository.findById(favorite.entityId);
      if (!project) {
        return null;
      }
      const hasAccess = await projectService.hasAccess(project.id, user);
      if (!hasAccess) {
        return null;
      }
      return {
        id: favorite.id,
        entityType,
        entityId: project.id,
        title: project.name,
        subtitle: project.client,
        link: `/projects/${project.id}`,
        projectId: project.id,
        sortOrder: favorite.sortOrder,
        createdAt: favorite.createdAt,
      };
    }

    if (entityType === FavoriteEntityType.TASK) {
      const task = await taskRepository.findById(favorite.entityId);
      if (!task) {
        return null;
      }
      const hasAccess = await projectService.hasAccess(task.projectId, user);
      if (!hasAccess) {
        return null;
      }
      const project = await projectRepository.findById(task.projectId);
      return {
        id: favorite.id,
        entityType,
        entityId: task.id,
        title: task.title,
        subtitle: project?.name ?? 'Task',
        link: `/projects/${task.projectId}/tasks`,
        projectId: task.projectId,
        sortOrder: favorite.sortOrder,
        createdAt: favorite.createdAt,
      };
    }

    if (entityType === FavoriteEntityType.DOC) {
      const doc = await docRepository.findById(favorite.entityId);
      if (!doc) {
        return null;
      }

      if (doc.projectId) {
        const hasAccess = await projectService.hasAccess(doc.projectId, user);
        if (!hasAccess) {
          return null;
        }
      } else if (doc.createdBy !== user.id && user.role !== 'admin') {
        return null;
      }

      return {
        id: favorite.id,
        entityType,
        entityId: doc.id,
        title: doc.title,
        subtitle: doc.projectId ? 'Project doc' : 'Personal doc',
        link: doc.projectId ? `/projects/${doc.projectId}/docs/${doc.id}` : `/docs/personal/${doc.id}`,
        projectId: doc.projectId,
        sortOrder: favorite.sortOrder,
        createdAt: favorite.createdAt,
      };
    }

    return null;
  }
}

export const favoriteService = new FavoriteService();
