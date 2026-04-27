import { describe, expect, it } from 'bun:test';
import { areMigrationsApplied } from './runtime';

describe('areMigrationsApplied', () => {
  it('returns true when every bundled migration exists in the database', () => {
    expect(areMigrationsApplied(['0001.sql', '0002.sql'], ['0001.sql', '0002.sql', '0003.sql'])).toBe(true);
  });

  it('returns false when any bundled migration is still missing', () => {
    expect(areMigrationsApplied(['0001.sql', '0002.sql'], ['0001.sql'])).toBe(false);
  });
});
