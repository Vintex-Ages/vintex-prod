import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Botão base do Vintex — apresentação e comportamento genérico (clique).
 * Sem regra de negócio: quem chama decide o que `onClick` faz.
 *
 * Usage:
 *   import Button from '@/components/common/Button';
 *   <Button variant="primary" onClick={comprar}>Comprar</Button>
 */
export type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'success';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  fullWidth?: boolean;
};

function Button({
  children,
  variant = 'primary',
  onClick,
  type = 'button',
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center px-6 text-body font-semibold focus:outline-none focus:ring-1',
        fullWidth && 'w-full',
        variant === 'primary' &&
          'border border-vermelho-escuro bg-vermelho-escuro text-branco-quente focus:ring-vermelho-escuro',
        variant === 'secondary' &&
          'border-2 border-linha bg-transparent text-tinta focus:ring-tinta',
        variant === 'quiet' &&
          'border border-transparent bg-transparent text-tinta focus:ring-tinta',
        variant === 'success' &&
          'border border-verde-rs bg-verde-rs text-branco-quente focus:ring-verde-rs',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}

export default Button;
