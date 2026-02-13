import { searchRepository } from '../repositories';
import type {
  SearchDocRecord,
  SearchProjectResult,
  SearchTaskRecord,
} from '../repositories/search';
import type { User } from '../types';

export interface SearchDocResult {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  isPersonal: boolean;
  snippet: string | null;
  updatedAt: Date;
}

export interface SearchTaskResult {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  snippet: string | null;
  updatedAt: Date;
}

export interface GlobalSearchResult {
  projects: SearchProjectResult[];
  docs: SearchDocResult[];
  tasks: SearchTaskResult[];
}

const SNIPPET_SIDE_LENGTH = 80;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildSnippet(text: string | null | undefined, query: string): string | null {
  if (!text) return null;

  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;

  const normalizedQuery = query.toLowerCase();
  const lowerText = normalizedText.toLowerCase();
  const index = lowerText.indexOf(normalizedQuery);

  if (index === -1) {
    return normalizedText.slice(0, 2 * SNIPPET_SIDE_LENGTH);
  }

  const start = Math.max(0, index - SNIPPET_SIDE_LENGTH);
  const end = Math.min(normalizedText.length, index + query.length + SNIPPET_SIDE_LENGTH);
  const prefix = start > 0 ? '... ' : '';
  const suffix = end < normalizedText.length ? ' ...' : '';
  return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

function withDocSnippets(records: SearchDocRecord[], query: string): SearchDocResult[] {
  return records.map((doc) => ({
    id: doc.id,
    title: doc.title,
    projectId: doc.projectId,
    projectName: doc.projectName,
    isPersonal: doc.isPersonal,
    snippet: buildSnippet(doc.searchText, query),
    updatedAt: doc.updatedAt,
  }));
}

function withTaskSnippets(records: SearchTaskRecord[], query: string): SearchTaskResult[] {
  return records.map((task) => ({
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    projectName: task.projectName,
    snippet: buildSnippet(task.descriptionMd, query),
    updatedAt: task.updatedAt,
  }));
}

export class SearchService {
  async search(user: User, query: string, limit = 6): Promise<GlobalSearchResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        projects: [],
        docs: [],
        tasks: [],
      };
    }

    const normalizedLimit = Math.min(Math.max(limit, 1), 20);

    const [projects, docs, tasks] = await Promise.all([
      searchRepository.searchProjects(user.id, user.role, trimmedQuery, normalizedLimit),
      searchRepository.searchDocs(user.id, user.role, trimmedQuery, normalizedLimit),
      searchRepository.searchTasks(user.id, user.role, trimmedQuery, normalizedLimit),
    ]);

    return {
      projects,
      docs: withDocSnippets(docs, trimmedQuery),
      tasks: withTaskSnippets(tasks, trimmedQuery),
    };
  }
}

export const searchService = new SearchService();
