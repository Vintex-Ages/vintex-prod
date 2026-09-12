import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Checkbox reutilizável — apenas apresentação e comportamento genérico
 * (toggle, disabled). Nenhuma regra de negócio: quem chama decide o que
 * `checked`/`onChange` significam no fluxo da tela.
 *
 * `label` aceita `ReactNode` (não só `string`) para rótulos com links
 * embutidos (ex.: "Li e aceito os Termos de Uso e a Política de
 * Privacidade") sem o componente precisar conhecer o conteúdo.
 *
 * ATENÇÃO: como o rótulo fica dentro de um `<label htmlFor={id}>`, clicar em
 * qualquer elemento interativo embutido (ex. `<a>`) também ativa o input
 * associado (comportamento nativo do `<label>`, não é bug do componente) —
 * a ativação só é suprimida quando o clique chega ao `<label>` com
 * `defaultPrevented` (spec do HTML). `stopPropagation()` sozinho NÃO
 * resolve; é preciso `preventDefault()` no próprio link/elemento embutido.
 *
 * Usage:
 *   import Checkbox from '@/components/common/Checkbox';
 *   <Checkbox id="terms" checked={accepted} onChange={setAccepted} label="Aceito os termos" />
 *
 *   <Checkbox id="terms" checked={accepted} onChange={setAccepted} label={
 *     <>Li e aceito os <a href="/termos" onClick={(e) => e.preventDefault()}>Termos de Uso</a></>
 *   } />
 */
export type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id: string;
};

function Checkbox({ checked, onChange, label, disabled = false, id }: CheckboxProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-4 w-4 cursor-pointer appearance-none border border-linha bg-branco-quente transition-colors checked:border-verde-rs checked:bg-verde-rs disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-rs"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute inset-0 h-4 w-4 text-branco-quente opacity-0 peer-checked:opacity-100"
        >
          <path
            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label ? (
        <label
          htmlFor={id}
          className={clsx(
            'text-body text-tinta',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          )}
        >
          {label}
        </label>
      ) : null}
    </div>
  );
}

export default Checkbox;
