import type { ReactNode } from 'react';
import clsx from 'clsx';
import { colorTokens, fontSize, screens, spacing } from '@/styles/tokens';
import { AccountMenu } from '@/components/layout/AccountMenu';

/**
 * Sample page that renders every design token side by side (Style Guide v.1).
 * Used as a visual check that the Tailwind theme carries the official palette,
 * type scale, spacing rhythm and breakpoints.
 *
 * Usage: rendered at `/` by `App.tsx` until routing (FE-FND-1c, #106) exists.
 *   import StyleGuide from '@/pages/StyleGuide/StyleGuide';
 *   <StyleGuide />
 */

const TYPE_SAMPLES: { token: string; text: string; className: string }[] = [
  { token: 'display', text: 'Aa', className: 'font-display text-display text-tinta' },
  { token: 'h1', text: 'Recicle roupas', className: 'font-display text-h1 text-tinta' },
  { token: 'h2', text: 'Recicle roupas, não ex.', className: 'font-display text-h2 text-tinta' },
  {
    token: 'body',
    text: 'Peças únicas de brechós do Rio Grande do Sul, com apoio da assistente Vintex.',
    className: 'font-ui text-body text-tinta',
  },
  {
    token: 'label',
    text: 'Catálogo',
    className: 'font-ui text-label uppercase tracking-wide text-texto-auxiliar',
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
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="pb-8">
        <p className="text-label uppercase tracking-wide text-texto-auxiliar">Vintex</p>
        <h1 className="mt-2 font-display text-h1 text-tinta">Tokens · Style Guide v.1</h1>
        <p className="mt-4 max-w-prose text-body text-texto-auxiliar">
          Todas as cores, a escala tipográfica, o ritmo de espaçamento e os breakpoints oficiais,
          consumidos apenas por classes de token.
        </p>
      </header>

      <Section title="Cores">
        <ul className="grid grid-cols-2 gap-6 tablet:grid-cols-3 web:grid-cols-5">
          {colorTokens.map((token) => (
            <li key={token.key}>
              <div className={clsx('h-20 w-full rounded-md border border-linha', token.bgClass)} />
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
      <Section title="Account Menu">
        <div className="space-y-8">
          <div>
            <p className="mb-3 font-ui text-label uppercase tracking-wide text-texto-auxiliar">
              Mobile · Anônimo
            </p>
            <AccountMenu
              authenticated={false}
              platform="mobile"
              onLogin={() => {}}
              onRegister={() => {}}
            />
          </div>

          <div>
            <p className="mb-3 font-ui text-label uppercase tracking-wide text-texto-auxiliar">
              Web · Anônimo
            </p>
            <AccountMenu
              authenticated={false}
              platform="web"
              onLogin={() => {}}
              onRegister={() => {}}
            />
          </div>

          <div>
            <p className="mb-3 font-ui text-label uppercase tracking-wide text-texto-auxiliar">
              Mobile · Logado
            </p>
            <AccountMenu
              authenticated
              platform="mobile"
              user={{ name: 'Ana Beatriz' }}
              items={[
                { label: 'Favoritos', onSelect: () => {} },
                { label: 'Pedidos', onSelect: () => {} },
                { label: 'Preferências', onSelect: () => {} },
              ]}
              onLogout={() => {}}
            />
          </div>

          <div>
            <p className="mb-3 font-ui text-label uppercase tracking-wide text-texto-auxiliar">
              Web · Logado
            </p>
            <AccountMenu
              authenticated
              platform="web"
              user={{ name: 'Ana Beatriz' }}
              items={[
                { label: 'Favoritos', onSelect: () => {} },
                { label: 'Pedidos', onSelect: () => {} },
                { label: 'Preferências', onSelect: () => {} },
              ]}
              onLogout={() => {}}
            />
          </div>
        </div>
      </Section>
    </main>
  );
}

export default StyleGuide;
