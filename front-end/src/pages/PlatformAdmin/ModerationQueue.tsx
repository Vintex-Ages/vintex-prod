import { useLayoutEffect, useRef } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { SuspendedProductList } from '@/components/admin/SuspendedProductList';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { useToast } from '@/context/useToast';
import { useAdminModeration } from '@/hooks/useAdminModeration';

/** Conteúdo de /admin/moderation; a rota conserva RequireRole e o header da #419. */
export default function ModerationQueue() {
  const {
    state,
    items,
    total,
    hasMore,
    loadingMore,
    loadMoreError,
    reconciling,
    reconcileError,
    restoringIds,
    restoreErrors,
    restore,
    loadMore,
    retry,
  } = useAdminModeration();
  const { toast } = useToast();
  const main = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const restoringFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const previous = restoringFocus.current;
    if (!previous || previous.isConnected) return;
    restoringFocus.current = null;
    // Só substitui o foco perdido junto com o cartão; respeita quem já navegou
    // para outro controle enquanto aguardava a resposta.
    if (document.activeElement === document.body || document.activeElement === null) {
      heading.current?.focus();
    }
  }, [items]);

  async function restoreAnnouncement(id: string) {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && main.current?.contains(focused))
      restoringFocus.current = focused;
    const result = await restore(id);
    if (!result || !main.current) return;
    const message =
      result.status === 'ativo'
        ? 'Anúncio devolvido à vitrine.'
        : result.status === 'despublicado'
          ? 'Suspensão removida. O anúncio continua pausado pelo vendedor.'
          : 'Suspensão removida.';
    toast(message, { kind: 'success' });
  }

  return (
    <div className="min-h-screen bg-branco-quente tablet:bg-papel">
      <AdminHeader />
      <main
        ref={main}
        className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 pb-12 pt-6 tablet:gap-10 tablet:px-10 tablet:pb-24 tablet:pt-14 web:px-20"
      >
        <div className="flex flex-col gap-2">
          <h1
            ref={heading}
            tabIndex={-1}
            className="font-display text-h2 tracking-tight text-tinta focus:outline-none"
          >
            Anúncios suspensos
          </h1>
          <p className="max-w-prose font-ui text-body-sm text-texto-auxiliar">
            Anúncios retirados do ar pela administração. Consulte o motivo e restaure a publicação
            quando apropriado.
          </p>
        </div>

        {state.status === 'loading' ? (
          <div
            role="status"
            aria-label="Carregando anúncios suspensos"
            aria-busy="true"
            className="flex flex-col gap-4"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="h-48 animate-pulse border border-linha bg-papel-profundo motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null}
        {state.status === 'error' ? (
          <ErrorState
            message="Não foi possível carregar os anúncios suspensos."
            onRetry={retry}
            retryLabel="Tentar novamente"
          />
        ) : null}
        {state.status === 'forbidden' ? (
          <ErrorState
            title="Sem permissão"
            message="Você não tem permissão para ver os anúncios suspensos."
          />
        ) : null}

        {state.status === 'ready' ? (
          <div className="flex flex-col gap-4">
            {reconcileError ? (
              <ErrorState
                message="A restauração foi confirmada, mas não foi possível atualizar a lista. Tente novamente para continuar."
                onRetry={retry}
                retryLabel="Tentar novamente"
              />
            ) : null}
            {reconciling ? (
              <p role="status" className="font-ui text-body-sm text-texto-auxiliar">
                Atualizando a lista de anúncios suspensos…
              </p>
            ) : null}
            {total === 0 ? (
              <EmptyState
                title="Nenhum anúncio suspenso"
                message="Não há anúncios suspensos pela administração no momento."
              />
            ) : (
              <SuspendedProductList
                items={items}
                restoringIds={restoringIds}
                restoreErrors={restoreErrors}
                disabled={reconciling || reconcileError}
                onRestore={(id) => {
                  void restoreAnnouncement(id);
                }}
              />
            )}
            {loadMoreError ? (
              <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
                Não foi possível carregar mais anúncios suspensos. Tente novamente.
              </p>
            ) : null}
            {hasMore ? (
              <Button
                variant="outline"
                className="self-center"
                disabled={loadingMore || reconciling || reconcileError || restoringIds.size > 0}
                onClick={() => {
                  void loadMore();
                }}
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
