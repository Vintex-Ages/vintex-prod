import clsx from 'clsx';

/**
 * Indicador de progresso de um fluxo em etapas — apenas apresentação.
 * Componente controlado: quem chama guarda `current` e decide o que acontece
 * em `onStepSelect` (ex.: voltar para a etapa de fotos). Nenhuma validação de
 * "pode avançar?" mora aqui.
 *
 * Estados derivados só do índice: antes de `current` = concluída, igual =
 * atual, depois = futura. Só etapa concluída é navegável, e só quando
 * `onStepSelect` é informado — etapa futura nunca vira botão, para o fluxo não
 * ser pulado pelo indicador.
 *
 * Duas variantes por breakpoint: no mobile, o resumo compacto
 * ("2 de 3 · Dados"), com um "Voltar para <etapa anterior>" quando há etapa
 * concluída e `onStepSelect`; a partir de `tablet:`, a lista horizontal. A variante
 * escondida fica em `display: none`, então o leitor de tela não ouve o
 * progresso duas vezes.
 *
 * Usage:
 *   import Stepper from '@/components/common/Stepper';
 *   <Stepper
 *     steps={[{ id: 'fotos', label: 'Fotos' }, { id: 'dados', label: 'Dados' }]}
 *     current={step}
 *     onStepSelect={setStep}
 *   />
 */
export type StepperStep = {
  id: string;
  label: string;
};

export type StepperProps = {
  steps: StepperStep[];
  /** Índice (base 0) da etapa atual. */
  current: number;
  /** Recebe o índice da etapa concluída clicada. Sem ele, nada é clicável. */
  onStepSelect?: (index: number) => void;
};

type StepState = 'completed' | 'current' | 'upcoming';

function getStepState(index: number, current: number): StepState {
  if (index < current) return 'completed';
  if (index === current) return 'current';
  return 'upcoming';
}

function StepMarker({ index, state }: { index: number; state: StepState }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-body-sm font-semibold',
        state === 'completed' && 'border-verde-rs bg-verde-rs text-branco-quente',
        state === 'current' && 'border-vermelho-escuro bg-vermelho-escuro text-branco-quente',
        state === 'upcoming' && 'border-linha bg-transparent text-texto-auxiliar',
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
      ) : (
        index + 1
      )}
    </span>
  );
}

function Stepper({ steps, current, onStepSelect }: StepperProps) {
  const currentStep = steps[current];
  const previousStep = current > 0 ? steps[current - 1] : undefined;

  return (
    <div>
      {currentStep ? (
        <div className="flex flex-wrap items-center justify-between gap-2 tablet:hidden">
          <p className="text-body-sm font-semibold text-tinta">
            {`${current + 1} de ${steps.length} · ${currentStep.label}`}
          </p>
          {previousStep && onStepSelect ? (
            <button
              type="button"
              onClick={() => onStepSelect(current - 1)}
              className="inline-flex min-h-touch items-center px-1 text-body-sm text-tinta underline underline-offset-4 transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
            >
              {`Voltar para ${previousStep.label}`}
            </button>
          ) : null}
        </div>
      ) : null}

      <ol className="hidden items-center gap-2 tablet:flex">
        {steps.map((step, index) => {
          const state = getStepState(index, current);
          const isLast = index === steps.length - 1;
          const content = (
            <>
              <StepMarker index={index} state={state} />
              <span
                className={clsx(
                  'text-body-sm',
                  state === 'upcoming' ? 'text-texto-auxiliar' : 'font-semibold text-tinta',
                )}
              >
                {step.label}
              </span>
              {state === 'completed' ? <span className="sr-only">(concluída)</span> : null}
            </>
          );

          return (
            <li
              key={step.id}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={clsx('flex items-center gap-2', !isLast && 'flex-1')}
            >
              {state === 'completed' && onStepSelect ? (
                <button
                  type="button"
                  onClick={() => onStepSelect(index)}
                  className="inline-flex min-h-touch items-center gap-2 px-1 transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
                >
                  {content}
                </button>
              ) : (
                <span className="inline-flex min-h-touch items-center gap-2 px-1">{content}</span>
              )}
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className={clsx(
                    'h-px flex-1',
                    state === 'completed' ? 'bg-verde-rs' : 'bg-linha',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default Stepper;
