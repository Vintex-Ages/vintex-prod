import clsx from 'clsx';
import { DEFAULT_COMMISSION_RATE, netValue } from '@/utils/commission';
import { formatCentsToBRL } from '@/utils/format';

export type PriceBreakdownProps = {
  /** Preço em reais; `null` enquanto o vendedor ainda não informou. */
  price: number | null;
  commissionRate?: number;
  /** `inline`: uma linha, para o formulário. `card`: três linhas, para a revisão. */
  variant?: 'inline' | 'card';
};

const PLACEHOLDER = '—';

/**
 * Decomposição do preço de uma peça (RN-11): preço, comissão da plataforma e
 * quanto o vendedor recebe, com o líquido em destaque. Só apresentação — o
 * cálculo vem de `netValue` (`@/utils/commission`), a formatação de
 * `formatCentsToBRL`.
 *
 * Sem `onClick`/foco/hover: componente estático, mesma decisão de `StatCard`
 * — `.ai/interaction-states.md` só vale para elementos interativos.
 *
 * Usage:
 *   import PriceBreakdown from '@/components/seller/PriceBreakdown';
 *   <PriceBreakdown price={100} />                 // formulário
 *   <PriceBreakdown price={100} variant="card" />  // revisão
 *   <PriceBreakdown price={null} />                // sem preço: "—"
 */
function PriceBreakdown({
  price,
  commissionRate = DEFAULT_COMMISSION_RATE,
  variant = 'inline',
}: PriceBreakdownProps) {
  const hasPrice = price !== null && Number.isFinite(price);
  const priceCents = hasPrice ? Math.round(price * 100) : 0;
  const netCents = hasPrice ? Math.round(netValue(price, commissionRate) * 100) : 0;

  const format = (cents: number) => (hasPrice ? formatCentsToBRL(cents) : PLACEHOLDER);
  const ratePercent = (commissionRate * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  const rows = [
    { label: 'Preço', value: format(priceCents), highlight: false },
    {
      label: `Comissão da plataforma (${ratePercent}%)`,
      value: format(priceCents - netCents),
      highlight: false,
    },
    { label: 'Você recebe', value: format(netCents), highlight: true },
  ];

  const isCard = variant === 'card';

  return (
    <dl
      className={clsx(
        isCard
          ? 'flex w-full flex-col gap-2 bg-papel-profundo p-4'
          : 'flex flex-wrap items-baseline gap-x-4 gap-y-1',
      )}
    >
      {rows.map(({ label, value, highlight }) => (
        <div
          key={label}
          className={clsx(
            'flex items-baseline gap-2',
            isCard && 'justify-between',
            isCard && highlight && 'border-t border-linha pt-2',
          )}
        >
          <dt className="text-body-sm text-texto-auxiliar">{label}</dt>
          <dd
            className={clsx(
              highlight ? 'font-semibold text-verde-rs' : 'text-tinta',
              isCard && highlight ? 'text-h4' : 'text-body-sm',
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default PriceBreakdown;
