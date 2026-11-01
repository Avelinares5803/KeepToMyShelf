import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NotFoundError } from '../../core/errors';
import { createAsyncHandler, createHandler } from './create-handler';

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

describe('createAsyncHandler', () => {
  const schema = z.object({ name: z.string() });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for the operation and returns its value', async () => {
    const handler = createAsyncHandler(schema, async ({ name }) => `Hola, ${name}`);

    await expect(handler({ name: 'Ana' })).resolves.toEqual({ ok: true, value: 'Hola, Ana' });
  });

  it('rejects invalid input without running the operation', async () => {
    const run = vi.fn();
    const handler = createAsyncHandler(schema, run);

    await expect(handler({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'ipc.invalid_input' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps the code of an expected error raised while waiting', async () => {
    const handler = createAsyncHandler(schema, async () => {
      await Promise.resolve();
      throw new NotFoundError('media.source_unreadable', 'Cannot read x');
    });

    await expect(handler({ name: 'Ana' })).resolves.toEqual({
      ok: false,
      error: { code: 'media.source_unreadable', message: 'Cannot read x' },
    });
  });

  it('logs unexpected errors and hides their details from the renderer', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('sharp crashed');
    const handler = createAsyncHandler(schema, () => Promise.reject(failure));

    await expect(handler({ name: 'Ana' })).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: 'Unexpected error' },
    });
    expect(log).toHaveBeenCalledWith('Unexpected error in IPC handler', failure);
  });
});
