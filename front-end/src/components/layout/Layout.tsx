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
 * `productDetailLayout` aplica o cabeçalho e a barra de compra próprios do
 * detalhe do produto; também retira o rodapé e o botão flutuante da Vintex,
 * que não aparecem nesse frame.
 *
 * Composição compartilhada:
 *
 * - **Link de pulo.** Com a navegação e a busca fixas no topo, quem usa teclado
 *   ou leitor de tela atravessava a barra inteira a cada troca de rota.
 * - **A assistente ganha porta de entrada.** O botão leva à rota `/vintex` nas
 *   páginas do app; no detalhe, a curadoria inline ocupa esse espaço.
 *
 * Usage:
 *   import Layout from '@/components/layout/Layout';
 *   <Layout><Home /></Layout>
 */
function Layout({
  children,
  productDetailLayout = false,
}: {
  children: ReactNode;
  productDetailLayout?: boolean;
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

      {!productDetailLayout && <Footer />}

      {!productDetailLayout && (
        <VintexAIButton onClick={() => navigate(paths.vintex)} className="tablet:hidden" />
      )}
    </div>
  );
}

export default Layout;
