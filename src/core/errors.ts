/**
 * A business rule was violated by user-provided data.
 *
 * `code` is a stable identifier (e.g. "date.end_before_start") that the UI translates
 * into a localized message; `message` is a developer-facing description.
 */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
