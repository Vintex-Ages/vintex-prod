import type { ReactNode } from 'react';
import clsx from 'clsx';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  labelAdornment?: ReactNode;
};

/** Seleção nativa controlada, com opção vazia, ajuda e erro opcionais. */
function Select({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  helperText,
  error,
  disabled = false,
  labelAdornment,
}: SelectProps): JSX.Element {
  const hasError = Boolean(error);
  const message = error ?? helperText;
  const messageId = `${id}-message`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-label font-bold text-tinta">
          {label}
        </label>
        {labelAdornment != null ? <span>{labelAdornment}</span> : null}
      </div>

      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={message ? messageId : undefined}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        className={clsx(
          'w-full rounded-none border bg-branco-quente px-4 py-3 text-body text-tinta',
          'focus:outline-none focus:ring-1',
          hasError
            ? 'border-vermelho-escuro focus:border-vermelho-escuro focus:ring-vermelho-escuro'
            : 'border-linha focus:border-tinta focus:ring-tinta',
          disabled && 'cursor-not-allowed bg-papel-profundo text-texto-auxiliar',
        )}
      >
        <option value="">{placeholder ?? ''}</option>
        {options.map((option, index) => (
          <option key={`${option.value}-${index}`} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>

      {message ? (
        <p
          id={messageId}
          role={hasError ? 'alert' : undefined}
          className={clsx('text-label', hasError ? 'text-vermelho-escuro' : 'text-texto-auxiliar')}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export default Select;
