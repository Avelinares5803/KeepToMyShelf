import { ValidationError } from './errors';

/** A validation error tied to the field that caused it, e.g. `{ field: 'title', code: ... }`. */
export interface FieldError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/**
 * Gathers the validation errors of several fields instead of stopping at the first one.
 * Only `ValidationError`s are collected; any other error is a bug and is thrown on.
 */
export class FieldErrorCollector {
  readonly #errors: FieldError[] = [];

  get errors(): readonly FieldError[] {
    return this.#errors;
  }

  /** Records an error for `field`, unless that field already has one. */
  add(field: string, code: string, message: string): void {
    if (!this.has(field)) this.#errors.push({ field, code, message });
  }

  has(field: string): boolean {
    return this.#errors.some((error) => error.field === field);
  }

  /**
   * Runs a check. Returns its result, or `undefined` if it threw a `ValidationError`, which is
   * recorded for `field` (or for the field `field` picks from the error code).
   */
  check<T>(field: string | ((code: string) => string), run: () => T): T | undefined {
    try {
      return run();
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      this.add(typeof field === 'string' ? field : field(error.code), error.code, error.message);
      return undefined;
    }
  }
}
