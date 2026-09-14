import { Outlet, Route, Routes } from 'react-router-dom';
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
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

/**
 * Rotas da Sprint 1 (FE-FND-1c, #106). Guardas de rota (FE-US005-3) entram
 * depois envolvendo o `element` da rota protegida — nada aqui antecipa isso.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route element={<WithLayout />}>
        <Route path={paths.home} element={<Home />} />
        <Route path={paths.catalog} element={<Catalog />} />
        <Route path={paths.product} element={<ProductDetail />} />
        <Route path={paths.onboarding} element={<StyleSelection />} />
      </Route>
      <Route path={paths.vintexAi} element={<VintexAI />} />
      <Route path={paths.login} element={<Login />} />
      <Route path={paths.register} element={<Register />} />
      <Route path={paths.styleGuide} element={<StyleGuide />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
