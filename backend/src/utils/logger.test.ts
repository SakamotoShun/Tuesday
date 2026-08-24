import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { log } from './logger';

afterEach(() => {
  mock.restore();
});

describe('log', () => {
  it('serializes nested error causes', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const rootCause = new TypeError('invalid block content');
    const error = new Error('canonical recovery failed', { cause: rootCause });

    log('warn', 'doc_collab.recovery_quarantined', { error });

    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload.error).toMatchObject({
      name: 'Error',
      message: 'canonical recovery failed',
      cause: {
        name: 'TypeError',
        message: 'invalid block content',
      },
    });
  });
});
