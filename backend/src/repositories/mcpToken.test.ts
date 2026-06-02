import { describe, it, expect, beforeAll } from 'bun:test';
import { mcpTokenRepository } from './mcpToken';

describe('McpTokenRepository', () => {
  it('is defined', () => {
    expect(mcpTokenRepository).toBeDefined();
  });

  it('has create method', () => {
    expect(typeof mcpTokenRepository.create).toBe('function');
  });

  it('has findByHash method', () => {
    expect(typeof mcpTokenRepository.findByHash).toBe('function');
  });

  it('has findByUserId method', () => {
    expect(typeof mcpTokenRepository.findByUserId).toBe('function');
  });

  it('has markUsed method', () => {
    expect(typeof mcpTokenRepository.markUsed).toBe('function');
  });

  it('has revoke method', () => {
    expect(typeof mcpTokenRepository.revoke).toBe('function');
  });
});