import ErrorState from '@/components/common/ErrorState';
import StatCard from '@/components/seller/StatCard';
import { useSalesSummary } from '@/hooks/useSalesSummary';
import type { SalesPeriod } from '@/services/sellerProductService';
import { DEFAULT_COMMISSION_RATE } from '@/utils/commission';
import { formatCentsToBRL } from '@/utils/format';

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

function soldHint(count: number, period: SalesPeriod): string {
  return `${count} ${count === 1 ? 'peça vendida' : 'peças vendidas'} ${PERIOD_PHRASE[period]}`;
}

/**
 * Seção "Financeiro" do painel do vendedor (FE-US019-3, #222, RN-51.1, RN-95):
 * dois cartões — faturamento bruto e taxa retida (comissão da plataforma). Os
 * números vêm prontos de `useSalesSummary` (sempre o mês); aqui só se formata e
 * desenha — nada é calculado.
 *
 * Visual alinhado ao frame ajustado do Figma (T15, FE-FIG-3, #437): rótulos
 * "Faturamento bruto no mês" e "Taxa média retida (9%)", cartões em duas
 * colunas no celular e três na web. O frame não tem seletor de período nem o
 * cartão "Você recebeu": ficam fora da página (o componente `Select` continua no
 * projeto). O cartão "Repasses pendentes (Pix)" e o percentual de líquido também
 * não aparecem: o resumo do back não traz esses números.
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
  const { state, period, retry } = useSalesSummary();

  return (
    <section aria-labelledby="financeiro-titulo" className="flex flex-col gap-4">
      <h2 id="financeiro-titulo" className="font-display text-h3 text-tinta">
        Financeiro
      </h2>

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
            {Array.from({ length: 2 }).map((_, index) => (
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
