import { randomBytes } from 'node:crypto';
import { docRepository } from '../repositories/doc';
import { docShareRepository, type DocShareWithUser } from '../repositories/docShare';
import { sharedLinkRepository } from '../repositories/sharedLink';
import { userRepository } from '../repositories/user';
import { projectService } from './project';
import { activityService } from './activity';
import { type Doc, type NewDoc, type SharedLink } from '../db/schema';
import type { User } from '../types';
import { extractSearchTextFromDocContent } from '../utils/doc-search';
import { convertDocSourceToBlocks, type DocSourceFormat } from '../utils/doc-import';
import { assertNotFreelancer, isFreelancer } from '../utils/permissions';
import { docCollabHub } from '../collab/hub';

export interface CreateDocInput {
  title: string;
  content?: Array<Record<string, unknown>>;
  source?: string;
  sourceFormat?: DocSourceFormat;
  projectId?: string | null;
  parentId?: string | null;
  isDatabase?: boolean;
  schema?: Record<string, unknown> | null;
  properties?: Record<string, unknown>;
}

export interface UpdateDocInput {
  title?: string;
  content?: Array<Record<string, unknown>>;
  source?: string;
  sourceFormat?: DocSourceFormat;
  parentId?: string | null;
  schema?: Record<string, unknown> | null;
  properties?: Record<string, unknown>;
}

export type DocMcpParent =
  | { type: 'project'; id: string }
  | { type: 'doc'; id: string };

export type AppendDocBlocksPosition =
  | { type: 'end' }
  | { type: 'start' }
  | { type: 'after_block'; afterBlockId: string };

export interface DocWithChildren extends Doc {
  children?: Doc[];
  parent?: Doc | null;
}

export interface DocPublicShareLink {
  id: string;
  token: string;
  permission: 'view';
  createdAt: Date;
}

export interface SharedDocView {
  doc: {
    id: string;
    title: string;
    content: Array<Record<string, unknown>>;
  };
  permission: 'view';
}

export class DocService {
  private async canManageShares(doc: Doc, user: User): Promise<boolean> {
    if (isFreelancer(user)) {
      return false;
    }

    if (user.role === 'admin' || doc.createdBy === user.id) {
      return true;
    }

    if (doc.projectId) {
      return projectService.hasAccess(doc.projectId, user);
    }

    return false;
  }

  private toPublicShareLink(link: SharedLink): DocPublicShareLink {
    return {
      id: link.id,
      token: link.token,
      permission: 'view',
      createdAt: link.createdAt,
    };
  }

  private generateShareToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async canAccessDoc(doc: Doc, user: User): Promise<boolean> {
    if (doc.projectId) {
      return projectService.hasAccess(doc.projectId, user);
    }

    if (doc.createdBy === user.id || user.role === 'admin') {
      return true;
    }

    return docShareRepository.hasUserAccess(doc.id, user.id);
  }

  private async assertCanEditDoc(doc: Doc, user: User): Promise<void> {
    assertNotFreelancer(user, 'Freelancers cannot edit docs');

    const hasAccess = await this.canAccessDoc(doc, user);
    if (!hasAccess) {
      throw new Error('Access denied to this doc');
    }
  }

