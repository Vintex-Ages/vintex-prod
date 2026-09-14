import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { VintexAIButton } from '@/components/vintex-ai/VintexAIButton';
import { paths } from '@/routes/paths';
import Footer from './Footer';
import Header from './Header';

/**
 * Esqueleto visual do app — cabeçalho, conteúdo e rodapé (FE-FND-1b, #105).
 * Toda página de produto é renderizada dentro dele.
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
 * Duas adições da revisão visual:
 *
 * - **Link de pulo.** Com a navegação e a busca fixas no topo, quem usa teclado
 *   ou leitor de tela atravessava a barra inteira a cada troca de rota.
 * - **A assistente ganha porta de entrada.** O `VintexAIButton` estava pronto,
 *   testado e mergeado, e não era alcançável de tela nenhuma — só existia a
 *   rota `/vintex`, digitada na mão. A IA é prioridade declarada da
 *   stakeholder; sem o botão, a frente inteira ficava invisível no produto.
 *   Na rota da peça, abaixo de `web`, o botão sobe para não cobrir a barra de
 *   comprar/favoritar.
 *
 * Usage:
 *   import Layout from '@/components/layout/Layout';
 *   <Layout><Home /></Layout>
 */
function Layout({
  children,
  bottomSpacer = false,
}: {
  children: ReactNode;
  bottomSpacer?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-papel">
      <a
        href="#conteudo"
        className="sr-only z-40 bg-tinta px-4 py-2 font-ui text-body font-semibold text-branco-quente focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>

      <Header />

      <div id="conteudo" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </div>

      <Footer />

      {bottomSpacer && <div aria-hidden className="h-28 web:hidden" />}

      <VintexAIButton onClick={() => navigate(paths.vintexAi)} raised={bottomSpacer} />
    </div>
  );
}

export default Layout;
