import Button from '@/components/common/Button';

export type PixPaymentCardProps = {
  amount: number;
  pixKey: string | null;
  storeName: string;
  orderLabel: string;
  onCopied?: () => void;
};

const amountFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Instruções de pagamento Pix; amount é informado em reais.
 *
 * Usage:
 *   <PixPaymentCard
 *     amount={198}
 *     pixKey="pagamentos@brecho-exemplo.com.br"
 *     storeName="Brechó Exemplo"
 *     orderLabel="Pedido #123"
 *     onCopied={() => {}}
 *   />
 */
function PixPaymentCard({
  amount,
  pixKey,
  storeName,
  orderLabel,
  onCopied,
}: PixPaymentCardProps): JSX.Element {
  async function handleCopy(): Promise<void> {
    if (pixKey === null) return;

    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(pixKey);
    } catch {
      // A chave permanece disponível para seleção e cópia manual.
      return;
    }

    onCopied?.();
  }

  return (
    <section
      aria-label="Dados para pagamento Pix"
      className="w-full min-w-0 border border-linha bg-branco-quente p-6 font-ui text-tinta"
    >
      <dl className="flex min-w-0 flex-col gap-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-linha pb-4">
          <dt className="text-body-sm font-semibold">Valor Exato do Pedido</dt>
          <dd className="ml-auto text-right text-h3 font-bold text-vermelho-escuro">
            {amountFormatter.format(amount).replace(/\u00a0/g, ' ')}
          </dd>
        </div>

        <div className="mb-3 min-w-0">
          <dt className="text-label font-semibold uppercase text-texto-auxiliar">
            Chave Pix oficial para transferência
          </dt>
          <dd className="mt-4 min-w-0 text-body-sm">
            {pixKey !== null ? (
              <div className="flex min-w-0 flex-wrap items-center gap-3 border border-dashed border-texto-auxiliar bg-papel-profundo p-4">
                <span className="min-w-0 grow shrink basis-24 select-text break-all font-mono">
                  {pixKey}
                </span>
                <Button
                  variant="success"
                  className="min-w-0 shrink-0 whitespace-nowrap uppercase mobile:px-3 mobile:text-label tablet:border-tinta tablet:bg-tinta"
                  onClick={() => void handleCopy()}
                >
                  Copiar chave
                </Button>
              </div>
            ) : (
              'Este brechó ainda não cadastrou a chave Pix'
            )}
          </dd>
        </div>

        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-body-sm text-texto-auxiliar">
          <dt className="after:content-[':']">Favorecido</dt>
          <dd className="min-w-0 max-w-full break-words font-semibold">{storeName}</dd>
        </div>

        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-body-sm text-texto-auxiliar">
          <dt className="after:content-[':']">Identificador</dt>
          <dd className="min-w-0 max-w-full break-words font-semibold">{orderLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

export default PixPaymentCard;
