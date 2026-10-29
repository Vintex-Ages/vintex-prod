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
function StatCard({ label, value, hint, icon, highlight = false }: StatCardProps) {
  return (
    <div className="flex w-full flex-col gap-1 border border-linha bg-branco-quente p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-texto-auxiliar">{label}</span>
        {icon}
      </div>

      <p className={clsx('font-display text-h3', highlight ? 'text-verde-rs' : 'text-tinta')}>
        {value}
      </p>

      {hint && <p className="text-body-sm text-texto-auxiliar">{hint}</p>}
    </div>
  );
}

export default StatCard;
