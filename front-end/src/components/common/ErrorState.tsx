import Button from '@/components/common/Button';

type ErrorStateProps = {
  title?: string;
  message: string;
  /** Quando informado, desenha o botão de tentar de novo. */
  onRetry?: () => void;
  retryLabel?: string;
};

/**
 * Estado de falha de carregamento. Só apresentação: quem chama decide o texto
 * e o que `onRetry` faz — ver `.ai/coding-rules.md`.
 *
 * Existe porque o erro estava escrito como um `<p>` vermelho solto em quatro
 * telas (home, catálogo, detalhe da peça e onboarding), cada uma com uma frase
 * própria e nenhuma com saída: quem via a mensagem só podia recarregar a
 * página na mão. Aqui o erro diz o que aconteceu e oferece a ação.
 *
 * `role="alert"` fica no contêiner para o leitor de tela anunciar a falha sem
 * precisar de foco — mesmo padrão dos avisos de formulário do projeto.
 *
 * Usage:
 *   import ErrorState from '@/components/common/ErrorState';
 *   <ErrorState message="Não foi possível carregar as peças." onRetry={recarregar} />
 */
function ErrorState({
  title = 'Algo não carregou',
  message,
  onRetry,
  retryLabel = 'Tentar de novo',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex w-full flex-col items-center justify-center gap-3 border border-linha bg-branco-quente px-6 py-12 text-center"
    >
      <p className="font-display text-h4 font-semibold text-vermelho-escuro">{title}</p>

      <p className="max-w-md font-ui text-body text-texto-auxiliar">{message}</p>

      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export default ErrorState;
