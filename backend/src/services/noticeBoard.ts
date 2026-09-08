import { noticeBoardRepository, userRepository, type NoticeBoardItemWithUsers } from '../repositories';
import { NoticeBoardItemType, type NewNoticeBoardItem } from '../db/schema';
import type { User } from '../types';
import { db } from '../db/client';
import { notificationService } from './notification';

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

    const committed = await db.transaction(async (tx) => {
      const existing = await noticeBoardRepository.findAll(tx);
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
      }, tx);
      const notifications = created.type === NoticeBoardItemType.TODO && created.assigneeId && created.assigneeId !== user.id
        ? await notificationService.enqueueNoticeAssignment({
            noticeId: created.id,
            noticeTitle: created.title,
            assigneeId: created.assigneeId,
            assignedBy: user.name,
          }, tx)
        : [];
      const complete = await noticeBoardRepository.findById(created.id, tx);
      if (!complete) throw new Error('Failed to load notice board item');
      return { complete, notifications };
    });
    notificationService.publishMany(committed.notifications);
    return committed.complete;
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

    const committed = await db.transaction(async (tx) => {
      const previous = await noticeBoardRepository.findById(id, tx);
      if (!previous) return null;
      const updated = await noticeBoardRepository.update(id, updateData, tx);
      if (!updated) return null;
      const notifications = updated.type === NoticeBoardItemType.TODO &&
        updated.assigneeId &&
        updated.assigneeId !== previous.assigneeId &&
        updated.assigneeId !== user.id
        ? await notificationService.enqueueNoticeAssignment({
            noticeId: updated.id,
            noticeTitle: updated.title,
            assigneeId: updated.assigneeId,
            assignedBy: user.name,
          }, tx)
        : [];
      const complete = await noticeBoardRepository.findById(updated.id, tx);
      return complete ? { complete, notifications } : null;
    });
    if (!committed) return null;
    notificationService.publishMany(committed.notifications);
    return committed.complete;
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

}

export const noticeBoardService = new NoticeBoardService();
