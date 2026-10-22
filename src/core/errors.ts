/**
 * Base class for expected application errors.
 *
 * `code` is a stable identifier (e.g. "date.end_before_start") that the UI translates
 * into a localized message; `message` is a developer-facing description.
 */
export class AppError extends Error {
  override readonly name: string = 'AppError';

  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** A business rule was violated by user-provided data. */
export class ValidationError extends AppError {
  override readonly name = 'ValidationError';
}

/** The requested record does not exist (or no longer exists). */
export class NotFoundError extends AppError {
  override readonly name = 'NotFoundError';
}

/** The operation is not allowed in the current state (e.g. deleting the open profile). */
export class ConflictError extends AppError {
  override readonly name = 'ConflictError';
}
