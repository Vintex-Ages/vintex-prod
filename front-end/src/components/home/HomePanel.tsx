import { Link } from 'react-router-dom';
import clsx from 'clsx';

export type HomePanelLink = { label: string; to: string };

export type HomePanelProps = {
  title: string;
  /** Linha sob o título; `null` enquanto não há o que dizer. */
  message: string | null;
  primary: HomePanelLink;
  links?: HomePanelLink[];
};

/**
 * Bloco da Home para quem trabalha na Vintex (loja ou administração): título,
 * uma linha de situação e atalhos. Só apresentação.
 *
 * Usage:
 *   <HomePanel title="Sua loja" message="3 peças anunciadas"
 *     primary={{ label: 'Abrir minha loja', to: paths.seller }} />
 */
function HomePanel({ title, message, primary, links = [] }: HomePanelProps) {
  return (
    <section
      aria-label={title}
      className="border border-linha bg-papel-profundo px-5 py-7 tablet:px-8 tablet:py-8"
    >
      <h2 className="font-display text-h3 text-tinta">{title}</h2>

      {message ? (
        <p className="mt-3 font-ui text-body-sm leading-relaxed text-texto-auxiliar">{message}</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 tablet:flex-row tablet:flex-wrap">
        {[primary, ...links].map((link, index) => (
          <Link
            key={link.to}
            to={link.to}
            className={clsx(
              'inline-flex min-h-touch items-center justify-center border px-6 py-3 font-ui text-label font-semibold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro',
              index === 0
                ? 'border-vermelho-escuro bg-vermelho-escuro text-branco-quente hover:brightness-110'
                : 'border-linha bg-branco-quente text-tinta hover:bg-papel',
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default HomePanel;
