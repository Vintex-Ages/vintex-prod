import clsx from 'clsx';

/**
 * Campo de texto com label, helper e estado de erro — só apresentação.
 * Sem validação: quem chama passa `error` quando o valor for inválido.
 *
 * Usage:
 *   import InputField from '@/components/common/InputField';
 *   <InputField id="email" label="E-mail" type="email" value={email}
 *     onChange={setEmail} error={erroEmail} />
 */
export type InputFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email' | 'password' | 'tel';
  placeholder?: string;
  helperText?: string;
  /** Quando presente, pinta a borda e ocupa o lugar de `helperText`. */
  error?: string;
  disabled?: boolean;
  id: string;
};

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  helperText,
  error,
  disabled = false,
  id,
}: InputFieldProps) {
  const hasError = Boolean(error);
  const message = error ?? helperText;
  const messageId = `${id}-message`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label font-bold text-tinta">
        {label}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={message ? messageId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(
          'border bg-branco-quente px-4 py-3 text-body text-tinta',
          'placeholder:text-texto-auxiliar focus:outline-none focus:ring-1',
          hasError
            ? 'border-vermelho-escuro focus:border-vermelho-escuro focus:ring-vermelho-escuro'
            : 'border-linha focus:border-tinta focus:ring-tinta',
          disabled && 'cursor-not-allowed bg-papel-profundo text-texto-auxiliar',
        )}
      />

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

export default InputField;
