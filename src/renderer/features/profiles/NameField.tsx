import { useId } from 'react';

interface NameFieldProps {
  label: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}

export function NameField({ label, value, error, onChange }: NameFieldProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="text"
        value={value}
        autoFocus
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
