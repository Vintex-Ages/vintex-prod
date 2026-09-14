import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';

/**
 * Esqueleto visual do app — cabeçalho, conteúdo e rodapé (FE-FND-1b, #105).
 * Toda página é renderizada dentro dele. Composição pura; sem regra de
 * negócio.
 *
 * O contêiner do conteúdo é uma `<div>`, não um `<main>`: cada página do
 * projeto já declara o próprio `<main>` (Home, Catálogo, Detalhe da peça e
 * Onboarding), e dois landmarks aninhados deixariam a página sem um `main`
 * inequívoco para leitor de tela.
 *
 * Usage:
 *   import Layout from '@/components/layout/Layout';
 *   <Layout><Landing /></Layout>
 */
function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-papel">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

export default Layout;
