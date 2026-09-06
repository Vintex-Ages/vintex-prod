import { Route, Routes } from 'react-router-dom';
import Landing from '@/pages/Landing/Landing';
import Catalog from '@/pages/Catalog/Catalog';
import Product from '@/pages/Product/Product';
import Login from '@/pages/Auth/Login/Login';
import Register from '@/pages/Auth/Register/Register';
import Onboarding from '@/pages/Onboarding/Onboarding';
import NotFound from '@/pages/NotFound/NotFound';
import StyleGuide from '@/pages/StyleGuide/StyleGuide';
import { paths } from './paths';

/**
 * Rotas da Sprint 1 (FE-FND-1c, #106). Guardas de rota (FE-US005-3) entram
 * depois envolvendo o `element` da rota protegida — nada aqui antecipa isso.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path={paths.home} element={<Landing />} />
      <Route path={paths.catalog} element={<Catalog />} />
      <Route path={paths.product} element={<Product />} />
      <Route path={paths.login} element={<Login />} />
      <Route path={paths.register} element={<Register />} />
      <Route path={paths.onboarding} element={<Onboarding />} />
      <Route path={paths.styleGuide} element={<StyleGuide />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
