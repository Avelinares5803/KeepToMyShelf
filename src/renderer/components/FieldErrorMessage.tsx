/**
 * The attributes that mark a control as not valid and link it to its message (`message` is
 * undefined when the control has no error).
 */
export function invalidProps(errorId: string, message: string | undefined) {
  return message === undefined
    ? {}
    : { 'aria-invalid': true as const, 'aria-describedby': errorId };
}

/** The error message under a field, which its control points at with `aria-describedby`. */
export function FieldErrorMessage({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} className="field__error">
      {message}
    </p>
  );
}
