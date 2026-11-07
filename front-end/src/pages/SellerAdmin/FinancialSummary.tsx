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

/** Como o período entra no rótulo do cartão: no mês, como no frame do Figma ("Faturamento bruto no mês"). */
const PERIOD_PHRASE: Record<SalesPeriod, string> = {
  month: 'no mês',
  '30d': 'nos últimos 30 dias',
  all: 'no total',
};

const COMMISSION_PERCENT = (DEFAULT_COMMISSION_RATE * 100).toLocaleString('pt-BR');

/** Reais (como vêm do service) → texto de moeda. */
function brl(reais: number): string {
  return formatCentsToBRL(Math.round(reais * 100));
}

function isPeriod(value: string | null): value is SalesPeriod {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

function soldHint(count: number, period: SalesPeriod): string {
  return `${count} ${count === 1 ? 'peça vendida' : 'peças vendidas'} ${PERIOD_PHRASE[period]}`;
}

/**
 * Seção "Financeiro" do painel do vendedor (FE-US019-3, #222, RN-51.1, RN-95):
 * seletor de período e três cartões — faturamento bruto, taxa retida (comissão
 * da plataforma) e quanto o vendedor recebeu (líquido, em destaque). Os números
 * vêm prontos de `useSalesSummary`; aqui só se formata e desenha — nada é
 * calculado.
 *
 * Visual alinhado ao frame ajustado do Figma (T15, FE-FIG-3, #437): rótulos
 * "Faturamento bruto no mês" e "Taxa média retida (9%)", cartões em duas
 * colunas no celular e três na web. O cartão "Repasses pendentes (Pix)" e o
 * percentual de líquido não aparecem: o resumo do back não traz esses números.
 *
 * Estados: skeleton nos cards enquanto carrega (também ao trocar o período),
 * erro com "tentar de novo", rota ausente no back (`docs/adr/0002`) e, sem
 * vendas, R$ 0,00 com uma nota.
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
            className="grid grid-cols-2 gap-3 web:grid-cols-3 web:gap-5"
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex min-h-[10.4rem] animate-pulse flex-col gap-2 border border-linha bg-branco-quente p-[0.85rem] motion-reduce:animate-none tablet:min-h-0 tablet:p-5"
              >
                <span className="h-3 w-24 bg-papel-profundo" />
                <span className="h-7 w-32 bg-papel-profundo" />
              </div>
            ))}
          </div>
        </>
      )}

      {state.status === 'unavailable' && (
        <p className="font-ui text-body text-texto-auxiliar">{state.message}</p>
      )}

      {state.status === 'error' && (
        <ErrorState message="Não foi possível carregar o resumo financeiro." onRetry={retry} />
      )}

      {state.status === 'ready' && (
        <>
          {/* Frame ajustado (T15): duas colunas também no celular (cartões de ~172×166 px) e três na web. */}
          <div className="grid grid-cols-2 gap-3 web:grid-cols-3 web:gap-5">
            <div data-testid="financeiro-bruto" className="flex min-h-[10.4rem] tablet:min-h-0">
              <StatCard
                label={`Faturamento bruto ${PERIOD_PHRASE[period]}`}
                value={brl(state.summary.gross)}
                hint={soldHint(state.summary.soldCount, period)}
                highlight
                emphasized
              />
            </div>
            <div data-testid="financeiro-comissao" className="flex min-h-[10.4rem] tablet:min-h-0">
              <StatCard
                label={`Taxa média retida (${COMMISSION_PERCENT}%)`}
                value={brl(state.summary.commission)}
                emphasized
              />
            </div>
            <div data-testid="financeiro-liquido" className="flex min-h-[10.4rem] tablet:min-h-0">
              <StatCard label="Você recebeu" value={brl(state.summary.net)} highlight emphasized />
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
