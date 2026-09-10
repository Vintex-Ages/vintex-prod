import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';

/**
 * Esqueleto visual do app — cabeçalho, conteúdo e rodapé (FE-FND-1b, #105).
 * Toda página é renderizada dentro dele. Composição pura; sem regra de
 * negócio.
 *
 * Usage:
 *   import Layout from '@/components/layout/Layout';
 *   <Layout><Landing /></Layout>
 */
function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-papel">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default Layout;