  private assertValidBlocks(blocks: Array<Record<string, unknown>> | undefined): void {
    if (blocks === undefined) {
      return;
    }

    if (!Array.isArray(blocks)) {
      throw new Error('Blocks must be an array');
    }

    for (const block of blocks) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        throw new Error('Each block must be an object');
      }
    }
  }

  private resolveContent(input: { content?: Array<Record<string, unknown>>; source?: string; sourceFormat?: DocSourceFormat }): Array<Record<string, unknown>> | undefined {
    if (input.content !== undefined && input.source !== undefined) {
      throw new Error('Provide either content/blocks or source, not both');
    }

    if (input.content !== undefined) {
      this.assertValidBlocks(input.content);
      return input.content;
    }

    if (input.source !== undefined) {
      return convertDocSourceToBlocks(input.source, input.sourceFormat);
    }

    return undefined;
  }

  private insertBlocks(
    content: Array<Record<string, unknown>>,
    blocks: Array<Record<string, unknown>>,
    position: AppendDocBlocksPosition = { type: 'end' }
  ): Array<Record<string, unknown>> {
    if (position.type === 'end') {
      return [...content, ...blocks];
    }

    if (position.type === 'start') {
      return [...blocks, ...content];
    }

    const index = content.findIndex((block) => block.id === position.afterBlockId);
    if (index === -1) {
      throw new Error('afterBlockId not found in doc content');
    }

    return [...content.slice(0, index + 1), ...blocks, ...content.slice(index + 1)];
  }

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
  async getPersonalDocs(user: User): Promise<Doc[]> {
    return docRepository.findPersonalDocs(user.id);
  }

  /**
   * Get a single doc by ID
   */
  async getDoc(docId: string, user: User): Promise<(Doc & { parent?: Doc | null }) | null> {
    const doc = await docRepository.findByIdWithParent(docId);

    if (!doc) {
      return null;
    }

    const hasAccess = await this.canAccessDoc(doc, user);
    if (!hasAccess) {
      throw new Error('Access denied to this doc');
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
    assertNotFreelancer(user, 'Freelancers cannot create docs');

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

    const content = this.resolveContent(input) ?? [];

    const doc = await docRepository.create({
      title: input.title.trim(),
      content,
      searchText: extractSearchTextFromDocContent(content),
      projectId: input.projectId || null,
      parentId: input.parentId || null,
      isDatabase: input.isDatabase || false,
      schema: input.schema || null,
      properties: input.properties || {},
      createdBy: user.id,
    });

    await activityService.record({
      actorId: user.id,
      action: 'doc.created',
      entityType: 'doc',
      entityId: doc.id,
      entityName: doc.title,
      projectId: doc.projectId,
    });

    return doc;
  }

  async createDocFromParent(
    parent: DocMcpParent,
    input: { title: string; blocks?: Array<Record<string, unknown>>; source?: string; sourceFormat?: DocSourceFormat },
    user: User
  ): Promise<Doc> {
    if (!parent || (parent.type !== 'project' && parent.type !== 'doc') || !parent.id) {
      throw new Error('Invalid doc parent');
    }

    if (typeof input.title !== 'string') {
      throw new Error('Doc title is required');
    }

    const content = this.resolveContent({ content: input.blocks, source: input.source, sourceFormat: input.sourceFormat });

    if (parent.type === 'project') {
      return this.createDoc({ title: input.title, content, projectId: parent.id }, user);
    }

    const parentDoc = await docRepository.findById(parent.id);
    if (!parentDoc) {
      throw new Error('Parent doc not found');
    }

    await this.assertCanEditDoc(parentDoc, user);
    return this.createDoc({
      title: input.title,
      content,
      projectId: parentDoc.projectId,
      parentId: parentDoc.id,
    }, user);
  }

  async updateDocTitle(docId: string, title: string, expectedVersion: number, user: User): Promise<Doc | null> {
    if (!docId) {
      throw new Error('Doc ID is required');
    }

    if (typeof title !== 'string') {
      throw new Error('Doc title is required');
    }

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error('expectedVersion must be a positive integer');
    }

    const doc = await docRepository.findById(docId);
    if (!doc) {
      return null;
    }

    await this.assertCanEditDoc(doc, user);

    if (title.trim() === '') {
      throw new Error('Doc title cannot be empty');
    }

    const updated = await docRepository.updateIfVersion(docId, expectedVersion, { title: title.trim() });
    if (!updated) {
      throw new Error('Conflict: doc version changed. Re-read and retry with new expectedVersion.');
    }

    await activityService.record({
      actorId: user.id,
      action: 'doc.updated',
      entityType: 'doc',
      entityId: updated.id,
      entityName: updated.title,
      projectId: updated.projectId,
      metadata: { changedFields: ['title'] },
    });

    return updated;
  }

  async appendDocBlocks(
    docId: string,
    blocks: Array<Record<string, unknown>>,
    expectedVersion: number,
    user: User,
    position?: AppendDocBlocksPosition
  ): Promise<Doc | null> {
    if (!docId) {
      throw new Error('Doc ID is required');
    }

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error('expectedVersion must be a positive integer');
    }

    if (blocks === undefined) {
      throw new Error('Blocks are required');
    }

    this.assertValidBlocks(blocks);

    const doc = await docRepository.findById(docId);
    if (!doc) {
      return null;
    }

    await this.assertCanEditDoc(doc, user);

    if (blocks.length === 0) {
      throw new Error('At least one block is required');
    }

    if (blocks.length > 100) {
      throw new Error('Cannot append more than 100 blocks at once');
    }

    if (docCollabHub.getActiveClientCount(docId) > 0) {
      throw new Error('Doc has active collaborators. Retry after collaborators disconnect.');
    }

    const currentContent = Array.isArray(doc.content) ? doc.content as Array<Record<string, unknown>> : [];
    const content = this.insertBlocks(currentContent, blocks, position);
    const updated = await docRepository.updateIfVersion(docId, expectedVersion, {
      content,
      searchText: extractSearchTextFromDocContent(content),
    });

    if (!updated) {
      throw new Error('Conflict: doc version changed. Re-read and retry with new expectedVersion.');
    }

    await activityService.record({
      actorId: user.id,
      action: 'doc.updated',
      entityType: 'doc',
      entityId: updated.id,
      entityName: updated.title,
      projectId: updated.projectId,
      metadata: { changedFields: ['content'] },
    });

    return updated;
  }

  async appendDocSource(
    docId: string,
    source: string,
    sourceFormat: DocSourceFormat | undefined,
    expectedVersion: number,
    user: User,
    position?: AppendDocBlocksPosition
  ): Promise<Doc | null> {
    const blocks = convertDocSourceToBlocks(source, sourceFormat);
    return this.appendDocBlocks(docId, blocks, expectedVersion, user, position);
  }

  /**
   * Update a doc
   */
  async updateDoc(docId: string, input: UpdateDocInput, user: User): Promise<Doc | null> {
    assertNotFreelancer(user, 'Freelancers cannot edit docs');

    const doc = await docRepository.findById(docId);

    if (!doc) {
      return null;
    }

    const hasAccess = await this.canAccessDoc(doc, user);
    if (!hasAccess) {
      throw new Error('Access denied to this doc');
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

    const content = this.resolveContent(input);
    if (content !== undefined) {
      updateData.content = content;
      updateData.searchText = extractSearchTextFromDocContent(content);
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

    const updated = await docRepository.update(docId, updateData);
    if (updated) {
      await activityService.record({
        actorId: user.id,
        action: 'doc.updated',
        entityType: 'doc',
        entityId: updated.id,
        entityName: updated.title,
        projectId: updated.projectId,
        metadata: {
          changedFields: Object.keys(updateData),
        },
      });
    }

    return updated;
  }

  /**
   * Delete a doc
   */
  async deleteDoc(docId: string, user: User): Promise<boolean> {
    assertNotFreelancer(user, 'Freelancers cannot delete docs');

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

    await sharedLinkRepository.deleteDocLink(docId);
    docCollabHub.closeRoom(docId, 1008, 'Doc deleted');

    const deleted = await docRepository.delete(docId);
    if (deleted) {
      await activityService.record({
        actorId: user.id,
        action: 'doc.deleted',
        entityType: 'doc',
        entityId: doc.id,
        entityName: doc.title,
        projectId: doc.projectId,
      });
    }

    return deleted;
  }

  async listDocShares(docId: string, user: User): Promise<DocShareWithUser[] | null> {
    const doc = await docRepository.findById(docId);
    if (!doc) {
      return null;
    }

    if (!await this.canManageShares(doc, user)) {
      throw new Error('Access denied to manage doc shares');
    }

    return docShareRepository.findByDocId(doc.id);
  }

  async updateDocShares(docId: string, userIds: string[], user: User): Promise<DocShareWithUser[] | null> {
    const doc = await docRepository.findById(docId);
    if (!doc) {
      return null;
    }

    if (!await this.canManageShares(doc, user)) {
      throw new Error('Access denied to manage doc shares');
    }

    const dedupedUserIds = Array.from(new Set(userIds.filter((candidateId) => candidateId !== doc.createdBy)));

    if (dedupedUserIds.length > 0) {
      const recipients = await Promise.all(dedupedUserIds.map((recipientId) => userRepository.findById(recipientId)));
      const invalidRecipient = recipients.find((recipient) => !recipient || recipient.isDisabled);
      if (invalidRecipient) {
        throw new Error('One or more selected users cannot be shared with');
      }
    }

    return docShareRepository.replaceShares(doc.id, dedupedUserIds, user.id);
  }

  async getDocPublicShareLink(docId: string, user: User): Promise<DocPublicShareLink | null> {
    const doc = await docRepository.findById(docId);
    if (!doc) {
      throw new Error('Doc not found');
    }

    if (!await this.canManageShares(doc, user)) {
      throw new Error('Access denied to manage doc shares');
    }

    const link = await sharedLinkRepository.findDocLink(doc.id);
    return link ? this.toPublicShareLink(link) : null;
  }

  async createDocPublicShareLink(docId: string, user: User): Promise<DocPublicShareLink> {
    const doc = await docRepository.findById(docId);
    if (!doc) {
      throw new Error('Doc not found');
    }

    if (!await this.canManageShares(doc, user)) {
      throw new Error('Access denied to manage doc shares');
    }

    const token = this.generateShareToken();
    const link = await sharedLinkRepository.upsertDocViewLink(doc.id, token, user.id);
    return this.toPublicShareLink(link);
  }

  async deleteDocPublicShareLink(docId: string, user: User): Promise<boolean> {
    const doc = await docRepository.findById(docId);
    if (!doc) {
      throw new Error('Doc not found');
    }

    if (!await this.canManageShares(doc, user)) {
      throw new Error('Access denied to manage doc shares');
    }

    const deletedCount = await sharedLinkRepository.deleteDocLink(doc.id);
    return deletedCount > 0;
  }

  async getSharedDocByToken(token: string): Promise<SharedDocView | null> {
    const link = await sharedLinkRepository.findByToken(token);
    if (!link) {
      return null;
    }

    const doc = await docRepository.findById(link.docId);
    if (!doc) {
      return null;
    }

    return {
      doc: {
        id: doc.id,
        title: doc.title,
        content: doc.content as Array<Record<string, unknown>>,
      },
      permission: 'view',
    };
  }
}

export const docService = new DocService();
