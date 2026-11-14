import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LookSuggestions } from '@/components/vintex-ai';
import { useCart } from '@/context/useCart';
import { useToast } from '@/context/useToast';
import { paths } from '@/routes/paths';
import { getCombinations } from '@/services/combinationService';
import type { LookSuggestion } from '@/types/look';

/**
 * Looks de uma peça comprada no detalhe do Pedido (FE-US030-2, #430): carrega
 * `getCombinations` da peça de origem por conta própria e desenha o
 * `LookSuggestions`. Cada peça do Pedido tem a sua seção, independente:
 * demora ou falha de uma não afeta as outras nem o Pedido.
 *
 * - Carregando, sem peças ou em erro: nada aparece (sem skeleton, sem mensagem).
 * - Resposta de uma peça de origem que mudou, ou depois de desmontar, é descartada.
 * - A peça de origem já foi reservada ou vendida no Pedido: o back responde 200.
 * - "+ Adicionar" põe a peça sugerida na sacola com o mesmo toast do detalhe da
 *   peça; já na sacola, não adiciona de novo; um clique por vez. Sem barreira
 *   de login: a rota do Pedido já está atrás do `RequireAuth`.
 *
 * O título diz a peça de origem pelo nome, sem artigo: o componente não
 * deduz gênero.
 *
 * Usage:
 *   {order.items.map((item) => (
 *     <OrderLookSection key={item.productId} productId={item.productId} name={item.name} />
 *   ))}
 */
export type OrderLookSectionProps = {
  /** Peça comprada, de origem das combinações. */
  productId: string;
  name: string;
};

function OrderLookSection({ productId, name }: OrderLookSectionProps) {
  const navigate = useNavigate();
  const { cart, add } = useCart();
  const { toast } = useToast();
  const [look, setLook] = useState<LookSuggestion | null>(null);
  // Trava o clique duplo antes do render (o `add` ainda não voltou).
  const addingRef = useRef(false);

  useEffect(() => {
    setLook(null);
    let active = true;

    getCombinations(productId)
      .then((suggestion) => {
        if (active) setLook(suggestion);
      })
      .catch(() => {
        // Silencioso de propósito: sem combinação, o Pedido segue sem a seção.
      });

    return () => {
      active = false;
    };
  }, [productId]);

  const addPiece = useCallback(
    async (pieceId: string) => {
      const inCart =
        cart?.groups.some((group) => group.items.some((item) => item.product.id === pieceId)) ??
        false;
      if (inCart || addingRef.current) return;

      addingRef.current = true;
      try {
        await add(pieceId);
        toast('Adicionada ao carrinho', {
          kind: 'success',
          action: { label: 'Ver carrinho', onSelect: () => navigate(paths.cart) },
        });
      } catch {
        toast('Não foi possível adicionar ao carrinho. Tente novamente.', { kind: 'error' });
      } finally {
        addingRef.current = false;
      }
    },
    [add, cart, navigate, toast],
  );

  if (!look) return null;

  return (
    <LookSuggestions
      suggestion={look}
      title={`Combine com ${name} e monte o look`}
      onAdd={(pieceId) => void addPiece(pieceId)}
    />
  );
}

export default OrderLookSection;
