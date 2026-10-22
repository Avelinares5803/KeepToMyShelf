import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NotFoundError } from '../../core/errors';
import { createHandler } from './create-handler';

describe('createHandler', () => {
  const schema = z.object({ name: z.string() });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the value when the input is valid', () => {
    const handler = createHandler(schema, ({ name }) => `Hola, ${name}`);

    expect(handler({ name: 'Ana' })).toEqual({ ok: true, value: 'Hola, Ana' });
  });

  it('rejects invalid input without running the operation', () => {
    const run = vi.fn();
    const handler = createHandler(schema, run);

    const result = handler({ name: 42 });

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc.invalid_input' } });
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps the code of expected application errors', () => {
    const handler = createHandler(schema, () => {
      throw new NotFoundError('profile.not_found', 'Profile x does not exist');
    });

    expect(handler({ name: 'Ana' })).toEqual({
      ok: false,
      error: { code: 'profile.not_found', message: 'Profile x does not exist' },
    });
  });

  it('logs unexpected errors and hides their details from the renderer', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('C:\\secret\\path is locked');
    const handler = createHandler(schema, () => {
      throw failure;
    });

    expect(handler({ name: 'Ana' })).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Unexpected error' },
    });
    expect(log).toHaveBeenCalledWith('Unexpected error in IPC handler', failure);
  });
});
