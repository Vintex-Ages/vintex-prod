import { Link } from 'react-router-dom';
import { paths } from '@/routes/paths';
import Container from './Container';
import { NAV_LINKS } from './navLinks';

/**
 * Rodapé do app — marca, slogan, navegação e copyright. Composição pura sobre
 * tokens; sem regra de negócio. Navega com `<Link>`, como o `Header`: um
 * `<a href>` recarregaria a aplicação inteira a cada clique. Por isso precisa
 * estar dentro de um `<Router>`.
 *
 * O slogan é fixo da marca e não aparecia em lugar nenhum da interface — só no
 * `<title>` do documento. O rodapé é onde ele cabe sem disputar atenção com a
 * peça.
 *
 * Usage:
 *   import Footer from '@/components/layout/Footer';
 *   <Footer />
 */
function Footer() {
  return (
    <footer className="mt-16 border-t border-linha bg-papel-profundo">
      <Container className="flex flex-col gap-6 py-10 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="flex flex-col gap-1">
          <Link
            to={paths.home}
            className="font-display text-h3 leading-none text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermelho-escuro"
          >
            vintex
          </Link>
          <p className="font-ui text-body-sm text-texto-auxiliar">Recicle roupas, não ex</p>
        </div>

        <nav aria-label="Rodapé" className="flex gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="font-ui text-body-sm text-texto-auxiliar hover:text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermelho-escuro"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="font-ui text-label text-texto-auxiliar">© 2026 Vintex</p>
      </Container>
    </footer>
  );
}

export default Footer;
