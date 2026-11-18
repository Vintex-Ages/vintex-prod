import { useEffect, useRef, type MouseEvent } from 'react';

/**
 * Resumo único dos erros de um formulário, e o foco no primeiro campo inválido
 * depois de cada envio recusado (docs/adr/0003).
 *
 * Os campos (`InputField`, `Select`...) não anunciam o próprio erro: com nove
 * campos obrigatórios, nove `role="alert"` no mesmo render viravam ruído para o
 * leitor de tela, e o foco ficava no botão. Aqui há uma região `alert` só, com
 * a contagem e um link para cada campo; a mensagem de cada um continua ligada
 * ao campo pelo `aria-describedby`, e é o que o leitor lê quando o foco chega.
 *
 * `items` segue a ordem da tela — o primeiro com mensagem recebe o foco.
 * `submitCount` é o gatilho: o foco só se move quando ele muda, não a cada
 * tecla que apaga um erro.
 *
 * Usage:
 *   const [submitCount, setSubmitCount] = useState(0);
 *   <FormErrorSummary
 *     submitCount={submitCount}
 *     items={[{ id: 'store-name', message: errors.name }, { id: 'store-cep', message: errors.cep }]}
 *   />
 */
export type FormErrorSummaryItem = {
  /** `id` do campo na página (o mesmo passado ao `InputField`/`Select`). */
  id: string;
  message?: string;
};

export type FormErrorSummaryProps = {
  items: FormErrorSummaryItem[];
  submitCount: number;
};

/**
 * Foca o campo pelo `id`. Quando o `id` é de um contêiner (a área de fotos do
 * `MediaUploader`, cujo `input` é invisível), foca o controle visível dentro dele.
 */
function focusField(id: string) {
  const target = document.getElementById(id);
  if (!target) return;

  const focusable = target.matches('input, select, textarea')
    ? target
    : (target.querySelector<HTMLElement>('[tabindex="0"]') ?? target);
  focusable.focus();
  focusable.scrollIntoView?.({ block: 'center' });
}

function FormErrorSummary({ items, submitCount }: FormErrorSummaryProps) {
  const invalid = items.filter((item): item is Required<FormErrorSummaryItem> =>
    Boolean(item.message),
  );
  const firstInvalidId = invalid[0]?.id;
  // Último envio já atendido: `firstInvalidId` muda enquanto a pessoa corrige,
  // e isso não pode puxar o foco de volta.
  const handledSubmit = useRef(submitCount);

  useEffect(() => {
    if (submitCount === handledSubmit.current) return;
    handledSubmit.current = submitCount;
    if (firstInvalidId) focusField(firstInvalidId);
  }, [submitCount, firstInvalidId]);

  if (invalid.length === 0) return null;

  function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    focusField(id);
  }

  const count = invalid.length;

  return (
    <div
      role="alert"
      className="border border-vermelho-escuro bg-vermelho-suave px-4 py-3 text-body-sm text-vermelho-escuro"
    >
      <p className="font-bold">
        {count === 1
          ? 'Confira 1 campo antes de continuar:'
          : `Confira ${count} campos antes de continuar:`}
      </p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
        {invalid.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(event) => handleClick(event, item.id)}
              className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FormErrorSummary;
