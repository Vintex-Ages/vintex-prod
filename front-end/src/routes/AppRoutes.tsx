import { matchPath, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
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
import SellerProductForm from '@/pages/SellerProduct/SellerProductForm';
import Cart from '@/pages/Cart/Cart';
import SellerProfile from '@/pages/SellerProfile/SellerProfile';
import ProfilePreferences from '@/pages/Profile/ProfilePreferences';
import { RequireAuth, RequireStore } from './guards';
import { paths } from './paths';

/**
 * Rota-pai que veste as telas de navegação do produto com o esqueleto do app
 * (`Layout`: cabeçalho, conteúdo, rodapé).
 *
 * Ficam DE FORA, de propósito:
 * - `/login` e `/register`: telas de autenticação de página inteira, com a
 *   própria volta e o próprio título.
 * - `/vintex`: a conversa tem cabeçalho próprio e é `h-screen overflow-hidden`;
 *   dentro do Layout a página ganharia dois `banner` e o campo de mensagem
 *   cairia abaixo da dobra.
 * - `/style-guide`: documentação interna, não é tela de produto.
 */
function WithLayout() {
  const { pathname } = useLocation();
  // O detalhe da peça ancora a barra de favoritar/comprar no rodapé da
  // viewport abaixo de `web`. Só ela precisa da faixa extra no fim.
  const hasFixedBottomBar = matchPath(paths.product, pathname) !== null;

  return (
    <Layout bottomSpacer={hasFixedBottomBar}>
      <Outlet />
    </Layout>
  );
}

/**
 * Rotas da Sprint 1 (FE-FND-1c, #106) e Sprint 2 (FE-FND-4, #205).
 *
 * Guardas (FE-US005-3, #75): `/sell`, `/cart` e `/profile/preferences`
 * exigem sessão (`RequireAuth`); `/seller` e as duas rotas de peça exigem
 * loja (`RequireStore`, FE-US006-2 #213 — sem loja, vai a `/sell` com aviso);
 * `/store/:id` é pública, de propósito
 * (perfil da loja é vitrine, não área do vendedor).
 *
 * Todas as rotas novas entram dentro do `WithLayout`, com placeholder mínimo
 * até a task de tela correspondente substituir o `element`.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route element={<WithLayout />}>
        <Route path={paths.home} element={<Home />} />
        <Route path={paths.catalog} element={<Catalog />} />
        <Route path={paths.product} element={<ProductDetail />} />
        <Route path={paths.onboarding} element={<StyleSelection />} />
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
        <Route
          path={paths.sellerProductNew}
          element={
            <RequireStore>
              <SellerProductForm />
            </RequireStore>
          }
        />
        <Route
          path={paths.sellerProduct}
          element={
            <RequireStore>
              <SellerProductForm />
            </RequireStore>
          }
        />
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
      </Route>
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
