import type { ReactNode } from 'react';
import clsx from 'clsx';

export type StatCardProps = {
  label: string;
  /** Já formatado por quem chama (moeda/contagem via `@/utils/format`). */
  value: string;
  hint?: string;
  icon?: ReactNode;
  /** Variante "você recebeu" — cor de confiança no valor em vez da cor de texto padrão. */
  highlight?: boolean;
  /**
   * Visual dos cartões do painel do vendedor no frame ajustado do Figma (T15):
   * rótulo em caixa alta e negrito, valor em negrito. Só muda a aparência.
   */
  emphasized?: boolean;
};

/**
 * Cartão de indicador do painel do vendedor (RN-51.1): rótulo, valor em
 * destaque, nota opcional e ícone opcional. Só apresentação — não formata
 * `value`/`hint`, quem chama já entrega prontos (ver `.ai/coding-rules.md`).
 *
 * Sem largura fixa: quem decide o grid (3 lado a lado no desktop, empilhado
 * no mobile) é a página que usa o componente, não o card.
 *
 * Sem `onClick`/foco/hover: o contrato de props não tem handler de interação,
 * então é um componente estático, mesma decisão de `VerifiedBadge`/`SoldBadge`
 * — `.ai/interaction-states.md` só vale para elementos interativos.
 *
 * Usage:
 *   import StatCard from '@/components/seller/StatCard';
 *   <StatCard label="Peças ativas" value="12" hint="nos últimos 30 dias" />
 *   <StatCard label="Você recebeu" value="R$ 340,00" highlight />
 */
function StatCard({
  label,
  value,
  hint,
  icon,
  highlight = false,
  emphasized = false,
}: StatCardProps) {
  return (
    // `emphasized` usa as medidas do frame ajustado do Figma (T15): padding 13,6px no celular e
    // 20px a partir de `tablet`, rótulo 11,5px, valor 25,6px e dica 12px.
    <div
      className={clsx(
        'flex w-full flex-col gap-1 border border-linha bg-branco-quente',
        emphasized ? 'p-[0.85rem] tablet:p-5' : 'p-4',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'text-texto-auxiliar',
            emphasized
              ? 'text-label font-bold uppercase leading-[1.5] tracking-[0.08em]'
              : 'text-label',
          )}
        >
          {label}
        </span>
        {icon}
      </div>

      <p
        className={clsx(
          'font-display',
          emphasized ? 'text-h3 font-bold leading-[1.5]' : 'text-h3',
          highlight ? 'text-verde-rs' : 'text-tinta',
        )}
      >
        {value}
      </p>

      {hint && (
        <p
          className={clsx(
            emphasized ? 'text-xs leading-[1.5]' : 'text-body-sm',
            emphasized && highlight ? 'text-verde-rs' : 'text-texto-auxiliar',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export default StatCard;
