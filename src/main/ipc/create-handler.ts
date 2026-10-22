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
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'ipc.invalid_input', message: z.prettifyError(parsed.error) },
      };
    }
    try {
      return { ok: true, value: run(parsed.data) };
    } catch (error) {
      if (error instanceof AppError) {
        return { ok: false, error: { code: error.code, message: error.message } };
      }
      console.error('Unexpected error in IPC handler', error);
      return { ok: false, error: { code: 'internal', message: 'Unexpected error' } };
    }
  };
}
