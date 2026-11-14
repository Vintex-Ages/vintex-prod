import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import Dialog from '@/components/common/Dialog';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import SellerProductRow from '@/components/seller/SellerProductRow';
import { useToast } from '@/context/useToast';
import { useSellerDrafts } from '@/hooks/useSellerDrafts';
import { sellerProductReviewPath } from '@/routes/paths';
import type { SellerProduct } from '@/types/product';

/**
 * Aba "Rascunhos" do painel do vendedor (FE-US019-6, #345; `docs/adr/0004`).
 *
 * Rascunho nasce em "Continuar para revisão" no cadastro e vira Anunciada ao
 * publicar. Quem fecha a tela no meio não perde o que fez: a aba lista os
 * rascunhos, "Continuar" volta para a revisão (onde a pessoa parou, RN-50) e
 * "Descartar" apaga depois de confirmar (back-end#271).
 *
 * Fica fora das contagens e do total do painel (RN-51): os dados vêm do
 * `useSellerDrafts`, não do `useSellerProducts`.
 *
 * Usage:
 *   {abaRascunhos ? <SellerDrafts /> : <ListaDePecas />}
 */
function SellerDrafts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state, retry, discard } = useSellerDrafts();
  const [pending, setPending] = useState<SellerProduct | null>(null);
  const [discarding, setDiscarding] = useState(false);

  const continuar = (id: string) => navigate(sellerProductReviewPath(id));

  async function confirmarDescarte() {
    if (!pending || discarding) return;
    setDiscarding(true);
    try {
      await discard(pending.id);
      toast('Rascunho descartado', { kind: 'success' });
      setPending(null);
    } catch {
      toast('Não foi possível descartar o rascunho agora.', { kind: 'error' });
    } finally {
      setDiscarding(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <p role="status" className="font-ui text-body text-texto-auxiliar">
        Carregando seus rascunhos…
      </p>
    );
  }

  if (state.status === 'error') {
    return <ErrorState message="Não foi possível carregar seus rascunhos agora." onRetry={retry} />;
  }

  return (
    <>
      {state.drafts.length === 0 ? (
        <EmptyState
          title="Nenhum rascunho por aqui"
          message="Rascunho é a peça que você começou a cadastrar e ainda não publicou. Ele aparece aqui quando você vai para a revisão e sai quando você publica ou descarta."
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Rascunhos">
          {state.drafts.map((draft) => (
            <li key={draft.id}>
              <SellerProductRow
                product={draft}
                onOpen={continuar}
                actions={[
                  { label: 'Continuar', onSelect: () => continuar(draft.id) },
                  { label: 'Descartar', onSelect: () => setPending(draft) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Descartar rascunho?"
        description={
          pending
            ? `"${pending.name}" e as fotos dele serão apagados. Não dá para desfazer.`
            : undefined
        }
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setPending(null)} disabled={discarding}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarDescarte()} disabled={discarding}>
              {discarding ? 'Descartando…' : 'Descartar'}
            </Button>
          </div>
        }
      />
    </>
  );
}

export default SellerDrafts;
