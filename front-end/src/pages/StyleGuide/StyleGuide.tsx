import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  borderRadius,
  colorTokens,
  fontSize,
  screens,
  spacing,
  touchTarget,
} from '@/styles/tokens';

/**
 * Sample page that renders every design token side by side (Style Guide v.2).
 * Used as a visual check that the Tailwind theme carries the official palette,
 * type scale, spacing rhythm and breakpoints.
 *
 * Usage: rendered at `/` by `App.tsx` until routing (FE-FND-1c, #106) exists.
 *   import StyleGuide from '@/pages/StyleGuide/StyleGuide';
 *   <StyleGuide />
 */

/**
 * Um exemplo por degrau da escala — os oito, não uma seleção. O guia existe
 * para mostrar o sistema inteiro; degrau que não aparece aqui é degrau que
 * ninguém sabe que pode usar, e foi assim que `h3`/`h4` acabaram virando
 * `text-lg`/`text-2xl` soltos no detalhe da peça.
 */
const TYPE_SAMPLES: { token: string; text: string; className: string }[] = [
  { token: 'display', text: 'Aa', className: 'font-display text-display text-tinta' },
  { token: 'h1', text: 'Recicle roupas', className: 'font-display text-h1 text-tinta' },
  { token: 'h2', text: 'Recicle roupas, não ex.', className: 'font-display text-h2 text-tinta' },
  { token: 'h3', text: 'História da peça', className: 'font-display text-h3 text-tinta' },
  { token: 'h4', text: 'R$ 189,90', className: 'font-ui text-h4 font-bold text-tinta' },
  {
    token: 'body',
    text: 'Peças únicas de brechós do Rio Grande do Sul, com apoio da assistente Vintex.',
    className: 'font-ui text-body text-tinta',
  },
  {
    token: 'body-sm',
    text: 'Brechó Mercado Público · Porto Alegre',
    className: 'font-ui text-body-sm text-texto-auxiliar',
  },
  {
    token: 'label',
    text: 'Catálogo',
    className: 'font-ui text-label text-texto-auxiliar',
  },
];

const BREAKPOINT_RANGES: Record<string, string> = {
  mobile: '0–719px · base, IA primeiro',
  tablet: '720–1049px',
  web: '1050px +',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-linha py-8">
      <h2 className="font-display text-h2 text-tinta">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StyleGuide() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 tablet:px-6 web:px-8">
      <header className="pb-8">
        <p className="text-label uppercase tracking-wide text-texto-auxiliar">Vintex</p>
        <h1 className="mt-2 font-display text-h1 text-tinta">Tokens · Style Guide v.2</h1>
        <p className="mt-4 max-w-prose text-body text-texto-auxiliar">
          Todas as cores, a escala tipográfica, o ritmo de espaçamento e os breakpoints oficiais,
          consumidos apenas por classes de token.
        </p>
      </header>

      <Section title="Cores">
        <ul className="grid grid-cols-2 gap-6 tablet:grid-cols-3 web:grid-cols-5">
          {colorTokens.map((token) => (
            <li key={token.key}>
              <div className={clsx('h-20 w-full rounded-sm border border-linha', token.bgClass)} />
              <p className="mt-3 text-label uppercase tracking-wide text-texto-auxiliar">
                {token.key}
              </p>
              <p className="text-body text-tinta">{token.name}</p>
              <p className="text-texto-auxiliar">{token.hex}</p>
              <p className="text-texto-auxiliar">{token.role}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografia">
        <dl className="divide-y divide-linha">
          {TYPE_SAMPLES.map((sample) => {
            const [size, meta] = fontSize[sample.token];
            return (
              <div key={sample.token} className="overflow-x-auto py-6">
                <dt className={sample.className}>{sample.text}</dt>
                <dd className="mt-2 text-label uppercase tracking-wide text-texto-auxiliar">
                  {sample.token} · {size} / {meta.lineHeight}
                </dd>
              </div>
            );
          })}
        </dl>
      </Section>

      <Section title="Espaçamento">
        <p className="mb-6 text-body text-texto-auxiliar">
          Base em múltiplos de 4px. 8–16px dentro de controles, 24–32px entre grupos, 48–64px entre
          decisões de página.
        </p>
        <ul className="space-y-3">
          {Object.entries(spacing).map(([step, value]) => {
            const px = Number.parseFloat(value) * 16;
            return (
              <li key={step} className="flex items-center gap-4">
                <span className="w-10 text-label uppercase tracking-wide text-texto-auxiliar">
                  {step}
                </span>
                <span className="h-3 rounded-sm bg-verde-rs" style={{ width: value }} />
                <span className="text-texto-auxiliar">
                  {value}
                  {px > 0 ? ` · ${px}px` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Raio e alvo de toque">
        <p className="mb-6 max-w-prose text-body text-texto-auxiliar">
          Da coleção <code>Vintex / Layout</code> do Figma. Fora da pílula, o sistema vai até 2px —
          canto reto é identidade, então a escala substitui a do Tailwind e <code>rounded-md</code>,{' '}
          <code>rounded-lg</code> e <code>rounded-xl</code> não existem.
        </p>
        <ul className="flex flex-wrap gap-6">
          {Object.entries(borderRadius).map(([name, value]) => (
            <li key={name} className="flex flex-col items-center gap-2">
              <span
                className={clsx(
                  'block h-16 w-16 border border-linha bg-papel-profundo',
                  name === 'none' && 'rounded-none',
                  name === 'sm' && 'rounded-sm',
                  name === 'full' && 'rounded-full',
                )}
              />
              <span className="text-label text-texto-auxiliar">
                radius/{name} · {value}
              </span>
            </li>
          ))}
          <li className="flex flex-col items-center gap-2">
            <span className="flex min-h-touch min-w-touch items-center justify-center border border-dashed border-vermelho-escuro text-label text-vermelho-escuro">
              44
            </span>
            <span className="text-label text-texto-auxiliar">size/touch-min · {touchTarget}</span>
          </li>
        </ul>
      </Section>

      <Section title="Breakpoints">
        <ul className="divide-y divide-linha">
          {Object.entries(screens).map(([name, min]) => (
            <li key={name} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <span className="text-body text-tinta">{name}</span>
              <span className="text-texto-auxiliar">min-width {min}</span>
              <span className="text-texto-auxiliar">{BREAKPOINT_RANGES[name]}</span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

export default StyleGuide;
