import clsx from 'clsx';
import type { OrderStatus } from '@/types/order';

/**
 * Linha do tempo vertical do status do Pedido (FE-CMP-35, issue #306) —
 * apenas apresentação. Recebe o status atual e o histórico como vieram da API
 * e só decide como desenhá-los; nada de "pode avançar?" ou prazo mora aqui.
 *
 * Mesmo padrão do `Stepper`: estado por índice em relação a `current`
 * (antes = concluída, igual = atual, depois = futura), exposto em `data-state`,
 * com `aria-current="step"` só na atual. Etapas concluída e atual mostram a
 * data do `history` (a última entrada do status, se houver repetição); futuras
 * nunca mostram data, mesmo que o `history` traga uma.
 *
 * `expirado` não é etapa: é a saída negativa. Nesse caso aparecem só as etapas
 * com entrada no `history` e, no lugar das futuras, o aviso "Pedido expirado",
 * sem etapa atual.
 *
 * Sem texto de prazo nem rastreio de transportadora (RN-83).
 *
 * Usage:
 *   import OrderStatusTimeline from '@/components/orders/OrderStatusTimeline';
 *   <OrderStatusTimeline current={order.status} history={order.history} />
 */
export type OrderStatusTimelineProps = {
  current: OrderStatus;
  /** Datas em ISO; etapa sem entrada ainda não foi atingida. */
  history: { status: OrderStatus; at: string }[];
};

type TimelineStatus = Exclude<OrderStatus, 'expirado'>;
type StepState = 'completed' | 'current' | 'upcoming';

const STEPS: { status: TimelineStatus; label: string }[] = [
  { status: 'aguardando_comprovante', label: 'Aguardando comprovante' },
  { status: 'em_analise', label: 'Comprovante em análise' },
  { status: 'confirmado', label: 'Pagamento confirmado' },
  { status: 'preparando', label: 'Preparando' },
  { status: 'enviado', label: 'Enviado' },
  { status: 'concluido', label: 'Concluído' },
];

// Fuso fixo: a data exibida não depende da máquina de quem abre a tela.
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "dd/mm/aaaa hh:mm", ou `null` se `iso` não for data válida. */
function formatDate(iso: string): string | null {
  const date = new Date(iso);
  // `format` lança RangeError com Invalid Date; aqui a data só some.
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    dateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function StepMarker({ state }: { state: StepState }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
        state === 'completed' && 'border-verde-rs bg-verde-rs text-branco-quente',
        state === 'current' && 'border-vermelho-escuro bg-vermelho-escuro text-branco-quente',
        state === 'upcoming' && 'border-linha bg-papel',
      )}
    >
      {state === 'completed' ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4">
          <path
            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

/** Traço vertical que liga o marcador desta etapa ao da próxima. */
function Connector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'absolute bottom-0 left-4 top-8 w-px -translate-x-1/2',
        done ? 'bg-verde-rs' : 'bg-linha',
      )}
    />
  );
}

function OrderStatusTimeline({ current, history }: OrderStatusTimelineProps) {
  // Percorre em ordem: a entrada mais recente (última do array) sobrescreve.
  const dates = new Map<OrderStatus, string>();
  for (const entry of history) dates.set(entry.status, entry.at);

  const isExpired = current === 'expirado';
  const currentIndex = STEPS.findIndex((step) => step.status === current);
  const visibleSteps = isExpired ? STEPS.filter((step) => dates.has(step.status)) : STEPS;

  return (
    <ol className="flex flex-col">
      {visibleSteps.map((step, index) => {
        const state: StepState = isExpired
          ? 'completed'
          : index < currentIndex
            ? 'completed'
            : index === currentIndex
              ? 'current'
              : 'upcoming';
        const at = dates.get(step.status);
        const formatted = state !== 'upcoming' && at ? formatDate(at) : null;
        const hasNext = isExpired || index < visibleSteps.length - 1;

        return (
          <li
            key={step.status}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className={clsx('relative flex gap-3', hasNext && 'pb-6')}
          >
            {hasNext ? <Connector done={state === 'completed'} /> : null}
            <StepMarker state={state} />
            <div className="flex min-h-8 flex-col justify-center">
              <span
                className={clsx(
                  'text-body-sm',
                  state === 'upcoming' ? 'text-texto-auxiliar' : 'font-semibold text-tinta',
                )}
              >
                {step.label}
              </span>
              {state === 'completed' ? <span className="sr-only">(concluída)</span> : null}
              {formatted && at ? (
                <time dateTime={at} className="text-label text-texto-auxiliar">
                  {formatted}
                </time>
              ) : null}
            </div>
          </li>
        );
      })}

      {isExpired ? (
        <li data-state="expired" className="relative flex gap-3">
          <span
            aria-hidden="true"
            className="relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dourado bg-papel"
          />
          <div className="flex min-h-8 flex-col justify-center">
            <span className="text-body-sm font-semibold text-tinta">Pedido expirado</span>
          </div>
        </li>
      ) : null}
    </ol>
  );
}

export default OrderStatusTimeline;
