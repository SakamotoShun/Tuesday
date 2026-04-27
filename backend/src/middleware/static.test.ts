import { describe, expect, it } from 'bun:test';
import { isPathWithinDirectory } from './static';

describe('isPathWithinDirectory', () => {
  it('accepts files inside the static directory', () => {
    expect(isPathWithinDirectory('/app/static', '/app/static/assets/main.js')).toBe(true);
  });

  it('rejects sibling paths that only share a prefix', () => {
    expect(isPathWithinDirectory('/app/static', '/app/staticEvil/file.js')).toBe(false);
  });

  it('rejects resolved traversal paths that escape the static directory', () => {
    expect(isPathWithinDirectory('/app/static', '/app/static/../staticEvil/file.js')).toBe(false);
  });
});
