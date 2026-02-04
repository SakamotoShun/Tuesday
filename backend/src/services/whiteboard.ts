import { whiteboardRepository } from '../repositories';
import { projectService } from './project';
import { type Whiteboard, type NewWhiteboard } from '../db/schema';
import type { User } from '../types';

export interface CreateWhiteboardInput {
  name: string;
  data?: Record<string, unknown>;
}

export interface UpdateWhiteboardInput {
  name?: string;
  data?: Record<string, unknown> | null;
}

export class WhiteboardService {
  async getProjectWhiteboards(projectId: string, user: User): Promise<Whiteboard[]> {
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    return whiteboardRepository.findByProjectId(projectId);
  }

  async getWhiteboard(whiteboardId: string, user: User): Promise<Whiteboard | null> {
    const whiteboard = await whiteboardRepository.findById(whiteboardId);

    if (!whiteboard) {
      return null;
    }

    const hasAccess = await projectService.hasAccess(whiteboard.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this whiteboard');
    }

    return whiteboard;
  }

  async createWhiteboard(projectId: string, input: CreateWhiteboardInput, user: User): Promise<Whiteboard> {
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    if (!input.name || input.name.trim() === '') {
      throw new Error('Whiteboard name is required');
    }

    const whiteboard = await whiteboardRepository.create({
      projectId,
      name: input.name.trim(),
      data: input.data ?? {},
      createdBy: user.id,
    } as NewWhiteboard);

    return whiteboardRepository.findById(whiteboard.id) as Promise<Whiteboard>;
  }

  async updateWhiteboard(whiteboardId: string, input: UpdateWhiteboardInput, user: User): Promise<Whiteboard | null> {
    const whiteboard = await whiteboardRepository.findById(whiteboardId);

    if (!whiteboard) {
      return null;
    }

    const hasAccess = await projectService.hasAccess(whiteboard.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this whiteboard');
    }

    const updateData: Partial<NewWhiteboard> = {};

    if (input.name !== undefined) {
      if (input.name.trim() === '') {
        throw new Error('Whiteboard name cannot be empty');
      }
      updateData.name = input.name.trim();
    }

    if (input.data !== undefined) {
      updateData.data = input.data ?? {};
    }

    return whiteboardRepository.update(whiteboardId, updateData);
  }

  async deleteWhiteboard(whiteboardId: string, user: User): Promise<boolean> {
    const whiteboard = await whiteboardRepository.findById(whiteboardId);

    if (!whiteboard) {
      return false;
    }

    const hasAccess = await projectService.hasAccess(whiteboard.projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this whiteboard');
    }

    return whiteboardRepository.delete(whiteboardId);
  }
}

export const whiteboardService = new WhiteboardService();
