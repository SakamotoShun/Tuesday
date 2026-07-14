import { describe, expect, it, mock } from 'bun:test';

let projectQuery: Record<string, any> | undefined;

mock.module('../db/client', () => ({
  db: {
    query: {
      projects: {
        findFirst: async (query: Record<string, any>) => {
          projectQuery = query;
          return { id: 'project-1' };
        },
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: async () => [],
        }),
      }),
    }),
  },
}));

const { projectRepository } = await import('./project');

describe('ProjectRepository', () => {
  it('does not select password hashes for project owners', async () => {
    await projectRepository.findById('project-1');

    const ownerColumns = projectQuery?.with.owner.columns;
    expect(ownerColumns).toBeDefined();
    expect(ownerColumns).not.toHaveProperty('passwordHash');
  });
});
