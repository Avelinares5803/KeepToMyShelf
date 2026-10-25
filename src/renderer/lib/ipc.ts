import type { TFunction } from 'i18next';
import { AppError } from '../../core/errors';
import type { IpcResult } from '../../shared/ipc';

/** An error reported by the main process, with its translatable code. */
export class IpcError extends Error {
  override readonly name = 'IpcError';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Returns the value of a successful IPC call or throws its error. */
export function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new IpcError(result.error.code, result.error.message);
  }
  return result.value;
}

/**
 * User-facing message for any error. Codes reported by the main process (IpcError) and
 * rules checked in the UI before sending (AppError from core) are translated; anything
 * else is unexpected: it is logged and shown as a generic message.
 */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof IpcError || error instanceof AppError) {
    return t(`errors.${error.code}`, { defaultValue: t('errors.unknown') });
  }
  console.error(error);
  return t('errors.unknown');
}
