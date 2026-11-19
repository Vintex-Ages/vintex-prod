import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AddressFields from '@/components/common/AddressFields';
import Button from '@/components/common/Button';
import FormErrorSummary from '@/components/common/FormErrorSummary';
import Container from '@/components/layout/Container';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import { useToast } from '@/context/useToast';
import { useCheckout } from '@/hooks/useCheckout';
import { orderPaymentPath, paths } from '@/routes/paths';
import type { Product } from '@/types/product';
import { formatCentsToBRL } from '@/utils/format';

/** O que o carrinho ou o detalhe da peça mandam pela navegação. */
export type CheckoutState = { products: Product[] };

const NO_PIX_MESSAGE = 'Este brechó ainda não cadastrou a chave Pix';

/** Os valores do contrato vêm em reais; `formatCentsToBRL` pede centavos. */
const brl = (reais: number) => formatCentsToBRL(Math.round(reais * 100));

function readProducts(state: unknown): Product[] | null {
  const products = (state as Partial<CheckoutState> | null)?.products;
  return Array.isArray(products) && products.length > 0 ? products : null;
}

/**
 * Checkout, etapa 1 de 2 (FE-US022-1, #319, VS-022): endereço de entrega,
 * revisão e confirmação de **um Pedido para uma loja**. Confirmar leva à
 * etapa do Pix (`orderPaymentPath`).
 *
 * As peças chegam pelo `state` da navegação: do carrinho, as disponíveis de
 * uma loja ("Finalizar compra"); do detalhe, a peça do "Comprar Agora". Sem
 * elas (um F5, por exemplo), volta ao carrinho com aviso.
 *
 * Fica de fora, como pede a issue: frete, prazo de entrega (RN-83) e qualquer
 * total somando lojas. A regra mora em `useCheckout`; aqui só se desenha e se
 * decide para onde ir. Precisa estar dentro do `ToastProvider` e do
 * `CartProvider`, atrás do `RequireAuth`.
 *
 * Usage:
 *   <Route path={paths.checkout} element={<RequireAuth><Checkout /></RequireAuth>} />
 *   navigate(paths.checkout, { state: { products } satisfies CheckoutState });
 */
function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const products = readProducts(location.state);

  useEffect(() => {
    if (products) return;
    toast('Escolha de novo as peças no carrinho para continuar a compra.', { kind: 'info' });
    navigate(paths.cart, { replace: true });
  }, [products, navigate, toast]);

  if (!products) return null;
  return <CheckoutForm products={products} />;
}

function CheckoutForm({ products }: { products: Product[] }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const checkout = useCheckout(products);
  // Gatilho do foco no primeiro campo inválido (`FormErrorSummary`).
  const [submitCount, setSubmitCount] = useState(0);
  const store = products[0].store;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitCount((count) => count + 1);
    const result = await checkout.confirm();

    if (result.status === 'created') {
      navigate(orderPaymentPath(result.orderId));
    } else if (result.status === 'unavailable') {
      toast('Uma das peças não está mais disponível', { kind: 'error' });
      navigate(paths.cart);
    }
  }

  return (
    <Container as="main" width="narrow" className="flex flex-col gap-6 py-6 tablet:py-10">
      <div className="flex flex-col gap-1">
        <p className="font-ui text-label font-semibold uppercase tracking-wide text-texto-auxiliar">
          Etapa 1 de 2
        </p>
        <h1 className="font-display text-h2 text-tinta">Finalizar compra</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <section
          aria-labelledby="checkout-loja"
          className="flex flex-col gap-3 border border-linha bg-branco-quente p-4 tablet:p-6"
        >
          <h2 id="checkout-loja" className="font-display text-h4 text-tinta">
            {store.name}
          </h2>
          <ul className="flex flex-col gap-3">
            {products.map((product) => (
              <li key={product.id} className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden border border-linha bg-papel-profundo">
                  {product.coverImageUrl ? (
                    <img
                      src={product.coverImageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ProductImagePlaceholder productName={product.name} />
                  )}
                </div>
                <p className="min-w-0 flex-1 break-words font-ui text-body text-tinta">
                  {product.name}
                </p>
                <p className="font-ui text-body font-semibold text-tinta">{brl(product.price)}</p>
              </li>
            ))}
          </ul>
        </section>

        <fieldset className="flex flex-col gap-5" disabled={checkout.submitting}>
          <legend className="mb-2 font-display text-h4 text-tinta">Endereço de entrega</legend>
          <AddressFields
            idPrefix="delivery"
            value={checkout.address}
            onChange={checkout.setAddressField}
            errors={checkout.errors}
            cepStatus={checkout.cepStatus}
            disabled={checkout.submitting}
          />
        </fieldset>

        <section
          aria-label="Resumo do pedido"
          className="flex flex-col gap-2 border border-linha bg-branco-quente p-4 tablet:p-6"
        >
          <dl className="flex flex-col gap-2 font-ui text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-texto-auxiliar">Peças</dt>
              <dd className="text-tinta">{brl(checkout.totals.productsReais)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between gap-4">
                <dt className="text-texto-auxiliar">Comissão da plataforma (9%)</dt>
                <dd className="text-texto-auxiliar">{brl(checkout.totals.commissionReais)}</dd>
              </div>
              <p className="text-body-sm text-texto-auxiliar">
                paga pelo vendedor — não entra no seu total
              </p>
            </div>
            <div className="flex justify-between gap-4 border-t border-linha pt-2">
              <dt className="font-semibold text-tinta">Total a pagar</dt>
              <dd className="font-semibold text-tinta">{brl(checkout.totals.totalReais)}</dd>
            </div>
          </dl>
        </section>

        {/* Na ordem da tela: o primeiro com erro recebe o foco. */}
        <FormErrorSummary
          submitCount={submitCount}
          items={[
            { id: 'delivery-cep', message: checkout.errors.cep },
            { id: 'delivery-street', message: checkout.errors.street },
            { id: 'delivery-number', message: checkout.errors.number },
            { id: 'delivery-district', message: checkout.errors.district },
            { id: 'delivery-city', message: checkout.errors.city },
            { id: 'delivery-state', message: checkout.errors.state },
          ]}
        />

        {checkout.storeWithoutPix ? (
          <p
            role="alert"
            className="border border-vermelho-escuro bg-vermelho-suave p-3 font-ui text-body text-vermelho-escuro"
          >
            {NO_PIX_MESSAGE}
          </p>
        ) : null}

        {checkout.submitError ? (
          <p
            role="alert"
            className="border border-vermelho-escuro bg-vermelho-suave p-3 font-ui text-body text-vermelho-escuro"
          >
            {checkout.submitError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(-1)}
            disabled={checkout.submitting}
          >
            Voltar
          </Button>
          <Button type="submit" disabled={checkout.submitting || checkout.storeWithoutPix}>
            {checkout.submitting ? 'Confirmando…' : 'Confirmar pedido'}
          </Button>
        </div>
      </form>
    </Container>
  );
}

export default Checkout;
