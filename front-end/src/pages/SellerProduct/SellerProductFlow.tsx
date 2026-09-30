import { Outlet, useParams } from 'react-router-dom';
import { useProductForm } from '@/hooks/useProductForm';

/**
 * Rota-pai do cadastro de peça (FE-US016-1, #218): formulário e revisão.
 *
 * Existe para as duas telas usarem a MESMA instância do `useProductForm`.
 * As marcas de "sugerido pela IA" e as correções do vendedor só existem no
 * cliente até o `update` final da revisão; com um hook por página, elas se
 * perderiam ao navegar. Aqui o hook fica montado enquanto o vendedor vai e
 * volta entre `/seller/products/:id` e `/seller/products/:id/review`, e cada
 * página lê o estado com `useProductFlow()`.
 *
 * O `id` vem da rota-filha: o React Router repassa à rota-pai os parâmetros
 * da rota que casou por baixo dela.
 *
 * Usage:
 *   <Route element={<SellerProductFlow />}>
 *     <Route path={paths.sellerProductNew} element={<SellerProductForm />} />
 *     <Route path={paths.sellerProductReview} element={<Review />} />
 *   </Route>
 */
export default function SellerProductFlow() {
  const { id } = useParams<{ id: string }>();
  const form = useProductForm(id);

  return <Outlet context={form} />;
}
