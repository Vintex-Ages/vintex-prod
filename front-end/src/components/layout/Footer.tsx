import { NAV_LINKS } from './navLinks';

/**
 * Rodapé do app — marca, navegação e copyright. Composição pura sobre
 * tokens; sem regra de negócio. Mesmo caso do `Header`: `<a>` porque o
 * router ainda não está montado (#106).
 *
 * Usage:
 *   import Footer from '@/components/layout/Footer';
 *   <Footer />
 */
function Footer() {
  return (
    <footer className="border-t border-linha bg-papel-profundo">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-8 tablet:flex-row tablet:justify-between">
        <a
          href="/"
          className="font-display text-body text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
        >
          vintex
        </a>

        <nav aria-label="Rodapé" className="flex gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-ui text-body text-texto-auxiliar hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <p className="font-ui text-label text-texto-auxiliar">© 2026 Vintex</p>
      </div>
    </footer>
  );
}

export default Footer;
