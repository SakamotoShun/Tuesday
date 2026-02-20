import { noticeBoardRepository, userRepository, type NoticeBoardItemWithUsers } from '../repositories';
import { NoticeBoardItemType, type NewNoticeBoardItem } from '../db/schema';
import type { User } from '../types';

export interface CreateNoticeBoardItemInput {
  type: 'announcement' | 'todo';
  title: string;
  description?: string | null;
  assigneeId?: string | null;
}

export interface UpdateNoticeBoardItemInput {
  type?: 'announcement' | 'todo';
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  sortOrder?: number;
}

export class NoticeBoardService {
  async listItems(): Promise<NoticeBoardItemWithUsers[]> {
    return noticeBoardRepository.findAll();
  }

  async createItem(input: CreateNoticeBoardItemInput, user: User): Promise<NoticeBoardItemWithUsers> {
    const title = input.title?.trim();
    if (!title) {
      throw new Error('Title is required');
    }

    if (input.type !== NoticeBoardItemType.ANNOUNCEMENT && input.type !== NoticeBoardItemType.TODO) {
      throw new Error('Invalid item type');
    }

    let assigneeId: string | null = null;
    if (input.type === NoticeBoardItemType.TODO && input.assigneeId) {
      assigneeId = await this.validateAssignee(input.assigneeId);
    }

    const existing = await noticeBoardRepository.findAll();
    const sortOrder = existing.length > 0 ? Math.max(...existing.map((item) => item.sortOrder)) + 1 : 0;

    const created = await noticeBoardRepository.create({
      type: input.type,
      title,
      description: input.description ?? null,
      createdBy: user.id,
      assigneeId,
      isCompleted: false,
      completedBy: null,
      completedAt: null,
      sortOrder,
    });

    if (created.type === NoticeBoardItemType.TODO && created.assigneeId && created.assigneeId !== user.id) {
      await this.notifyAssignee(created.assigneeId, created.title, user.name);
    }

    const complete = await noticeBoardRepository.findById(created.id);
    if (!complete) {
      throw new Error('Failed to load notice board item');
    }

    return complete;
  }

  async updateItem(id: string, input: UpdateNoticeBoardItemInput, user: User): Promise<NoticeBoardItemWithUsers | null> {
    const existing = await noticeBoardRepository.findById(id);
    if (!existing) {
      return null;
    }

    const updateData: Partial<NewNoticeBoardItem> = {};

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new Error('Title cannot be empty');
      }
      updateData.title = title;
    }

    if (input.description !== undefined) {
      updateData.description = input.description ?? null;
    }

    if (input.sortOrder !== undefined) {
      updateData.sortOrder = input.sortOrder;
    }

    const nextType = input.type ?? existing.type;
    if (nextType !== NoticeBoardItemType.ANNOUNCEMENT && nextType !== NoticeBoardItemType.TODO) {
      throw new Error('Invalid item type');
    }

    if (input.type !== undefined) {
      updateData.type = input.type;
    }

    if (nextType === NoticeBoardItemType.ANNOUNCEMENT) {
      updateData.assigneeId = null;
      updateData.isCompleted = false;
      updateData.completedBy = null;
      updateData.completedAt = null;
    } else if (input.assigneeId !== undefined) {
      if (input.assigneeId === null) {
        updateData.assigneeId = null;
      } else {
        updateData.assigneeId = await this.validateAssignee(input.assigneeId);
      }
    }

    const updated = await noticeBoardRepository.update(id, updateData);
    if (!updated) {
      return null;
    }

    if (
      updated.type === NoticeBoardItemType.TODO &&
      updated.assigneeId &&
      updated.assigneeId !== existing.assigneeId &&
      updated.assigneeId !== user.id
    ) {
      await this.notifyAssignee(updated.assigneeId, updated.title, user.name);
    }

    return noticeBoardRepository.findById(updated.id);
  }

  async deleteItem(id: string): Promise<boolean> {
    return noticeBoardRepository.delete(id);
  }

  async toggleItem(id: string, user: User): Promise<NoticeBoardItemWithUsers | null> {
    const existing = await noticeBoardRepository.findById(id);
    if (!existing) {
      return null;
    }

    if (existing.type !== NoticeBoardItemType.TODO) {
      throw new Error('Only todo items can be completed');
    }

    const nextCompleted = !existing.isCompleted;
    const updated = await noticeBoardRepository.update(id, {
      isCompleted: nextCompleted,
      completedBy: nextCompleted ? user.id : null,
      completedAt: nextCompleted ? new Date() : null,
    });

    if (!updated) {
      return null;
    }

    return noticeBoardRepository.findById(updated.id);
  }

  private async validateAssignee(assigneeId: string): Promise<string> {
    const assignee = await userRepository.findById(assigneeId);
    if (!assignee) {
      throw new Error('Assignee not found');
    }
    if (assignee.isDisabled) {
      throw new Error('Assignee is disabled');
    }
    return assigneeId;
  }

  private async notifyAssignee(assigneeId: string, title: string, assignedBy: string) {
    const { notificationService } = await import('./notification');
    await notificationService.notify(assigneeId, 'assignment', {
      title: `Assigned to notice board todo: ${title}`,
      body: `Assigned by ${assignedBy}`,
      link: '/',
    });
  }
}

export const noticeBoardService = new NoticeBoardService();
