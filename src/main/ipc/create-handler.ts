import { z } from 'zod';
import { AppError } from '../../core/errors';
import type { IpcResult } from '../../shared/ipc';

/**
 * Wraps a main-process operation as an IPC handler: validates the renderer's input and
 * turns the outcome into an IpcResult. Expected errors keep their code; unexpected ones
 * are logged in full here and reach the renderer only as "internal".
 */
export function createHandler<S extends z.ZodType, R>(
  schema: S,
  run: (input: z.infer<S>) => R,
): (input: unknown) => IpcResult<R> {
  return (input) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    try {
      return { ok: true, value: run(parsed.data) };
    } catch (error) {
      return failure(error);
    }
  };
}

/** The same for operations that take time (e.g. a file dialog or image processing). */
export function createAsyncHandler<S extends z.ZodType, R>(
  schema: S,
  run: (input: z.infer<S>) => Promise<R>,
): (input: unknown) => Promise<IpcResult<R>> {
  return async (input) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    try {
      return { ok: true, value: await run(parsed.data) };
    } catch (error) {
      return failure(error);
    }
  };
}

function invalidInput(error: z.ZodError): IpcResult<never> {
  return { ok: false, error: { code: 'ipc.invalid_input', message: z.prettifyError(error) } };
}

function failure(error: unknown): IpcResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  console.error('Unexpected error in IPC handler', error);
  return { ok: false, error: { code: 'internal', message: 'Unexpected error' } };
}
