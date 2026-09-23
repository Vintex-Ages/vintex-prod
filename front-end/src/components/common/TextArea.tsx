import type { ReactNode } from 'react';
import clsx from 'clsx';

export type TextAreaProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  labelAdornment?: ReactNode;
};

/** Campo de texto multilinha controlado, com ajuda, erro e contador opcionais. */
function TextArea({
  id,
  label,
  value,
  onChange,
  rows = 4,
  maxLength,
  placeholder,
  helperText,
  error,
  disabled = false,
  labelAdornment,
}: TextAreaProps): JSX.Element {
  const hasError = Boolean(error);
  const message = error ?? helperText;
  const messageId = `${id}-message`;
  const counterId = `${id}-counter`;
  const describedBy =
    [message ? messageId : null, maxLength !== undefined ? counterId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-label font-bold text-tinta">
          {label}
        </label>
        {labelAdornment != null ? <span>{labelAdornment}</span> : null}
      </div>

      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(
          'w-full resize-y border bg-branco-quente px-4 py-3 text-body text-tinta',
          'placeholder:text-texto-auxiliar focus:outline-none focus:ring-1',
          hasError
            ? 'border-vermelho-escuro focus:border-vermelho-escuro focus:ring-vermelho-escuro'
            : 'border-linha focus:border-tinta focus:ring-tinta',
          disabled && 'cursor-not-allowed bg-papel-profundo text-texto-auxiliar',
        )}
      />

      {message || maxLength !== undefined ? (
        <div className="flex items-start justify-between gap-2">
          {message ? (
            <p
              id={messageId}
              role={hasError ? 'alert' : undefined}
              className={clsx(
                'text-label',
                hasError ? 'text-vermelho-escuro' : 'text-texto-auxiliar',
              )}
            >
              {message}
            </p>
          ) : null}
          {maxLength !== undefined ? (
            <p id={counterId} className="ml-auto text-label text-texto-auxiliar">
              {value.length}/{maxLength}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default TextArea;
