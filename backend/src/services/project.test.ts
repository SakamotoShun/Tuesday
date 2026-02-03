import { describe, it, expect } from 'bun:test';
import { projectService } from './project';
import { UserRole } from '../db/schema';

describe('ProjectService', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.MEMBER,
    isDisabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdmin = {
    ...mockUser,
    role: UserRole.ADMIN,
  };

  it('should be defined', () => {
    expect(projectService).toBeDefined();
  });

  it('should have required methods', () => {
    expect(typeof projectService.getProjects).toBe('function');
    expect(typeof projectService.getProject).toBe('function');
    expect(typeof projectService.createProject).toBe('function');
    expect(typeof projectService.updateProject).toBe('function');
    expect(typeof projectService.deleteProject).toBe('function');
    expect(typeof projectService.getMembers).toBe('function');
    expect(typeof projectService.addMember).toBe('function');
    expect(typeof projectService.updateMemberRole).toBe('function');
    expect(typeof projectService.removeMember).toBe('function');
    expect(typeof projectService.hasAccess).toBe('function');
    expect(typeof projectService.isOwner).toBe('function');
  });

  // Integration tests require database setup
  // These tests verify the service interface is correct
});
