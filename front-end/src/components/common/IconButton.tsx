import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Botão só de ícone — apresentação e comportamento genérico (clique).
 * `ariaLabel` é obrigatório porque não há texto visível. Sem regra de negócio.
 *
 * Usage:
 *   import IconButton from '@/components/common/IconButton';
 *   <IconButton icon={<Icon />} ariaLabel="Voltar" onClick={voltar} />
 */
export type IconButtonProps = {
  icon: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  variant?: 'default' | 'primary';
  disabled?: boolean;
};

function IconButton({
  icon,
  onClick,
  ariaLabel,
  variant = 'default',
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={clsx(
        'flex min-h-11 min-w-11 items-center justify-center focus:outline-none focus:ring-1',
        variant === 'primary'
          ? 'border border-vermelho-escuro bg-vermelho-escuro text-branco-quente focus:ring-vermelho-escuro'
          : 'border-2 border-linha bg-branco-quente text-tinta focus:ring-tinta',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {icon}
    </button>
  );
}

export default IconButton;
