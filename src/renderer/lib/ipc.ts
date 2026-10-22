import type { TFunction } from 'i18next';
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

/** User-facing message for any error: known codes are translated, the rest are generic. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof IpcError) {
    return t(`errors.${error.code}`, { defaultValue: t('errors.unknown') });
  }
  console.error(error);
  return t('errors.unknown');
}
