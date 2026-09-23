import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import clsx from 'clsx';
import { formatCentsToBRL } from '@/utils/format';

/**
 * Campo de preço com label, helper e estado de erro — só apresentação.
 * Mesma anatomia visual do InputField, mas o valor trafega em centavos
 * (`number | null`) e é sempre exibido já mascarado como moeda BR.
 *
 * Usage:
 *   import PriceInput from '@/components/common/PriceInput';
 *   <PriceInput id="preco" label="Preço" value={precoCentavos}
 *     onChange={setPrecoCentavos} error={erroPreco} />
 */
export type PriceInputProps = {
  id: string;
  label: string;
  value: number | null;
  onChange: (cents: number | null) => void;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  labelAdornment?: ReactNode;
};

function PriceInput({
  id,
  label,
  value,
  onChange,
  helperText,
  error,
  disabled = false,
  labelAdornment,
}: PriceInputProps) {
  const [internalValue, setInternalValue] = useState<number | null>(value);
  const prevValueRef = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setInternalValue(value);
    }
    prevValueRef.current = value;
  }, [value]);

  const displayValue = internalValue === null ? '' : formatCentsToBRL(internalValue);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      const len = displayValue.length;
      el.setSelectionRange(len, len);
    }
  }, [displayValue]);

  const hasError = Boolean(error);
  const message = error ?? helperText;
  const messageId = `${id}-message`;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digitsOnly = event.target.value.replace(/\D/g, '');

    if (digitsOnly === '') {
      if (internalValue === null) {
        return;
      }
      setInternalValue(null);
      onChange(null);
      return;
    }

    const numeric = Number(digitsOnly);
    setInternalValue(numeric);
    onChange(numeric);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex items-center gap-2 text-label font-bold text-tinta">
        {label}
        {labelAdornment}
      </label>

      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        value={displayValue}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={message ? messageId : undefined}
        onChange={handleChange}
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

export default PriceInput;
