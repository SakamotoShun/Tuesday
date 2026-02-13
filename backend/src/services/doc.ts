import { docRepository } from '../repositories';
import { projectService } from './project';
import { type Doc, type NewDoc } from '../db/schema';
import type { User } from '../types';
import { extractSearchTextFromDocContent } from '../utils/doc-search';

export interface CreateDocInput {
  title: string;
  content?: Array<Record<string, unknown>>;
  projectId?: string | null;
  parentId?: string | null;
  isDatabase?: boolean;
  schema?: Record<string, unknown> | null;
  properties?: Record<string, unknown>;
}

export interface UpdateDocInput {
  title?: string;
  content?: Array<Record<string, unknown>>;
  parentId?: string | null;
  schema?: Record<string, unknown> | null;
  properties?: Record<string, unknown>;
}

export interface DocWithChildren extends Doc {
  children?: Doc[];
  parent?: Doc | null;
}

export class DocService {
  /**
   * Get all docs in a project
   */
  async getProjectDocs(projectId: string, user: User): Promise<Doc[]> {
    // Verify access
    const hasAccess = await projectService.hasAccess(projectId, user);
    if (!hasAccess) {
      throw new Error('Access denied to this project');
    }

    return docRepository.findByProjectId(projectId);
  }

  /**
   * Get personal docs for a user
   */
  async getPersonalDocs(userId: string): Promise<Doc[]> {
    return docRepository.findPersonalDocs(userId);
  }

  /**
   * Get a single doc by ID
   */
  async getDoc(docId: string, user: User): Promise<(Doc & { parent?: Doc | null }) | null> {
    const doc = await docRepository.findByIdWithParent(docId);

    if (!doc) {
      return null;
    }

    // Check access for project docs
    if (doc.projectId) {
      const hasAccess = await projectService.hasAccess(doc.projectId, user);
      if (!hasAccess) {
        throw new Error('Access denied to this doc');
      }
    } else {
      // Personal docs: only creator or admin can access
      if (doc.createdBy !== user.id && user.role !== 'admin') {
        throw new Error('Access denied to this doc');
      }
    }

    return doc;
  }

  /**
   * Get doc with children (for tree view)
   */
  async getDocWithChildren(docId: string, user: User): Promise<DocWithChildren | null> {
    const doc = await this.getDoc(docId, user);
    
    if (!doc) {
      return null;
    }

    const children = await docRepository.findChildren(docId);
    
    return {
      ...doc,
      children,
    };
  }

  /**
   * Create a new doc
   */
  async createDoc(input: CreateDocInput, user: User): Promise<Doc> {
    // Validate title
    if (!input.title || input.title.trim() === '') {
      throw new Error('Doc title is required');
    }

    // Check project access if projectId is provided
    if (input.projectId) {
      const hasAccess = await projectService.hasAccess(input.projectId, user);
      if (!hasAccess) {
        throw new Error('Access denied to this project');
      }
    }

    // Validate parent doc if provided
    if (input.parentId) {
      const parent = await docRepository.findById(input.parentId);
      if (!parent) {
        throw new Error('Parent doc not found');
      }
      // Parent must be in same project (or both personal)
      if (parent.projectId !== input.projectId) {
        throw new Error('Parent doc must be in the same project');
      }
    }

    const doc = await docRepository.create({
      title: input.title.trim(),
      content: input.content ?? [],
      searchText: extractSearchTextFromDocContent(input.content ?? []),
      projectId: input.projectId || null,
      parentId: input.parentId || null,
      isDatabase: input.isDatabase || false,
      schema: input.schema || null,
      properties: input.properties || {},
      createdBy: user.id,
    });

    return doc;
  }

  /**
   * Update a doc
   */
  async updateDoc(docId: string, input: UpdateDocInput, user: User): Promise<Doc | null> {
    const doc = await docRepository.findById(docId);

    if (!doc) {
      return null;
    }

    // Check access for project docs
    if (doc.projectId) {
      const hasAccess = await projectService.hasAccess(doc.projectId, user);
      if (!hasAccess) {
        throw new Error('Access denied to this doc');
      }
    } else {
      // Personal docs: only creator or admin can update
      if (doc.createdBy !== user.id && user.role !== 'admin') {
        throw new Error('Access denied to this doc');
      }
    }

    // Validate parent doc if provided
    if (input.parentId !== undefined && input.parentId !== null) {
      const parent = await docRepository.findById(input.parentId);
      if (!parent) {
        throw new Error('Parent doc not found');
      }
      // Prevent circular reference
      if (input.parentId === docId) {
        throw new Error('Doc cannot be its own parent');
      }
      // Parent must be in same project
      if (parent.projectId !== doc.projectId) {
        throw new Error('Parent doc must be in the same project');
      }
    }

    const updateData: Partial<NewDoc> = {};

    if (input.title !== undefined) {
      if (input.title.trim() === '') {
        throw new Error('Doc title cannot be empty');
      }
      updateData.title = input.title.trim();
    }

    if (input.content !== undefined) {
      updateData.content = input.content;
      updateData.searchText = extractSearchTextFromDocContent(input.content);
    }

    if (input.parentId !== undefined) {
      updateData.parentId = input.parentId;
    }

    if (input.schema !== undefined) {
      updateData.schema = input.schema;
    }

    if (input.properties !== undefined) {
      updateData.properties = input.properties;
    }

    return docRepository.update(docId, updateData);
  }

  /**
   * Delete a doc
   */
  async deleteDoc(docId: string, user: User): Promise<boolean> {
    const doc = await docRepository.findById(docId);

    if (!doc) {
      return false;
    }

    // Check access for project docs
    if (doc.projectId) {
      // Check if user is project owner or admin
      const isOwner = await projectService.isOwner(doc.projectId, user);
      if (!isOwner && user.role !== 'admin') {
        throw new Error('Only project owners can delete docs');
      }
    } else {
      // Personal docs: only creator or admin can delete
      if (doc.createdBy !== user.id && user.role !== 'admin') {
        throw new Error('Access denied to this doc');
      }
    }

    return docRepository.delete(docId);
  }
}

export const docService = new DocService();
