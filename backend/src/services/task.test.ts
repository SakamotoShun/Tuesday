import { describe, it, expect } from 'bun:test';
import { taskService } from './task';

describe('TaskService', () => {
  it('should be defined', () => {
    expect(taskService).toBeDefined();
  });

  it('should have required methods', () => {
    expect(typeof taskService.getProjectTasks).toBe('function');
    expect(typeof taskService.getTask).toBe('function');
    expect(typeof taskService.getMyTasks).toBe('function');
    expect(typeof taskService.createTask).toBe('function');
    expect(typeof taskService.updateTask).toBe('function');
    expect(typeof taskService.updateTaskStatus).toBe('function');
    expect(typeof taskService.updateTaskOrder).toBe('function');
    expect(typeof taskService.updateTaskAssignees).toBe('function');
    expect(typeof taskService.deleteTask).toBe('function');
  });

  // Integration tests require database setup
  // These tests verify the service interface is correct
});
