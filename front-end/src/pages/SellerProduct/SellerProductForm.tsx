import { useParams } from 'react-router-dom';
import { RoutePlaceholder } from '@/pages/RoutePlaceholder';

/**
 * `/seller/products/new` e `/seller/products/:id` — cadastro/edição de peça
 * (FE-US014-1, #216). As duas rotas compartilham este mesmo placeholder; o
 * título muda conforme haver ou não `:id` na URL. A tela real substitui isto
 * por inteiro.
 */
function SellerProductForm() {
  const { id } = useParams();
  return <RoutePlaceholder title={id ? 'Editar peça' : 'Nova peça'} />;
}

export default SellerProductForm;
