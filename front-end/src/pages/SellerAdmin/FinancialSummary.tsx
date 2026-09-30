import ErrorState from '@/components/common/ErrorState';
import Select, { type SelectOption } from '@/components/common/Select';
import StatCard from '@/components/seller/StatCard';
import { useSalesSummary } from '@/hooks/useSalesSummary';
import type { SalesPeriod } from '@/services/sellerProductService';
import { DEFAULT_COMMISSION_RATE } from '@/utils/commission';
import { formatCentsToBRL } from '@/utils/format';

const PERIOD_OPTIONS: { value: SalesPeriod; label: string }[] = [
  { value: 'month', label: 'Mês atual' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'all', label: 'Tudo' },
];

const SELECT_OPTIONS: SelectOption[] = PERIOD_OPTIONS;

const COMMISSION_PERCENT = (DEFAULT_COMMISSION_RATE * 100).toLocaleString('pt-BR');

/** Reais (como vêm do service) → texto de moeda. */
function brl(reais: number): string {
  return formatCentsToBRL(Math.round(reais * 100));
}

function isPeriod(value: string | null): value is SalesPeriod {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

/**
 * Seção "Financeiro" do painel do vendedor (FE-US019-3, #222, RN-51.1):
 * seletor de período e três cards — vendido no período (bruto), comissão da
 * plataforma e quanto o vendedor recebeu (líquido, em destaque). Os números
 * vêm prontos de `useSalesSummary`; aqui só se formata e desenha.
 *
 * Estados: skeleton nos cards enquanto carrega (também ao trocar o período),
 * erro com "tentar de novo" e, sem vendas, R$ 0,00 com uma nota.
 *
 * Usage:
 *   import FinancialSummary from '@/pages/SellerAdmin/FinancialSummary';
 *   <FinancialSummary />
 */
function FinancialSummary() {
  const { state, period, setPeriod, retry } = useSalesSummary();

  return (
    <section aria-labelledby="financeiro-titulo" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
        <h2 id="financeiro-titulo" className="font-display text-h3 text-tinta">
          Financeiro
        </h2>
        <div className="tablet:w-56">
          <Select
            id="financeiro-periodo"
            label="Período"
            value={period}
            options={SELECT_OPTIONS}
            onChange={(value) => {
              if (isPeriod(value)) setPeriod(value);
            }}
          />
        </div>
      </div>

      {state.status === 'loading' && (
        <>
          <p role="status" className="sr-only">
            Carregando o resumo financeiro…
          </p>
          <div
            aria-hidden="true"
            data-testid="financeiro-skeleton"
            className="grid grid-cols-1 gap-4 web:grid-cols-3"
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex animate-pulse flex-col gap-2 border border-linha bg-branco-quente p-4 motion-reduce:animate-none"
              >
                <span className="h-3 w-24 bg-papel-profundo" />
                <span className="h-7 w-32 bg-papel-profundo" />
              </div>
            ))}
          </div>
        </>
      )}

      {state.status === 'error' && (
        <ErrorState message="Não foi possível carregar o resumo financeiro." onRetry={retry} />
      )}

      {state.status === 'ready' && (
        <>
          <div className="grid grid-cols-1 gap-4 web:grid-cols-3">
            <div data-testid="financeiro-bruto">
              <StatCard label="Vendido no período" value={brl(state.summary.gross)} />
            </div>
            <div data-testid="financeiro-comissao">
              <StatCard
                label={`Comissão (${COMMISSION_PERCENT}%)`}
                value={brl(state.summary.commission)}
              />
            </div>
            <div data-testid="financeiro-liquido">
              <StatCard label="Você recebeu" value={brl(state.summary.net)} highlight />
            </div>
          </div>
          {state.summary.soldCount === 0 && (
            <p className="font-ui text-body-sm text-texto-auxiliar">
              Nenhuma venda neste período ainda. Quando uma peça for vendida, o valor aparece aqui.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default FinancialSummary;
