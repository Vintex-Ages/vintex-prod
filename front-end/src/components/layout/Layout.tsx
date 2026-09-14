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
 * `bottomSpacer` reserva uma faixa no fim do documento, abaixo do rodapé, para
 * páginas que ancoram uma barra `fixed` no rodapé da viewport — hoje só o
 * detalhe da peça, abaixo de `web`. Sem isso a barra cobre as últimas linhas do
 * rodapé quando a pessoa rola até o fim: compensação dentro do `<main>` não
 * resolve, porque o rodapé é irmão posterior do conteúdo.
 *
 * Usage:
 *   import Layout from '@/components/layout/Layout';
 *   <Layout><Landing /></Layout>
 */
function Layout({
  children,
  bottomSpacer = false,
}: {
  children: ReactNode;
  bottomSpacer?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-papel">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
      {bottomSpacer && <div aria-hidden className="h-28 web:hidden" />}
    </div>
  );
}

export default Layout;
