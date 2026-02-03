import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { admin } from './admin';

describe('Admin Routes', () => {
  let app: Hono;

  it('should have routes module', () => {
    app = new Hono();
    app.route('/api/v1/admin', admin);
    expect(app).toBeDefined();
  });

  // Full integration tests require admin authentication setup
});
