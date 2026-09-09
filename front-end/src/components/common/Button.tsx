import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Botão base do Vintex — apresentação e comportamento genérico (clique).
 * Sem regra de negócio: quem chama decide o que `onClick` faz.
 * Aceita os demais atributos nativos de `<button>` (aria-*, data-*, id, form, onFocus etc.).
 *
 * Usage:
 *   import Button from '@/components/common/Button';
 *   <Button variant="primary" onClick={comprar}>Comprar</Button>
 */
export type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'success' | 'outline';
  fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center px-6 text-body font-semibold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        fullWidth && 'w-full',
        variant === 'primary' &&
          'border border-vermelho-escuro bg-vermelho-escuro text-branco-quente hover:brightness-110 focus-visible:ring-branco-quente',
        variant === 'secondary' &&
          'border-2 border-linha bg-transparent text-tinta hover:bg-papel-profundo focus-visible:ring-tinta',
        variant === 'quiet' &&
          'border border-transparent bg-transparent text-tinta hover:bg-papel-profundo focus-visible:ring-tinta',
        variant === 'success' &&
          'border border-verde-rs bg-verde-rs text-branco-quente hover:brightness-110 focus-visible:ring-branco-quente',
        variant === 'outline' &&
          'border border-vermelho-escuro bg-transparent text-vermelho-escuro hover:bg-vermelho-suave focus-visible:ring-vermelho-escuro',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
