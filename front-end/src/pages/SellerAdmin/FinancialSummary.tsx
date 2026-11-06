import ErrorState from '@/components/common/ErrorState';
import StatCard from '@/components/seller/StatCard';
import { useSalesSummary } from '@/hooks/useSalesSummary';
import { DEFAULT_COMMISSION_RATE } from '@/utils/commission';
import { formatCentsToBRL } from '@/utils/format';

const COMMISSION_PERCENT = (DEFAULT_COMMISSION_RATE * 100).toLocaleString('pt-BR');

/** Reais (como vêm do service) → texto de moeda. */
function brl(reais: number): string {
  return formatCentsToBRL(Math.round(reais * 100));
}

function soldHint(count: number): string {
  return count === 1 ? '1 peça vendida no mês' : `${count} peças vendidas no mês`;
}

/**
 * Cartões financeiros do painel do vendedor (FE-US019-3, #222, RN-51.1, RN-95),
 * alinhados ao frame ajustado do Figma (T15, FE-FIG-3, #437): "Faturamento bruto
 * no mês" e "Taxa média retida (9%)". Os números vêm prontos de `useSalesSummary`
 * (resumo financeiro do back); aqui só se formata e desenha — nada é calculado.
 *
 * O frame mostra o mês e não tem seletor de período, então o painel fixa o mês
 * (o hook continua aceitando outros períodos). "Repasses pendentes (Pix)" e o
 * percentual de líquido não aparecem: o resumo do back não traz esses números.
 *
 * Estados: skeleton nos cartões enquanto carrega, erro com "tentar de novo",
 * rota ausente no back (`docs/adr/0002`) e, sem vendas, R$ 0,00 com uma nota.
 *
 * Usage:
 *   import FinancialSummary from '@/pages/SellerAdmin/FinancialSummary';
 *   <FinancialSummary />
 */
function FinancialSummary() {
  const { state, retry } = useSalesSummary();

  return (
    <section aria-labelledby="financeiro-titulo" className="flex flex-col gap-4">
      <h2 id="financeiro-titulo" className="sr-only">
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
            className="grid grid-cols-1 gap-4 tablet:grid-cols-2"
          >
            {Array.from({ length: 2 }).map((_, index) => (
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

      {state.status === 'unavailable' && (
        <p className="font-ui text-body text-texto-auxiliar">{state.message}</p>
      )}

      {state.status === 'error' && (
        <ErrorState message="Não foi possível carregar o resumo financeiro." onRetry={retry} />
      )}

      {state.status === 'ready' && (
        <>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <div data-testid="financeiro-bruto">
              <StatCard
                label="Faturamento bruto no mês"
                value={brl(state.summary.gross)}
                hint={soldHint(state.summary.soldCount)}
                highlight
                emphasized
              />
            </div>
            <div data-testid="financeiro-comissao">
              <StatCard
                label={`Taxa média retida (${COMMISSION_PERCENT}%)`}
                value={brl(state.summary.commission)}
                emphasized
              />
            </div>
          </div>
          {state.summary.soldCount === 0 && (
            <p className="font-ui text-body-sm text-texto-auxiliar">
              Nenhuma venda neste mês ainda. Quando uma peça for vendida, o valor aparece aqui.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default FinancialSummary;
