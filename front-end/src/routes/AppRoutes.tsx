import { matchPath, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Container from '@/components/layout/Container';
import Home from '@/pages/Home';
import Catalog from '@/pages/Catalog/Catalog';
import ProductDetail from '@/pages/ProductDetail';
import Login from '@/pages/Auth/Login/Login';
import Register from '@/pages/Auth/Register/Register';
import NotFound from '@/pages/NotFound/NotFound';
import StyleGuide from '@/pages/StyleGuide/StyleGuide';
import StyleSelection from '@/pages/Onboarding/StyleSelection';
import VintexAI from '@/pages/VintexAI/VintexAI';
import Sell from '@/pages/Sell/Sell';
import SellerAdmin from '@/pages/SellerAdmin/SellerAdmin';
import Review from '@/pages/SellerProduct/Review';
import SellerProductFlow from '@/pages/SellerProduct/SellerProductFlow';
import SellerProductForm from '@/pages/SellerProduct/SellerProductForm';
import Cart from '@/pages/Cart/Cart';
import SellerProfile from '@/pages/SellerProfile/SellerProfile';
import ProfilePreferences from '@/pages/Profile/ProfilePreferences';
import { RequireAuth, RequireRole, RequireStore } from './guards';
import { paths } from './paths';

/**
 * Rota-pai que veste as telas de navegação do produto com o esqueleto do app
 * (`Layout`: cabeçalho, conteúdo, rodapé).
 *
 * Ficam DE FORA, de propósito:
 * - `/login` e `/register`: telas de autenticação de página inteira, com a
 *   própria volta e o próprio título.
 * - `/onboarding`: a tela mobile tem cabeçalho e fluxo próprios do Figma.
 * - `/vintex`: a conversa tem cabeçalho próprio e é `h-screen overflow-hidden`;
 *   dentro do Layout a página ganharia dois `banner` e o campo de mensagem
 *   cairia abaixo da dobra.
 * - `/style-guide`: documentação interna, não é tela de produto.
 */
function WithLayout() {
  const { pathname } = useLocation();
  // O detalhe da peça usa a composição própria do frame do Figma.
  const isProductDetail = matchPath(paths.product, pathname) !== null;

  return (
    <Layout productDetailLayout={isProductDetail}>
      <Outlet />
    </Layout>
  );
}

/**
 * Rotas das Sprints 1 (FE-FND-1c, #106), 2 (FE-FND-4, #205) e 3 (FE-FND-6, #302).
 *
 * Guardas (FE-US005-3, #75): `/sell`, `/cart` e `/profile/preferences`
 * exigem sessão (`RequireAuth`); `/seller` e as três rotas de peça exigem
 * loja (`RequireStore`, FE-US006-2 #213 — sem loja, vai a `/sell` com aviso);
 * `/store/:id` é pública, de propósito
 * (perfil da loja é vitrine, não área do vendedor).
 *
 * Na Sprint 3, checkout, pedidos e favoritos exigem sessão; comprovantes
 * exigem papel admin; `/stores` é pública. Entram dentro do `WithLayout`,
 * com placeholder mínimo até a task de tela correspondente substituir o `element`.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route element={<WithLayout />}>
        <Route path={paths.home} element={<Home />} />
        <Route path={paths.catalog} element={<Catalog />} />
        <Route path={paths.product} element={<ProductDetail />} />
        <Route
          path={paths.sell}
          element={
            <RequireAuth>
              <Sell />
            </RequireAuth>
          }
        />
        <Route
          path={paths.seller}
          element={
            <RequireStore>
              <SellerAdmin />
            </RequireStore>
          }
        />
        {/* Cadastro de peça (#216, #217) e revisão (#218) sob uma rota-pai:
            o `SellerProductFlow` mantém o mesmo estado entre formulário e
            revisão, e a guarda roda uma vez para o fluxo todo. */}
        <Route
          element={
            <RequireStore>
              <SellerProductFlow />
            </RequireStore>
          }
        >
          <Route path={paths.sellerProductNew} element={<SellerProductForm />} />
          <Route path={paths.sellerProduct} element={<SellerProductForm />} />
          <Route path={paths.sellerProductReview} element={<Review />} />
        </Route>
        <Route
          path={paths.cart}
          element={
            <RequireAuth>
              <Cart />
            </RequireAuth>
          }
        />
        <Route path={paths.store} element={<SellerProfile />} />
        <Route
          path={paths.profilePreferences}
          element={
            <RequireAuth>
              <ProfilePreferences />
            </RequireAuth>
          }
        />
        {/* Sprint 3: apenas rotas e placeholders, sem antecipar as telas. */}
        <Route
          path={paths.checkout}
          element={
            <RequireAuth>
              <Container as="main" className="flex flex-col gap-6 py-10">
                <h1 className="font-display text-h2 text-tinta">Checkout</h1>
                <p className="font-ui text-body text-texto-auxiliar">
                  Essa tela ainda não foi implementada.
                </p>
              </Container>
            </RequireAuth>
          }
        />
        <Route
          path={paths.orders}
          element={
            <RequireAuth>
              <Container as="main" className="flex flex-col gap-6 py-10">
                <h1 className="font-display text-h2 text-tinta">Meus pedidos</h1>
                <p className="font-ui text-body text-texto-auxiliar">
                  Essa tela ainda não foi implementada.
                </p>
              </Container>
            </RequireAuth>
          }
        />
        <Route
          path={paths.orderDetail}
          element={
            <RequireAuth>
              <Container as="main" className="flex flex-col gap-6 py-10">
                <h1 className="font-display text-h2 text-tinta">Detalhe do pedido</h1>
                <p className="font-ui text-body text-texto-auxiliar">
                  Essa tela ainda não foi implementada.
                </p>
              </Container>
            </RequireAuth>
          }
        />
        <Route
          path={paths.orderPayment}
          element={
            <RequireAuth>
              <Container as="main" className="flex flex-col gap-6 py-10">
                <h1 className="font-display text-h2 text-tinta">Pagamento do pedido</h1>
                <p className="font-ui text-body text-texto-auxiliar">
                  Essa tela ainda não foi implementada.
                </p>
              </Container>
            </RequireAuth>
          }
        />
        <Route
          path={paths.favorites}
          element={
            <RequireAuth>
              <Container as="main" className="flex flex-col gap-6 py-10">
                <h1 className="font-display text-h2 text-tinta">Meus favoritos</h1>
                <p className="font-ui text-body text-texto-auxiliar">
                  Essa tela ainda não foi implementada.
                </p>
              </Container>
            </RequireAuth>
          }
        />
        <Route
          path={paths.adminReceipts}
          element={
            <RequireRole role="admin">
              <Container as="main" className="flex flex-col gap-6 py-10">
                <h1 className="font-display text-h2 text-tinta">Painel admin</h1>
                <p className="font-ui text-body text-texto-auxiliar">
                  Essa tela ainda não foi implementada.
                </p>
              </Container>
            </RequireRole>
          }
        />
        <Route
          path={paths.stores}
          element={
            <Container as="main" className="flex flex-col gap-6 py-10">
              <h1 className="font-display text-h2 text-tinta">Brechós</h1>
              <p className="font-ui text-body text-texto-auxiliar">
                Essa tela ainda não foi implementada.
              </p>
            </Container>
          }
        />
      </Route>
      <Route path={paths.onboarding} element={<StyleSelection />} />
      <Route path={paths.vintex} element={<VintexAI />} />
      <Route path={paths.login} element={<Login />} />
      <Route path={paths.register} element={<Register />} />
      <Route path={paths.styleGuide} element={<StyleGuide />} />
      {/*
        O 404 fica DENTRO do esqueleto: a página é só um título, e sem
        cabeçalho quem erra a URL não tem nenhum caminho de volta.
      */}
      <Route element={<WithLayout />}>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
