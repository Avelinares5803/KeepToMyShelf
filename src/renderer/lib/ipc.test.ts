import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../core/errors';
import { errorMessage, IpcError, unwrap } from './ipc';

// Fake translator: returns the key, so the tests can see which text was requested.
const t = ((key: string) => `t(${key})`) as unknown as TFunction;

describe('unwrap', () => {
  it('returns the value of a successful result', () => {
    expect(unwrap({ ok: true, value: 42 })).toBe(42);
  });

  it('throws an IpcError carrying the code of a failed result', () => {
    expect(() => unwrap({ ok: false, error: { code: 'item.not_found', message: 'x' } })).toThrow(
      IpcError,
    );
  });
});

describe('errorMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('translates errors reported by the main process', () => {
    expect(errorMessage(t, new IpcError('profile.in_use', 'x'))).toBe('t(errors.profile.in_use)');
  });

  it('translates validation errors detected in the UI before sending', () => {
    expect(errorMessage(t, new ValidationError('date.end_before_start', 'x'))).toBe(
      't(errors.date.end_before_start)',
    );
  });

  it('logs anything else and shows the generic message', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('boom');

    expect(errorMessage(t, failure)).toBe('t(errors.unknown)');
    expect(log).toHaveBeenCalledWith(failure);
  });
});
