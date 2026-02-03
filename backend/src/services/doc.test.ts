import { describe, it, expect } from 'bun:test';
import { docService } from './doc';

describe('DocService', () => {
  it('should be defined', () => {
    expect(docService).toBeDefined();
  });

  it('should have required methods', () => {
    expect(typeof docService.getProjectDocs).toBe('function');
    expect(typeof docService.getPersonalDocs).toBe('function');
    expect(typeof docService.getDoc).toBe('function');
    expect(typeof docService.getDocWithChildren).toBe('function');
    expect(typeof docService.createDoc).toBe('function');
    expect(typeof docService.updateDoc).toBe('function');
    expect(typeof docService.deleteDoc).toBe('function');
  });

  // Integration tests require database setup
  // These tests verify the service interface is correct
});
