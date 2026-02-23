import { policyRepository } from '../repositories';
import { activityService } from './activity';
import { UserRole, type Doc, type NewDoc } from '../db/schema';
import type { User } from '../types';
import { extractSearchTextFromDocContent } from '../utils/doc-search';

export interface CreatePolicyDatabaseInput {
  title: string;
  schema?: Record<string, unknown> | null;
}

export interface UpdatePolicyDatabaseInput {
  title?: string;
  schema?: Record<string, unknown> | null;
}

export interface CreatePolicyRowInput {
  title: string;
  content?: Array<Record<string, unknown>>;
  properties?: Record<string, unknown>;
}

export interface UpdatePolicyRowInput {
  title?: string;
  content?: Array<Record<string, unknown>>;
  properties?: Record<string, unknown>;
}

export interface PolicyDatabaseWithRows extends Doc {
  children: Doc[];
}

export class PolicyService {
  async listDatabases(): Promise<Doc[]> {
    return policyRepository.findDatabases();
  }

  async getDatabaseWithRows(databaseId: string): Promise<PolicyDatabaseWithRows | null> {
    const database = await policyRepository.findDatabaseById(databaseId);
    if (!database) {
      return null;
    }

    const children = await policyRepository.findChildren(databaseId);
    return {
      ...database,
      children,
    };
  }

  async createDatabase(input: CreatePolicyDatabaseInput, user: User): Promise<Doc> {
    this.assertAdmin(user);

    if (!input.title || input.title.trim() === '') {
      throw new Error('Policy database title is required');
    }

    const database = await policyRepository.create({
      title: input.title.trim(),
      content: [],
      searchText: '',
      projectId: null,
      parentId: null,
      isDatabase: true,
      isPolicy: true,
      schema: input.schema ?? { columns: [] },
      properties: {},
      createdBy: user.id,
    });

    await activityService.record({
      actorId: user.id,
      action: 'policy.database.created',
      entityType: 'doc',
      entityId: database.id,
      entityName: database.title,
      metadata: {
        isPolicy: true,
      },
    });

    return database;
  }

  async updateDatabase(databaseId: string, input: UpdatePolicyDatabaseInput, user: User): Promise<Doc | null> {
    this.assertAdmin(user);

    const database = await policyRepository.findDatabaseById(databaseId);
    if (!database) {
      return null;
    }

    const updateData: Partial<NewDoc> = {};

    if (input.title !== undefined) {
      if (input.title.trim() === '') {
        throw new Error('Policy database title cannot be empty');
      }
      updateData.title = input.title.trim();
    }

    if (input.schema !== undefined) {
      updateData.schema = input.schema;
    }

    const updated = await policyRepository.update(databaseId, updateData);
    if (updated) {
      await activityService.record({
        actorId: user.id,
        action: 'policy.database.updated',
        entityType: 'doc',
        entityId: updated.id,
        entityName: updated.title,
        metadata: {
          changedFields: Object.keys(updateData),
          isPolicy: true,
        },
      });
    }

    return updated;
  }

  async deleteDatabase(databaseId: string, user: User): Promise<boolean> {
    this.assertAdmin(user);

    const database = await policyRepository.findDatabaseById(databaseId);
    if (!database) {
      return false;
    }

    await policyRepository.deleteByParentId(databaseId);
    const deleted = await policyRepository.delete(databaseId);

    if (deleted) {
      await activityService.record({
        actorId: user.id,
        action: 'policy.database.deleted',
        entityType: 'doc',
        entityId: database.id,
        entityName: database.title,
        metadata: {
          isPolicy: true,
        },
      });
    }

    return deleted;
  }

  async createRow(databaseId: string, input: CreatePolicyRowInput, user: User): Promise<Doc> {
    this.assertAdmin(user);

    const database = await policyRepository.findDatabaseById(databaseId);
    if (!database) {
      throw new Error('Policy database not found');
    }

    if (!input.title || input.title.trim() === '') {
      throw new Error('Policy title is required');
    }

    const content = input.content ?? [];

    const row = await policyRepository.create({
      title: input.title.trim(),
      content,
      searchText: extractSearchTextFromDocContent(content),
      projectId: null,
      parentId: databaseId,
      isDatabase: false,
      isPolicy: true,
      schema: null,
      properties: input.properties ?? {},
      createdBy: user.id,
    });

    await activityService.record({
      actorId: user.id,
      action: 'policy.row.created',
      entityType: 'doc',
      entityId: row.id,
      entityName: row.title,
      metadata: {
        isPolicy: true,
        databaseId,
      },
    });

    return row;
  }

  async getRow(databaseId: string, rowId: string): Promise<(Doc & { parent?: Doc | null }) | null> {
    const row = await policyRepository.findRowByIdWithParent(rowId);
    if (!row) {
      return null;
    }

    if (row.parentId !== databaseId || !row.parent || !row.parent.isPolicy || !row.parent.isDatabase) {
      return null;
    }

    return row;
  }

  async updateRow(
    databaseId: string,
    rowId: string,
    input: UpdatePolicyRowInput,
    user: User
  ): Promise<Doc | null> {
    this.assertAdmin(user);

    const row = await this.getRow(databaseId, rowId);
    if (!row) {
      return null;
    }

    const updateData: Partial<NewDoc> = {};

    if (input.title !== undefined) {
      if (input.title.trim() === '') {
        throw new Error('Policy title cannot be empty');
      }
      updateData.title = input.title.trim();
    }

    if (input.content !== undefined) {
      updateData.content = input.content;
      updateData.searchText = extractSearchTextFromDocContent(input.content);
    }

    if (input.properties !== undefined) {
      updateData.properties = input.properties;
    }

    const updated = await policyRepository.update(rowId, updateData);
    if (updated) {
      await activityService.record({
        actorId: user.id,
        action: 'policy.row.updated',
        entityType: 'doc',
        entityId: updated.id,
        entityName: updated.title,
        metadata: {
          changedFields: Object.keys(updateData),
          isPolicy: true,
          databaseId,
        },
      });
    }

    return updated;
  }

  async deleteRow(databaseId: string, rowId: string, user: User): Promise<boolean> {
    this.assertAdmin(user);

    const row = await this.getRow(databaseId, rowId);
    if (!row) {
      return false;
    }

    const deleted = await policyRepository.delete(rowId);
    if (deleted) {
      await activityService.record({
        actorId: user.id,
        action: 'policy.row.deleted',
        entityType: 'doc',
        entityId: row.id,
        entityName: row.title,
        metadata: {
          isPolicy: true,
          databaseId,
        },
      });
    }

    return deleted;
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Admin access required');
    }
  }
}

export const policyService = new PolicyService();
