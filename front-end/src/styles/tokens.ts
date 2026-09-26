/**
 * Design tokens — Vintex Style Guide v.1 (Figma frame `45:22291`).
 *
 * Single source of truth consumed by `tailwind.config.ts`. Components must read
 * these values through Tailwind utilities (`bg-papel`, `text-h1`, `tablet:` …),
 * never as raw hex/family strings — see `.ai/coding-rules.md`.
 *
 * The typographic scale is still `em validação` on the design side; keep the
 * token *names* stable and change only the values here when it lands.
 */

/** Inter — UI / "clareza funcional". 400–700. */
const uiFontStack: string[] = [
  'Inter',
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
];

/** Fraunces — display / "voz editorial". */
const displayFontStack: string[] = [
  'Fraunces',
  'Georgia',
  'Cambria',
  '"Times New Roman"',
  'Times',
  'serif',
];

/**
 * The ten official colours, keyed by token name (kebab-case so they map to
 * `bg-*` / `text-* ` / `border-*`). No purple, no pink — stakeholder constraint.
 */
export const colors: Record<string, string> = {
  papel: '#F6F1E8', // fundo padrão
  'papel-profundo': '#EEE5D7', // fundo de bloco e cartão
  'branco-quente': '#FFFAF2', // superfície elevada
  tinta: '#1D1B1A', // texto principal, chip ativo
  'texto-auxiliar': '#655E57', // texto secundário
  linha: '#CFC3B3', // borda e divisória
  vermelhao: '#982632', // ação e assinatura - vermelho vivo (novo na v.2)
  'vermelho-escuro': '#741D27', // ação e assinatura - valor atualizado na v.2
  'vermelho-suave': '#F0D9D4', // fundo de destaque
  'verde-rs': '#315443', // confiança e confirmação
  dourado: '#B88C38', // atenção — nunca CTA
};

export const fontFamily: Record<string, string[]> = {
  // `sans` mirrors `ui` so Tailwind's preflight default also resolves to Inter.
  sans: uiFontStack,
  ui: uiFontStack,
  display: displayFontStack,
};

type FontSizeToken = [string, { lineHeight: string; letterSpacing?: string }];

/**
 * Escala V1 — Fraunces nos degraus editoriais (`display`/`h1`/`h2`/`h3`), Inter
 * no texto de interface (`h4`/`body`/`body-sm`/`label`).
 *
 * Duas mudanças em relação à V0, ambas medidas no produto rodando:
 *
 * 1. **O meio da escala existe.** A V0 pulava de `h2` (48px) direto para `body`
 *    (16px). Sem degrau intermediário, todo título de seção, nome de peça e
 *    preço caía em `text-body` + peso — 61 usos de `text-body` contra 13 de
 *    `text-h2` — e a página ficava plana. Foi também o que empurrou os dois
 *    únicos valores fora de token do repositório (`text-lg` e `text-2xl`, no
 *    detalhe da peça). `h3` e `h4` fecham o buraco; `body-sm` cobre o texto
 *    auxiliar que hoje é forçado a `label`.
 *
 * 2. **Os degraus grandes são fluidos.** `display`/`h1`/`h2` eram fixos, então
 *    o "Feed de achados" chegava a 72px num aparelho de 390px de largura,
 *    ocupando a dobra inteira antes da primeira peça. O `clamp()` mantém o
 *    valor de topo idêntico ao do style guide no desktop e reduz no celular —
 *    o token não muda de nome nem de teto, só deixa de ser uma medida só.
 *
 * `label` sobe de 0.68rem (10.9px) para 0.75rem (12px): abaixo disso o nome do
 * brechó e a trilha do detalhe ficam ilegíveis, e era o tamanho de 34 usos.
 */
export const fontSize: Record<string, FontSizeToken> = {
  display: ['clamp(2.5rem, 9vw, 6rem)', { lineHeight: '0.9' }],
  h1: ['clamp(2rem, 6.5vw, 4.5rem)', { lineHeight: '0.95' }],
  h2: ['clamp(1.625rem, 4vw, 3rem)', { lineHeight: '1.05' }],
  h3: ['1.5rem', { lineHeight: '1.25' }],
  h4: ['1.125rem', { lineHeight: '1.35' }],
  body: ['1rem', { lineHeight: '1.65' }],
  'body-sm': ['0.875rem', { lineHeight: '1.55' }],
  label: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.04em' }],
};

/**
 * Spacing rhythm — the style guide's canonical 4px steps, in `rem`. This is a
 * documented *subset* for reference and the style-guide page; it is NOT wired
 * into Tailwind as an override, so the full default scale (same 4px rem grid,
 * plus `0.5`/`1.5`/… and `px`) stays available. Guide: 8–16px inside a control,
 * 24–32px between groups, 48–64px between page-level decisions.
 */
export const spacing: Record<string, string> = {
  0: '0px',
  1: '0.25rem', // 4px
  2: '0.5rem', // 8px
  3: '0.75rem', // 12px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  7: '1.75rem', // 28px
  8: '2rem', // 32px
  9: '2.25rem', // 36px
  10: '2.5rem', // 40px
  11: '2.75rem', // 44px
  12: '3rem', // 48px
  14: '3.5rem', // 56px
  16: '4rem', // 64px
  20: '5rem', // 80px
  24: '6rem', // 96px
  28: '7rem', // 112px
  32: '8rem', // 128px
};

/**
 * The three project breakpoints (min-width, mobile-first). Mobile (0–719px) is
 * the unprefixed base; `tablet` covers 720–1049px; `web` is 1050px and up.
 * Overrides Tailwind's `sm…2xl` so only project breakpoints are reachable.
 */
export const screens: Record<string, string> = {
  mobile: '0px',
  tablet: '720px',
  web: '1050px',
};

/**
 * Raio de canto — coleção `Vintex / Layout` do Figma (`378:4`), tokens
 * `radius/none` = 0, `radius/sm` = 2 e `radius/full` = 999.
 *
 * São estes três e mais nenhum: fora da pílula, o máximo do sistema é 2px.
 * Canto reto é identidade da marca, não descuido — e por isso a escala entra
 * em `tailwind.config.ts` como **substituição**, e não como extensão. Assim
 * `rounded-md`/`rounded-lg`/`rounded-xl` deixam de existir e não há como
 * aplicá-los por hábito (era o caso de `rounded-lg` no onboarding e de
 * `rounded-md` no guia de estilo).
 */
export const borderRadius: Record<string, string> = {
  none: '0px',
  sm: '2px',
  full: '9999px',
};

/**
 * Alvo mínimo de toque — `size/touch-min` = 44 na mesma coleção do Figma.
 * Exposto como token para os componentes usarem `min-h-touch`/`min-w-touch`
 * em vez de repetir o número.
 */
export const touchTarget = '2.75rem'; // 44px

export interface ColorToken {
  /** Token name as written in the style guide. */
  name: string;
  /** Tailwind key, e.g. `papel` → `bg-papel`. */
  key: string;
  /** Literal utility class, so Tailwind's content scanner keeps it. */
  bgClass: string;
  hex: string;
  /** What the colour is for. */
  role: string;
}

/** Ordered metadata for the style-guide sample page. Hex comes from `colors`. */
export const colorTokens: ColorToken[] = [
  { name: 'Papel', key: 'papel', bgClass: 'bg-papel', hex: colors['papel'], role: 'fundo padrão' },
  {
    name: 'Papel profundo',
    key: 'papel-profundo',
    bgClass: 'bg-papel-profundo',
    hex: colors['papel-profundo'],
    role: 'fundo de bloco e cartão',
  },
  {
    name: 'Branco quente',
    key: 'branco-quente',
    bgClass: 'bg-branco-quente',
    hex: colors['branco-quente'],
    role: 'superfície elevada',
  },
  {
    name: 'Tinta',
    key: 'tinta',
    bgClass: 'bg-tinta',
    hex: colors['tinta'],
    role: 'texto principal, chip ativo',
  },
  {
    name: 'Texto auxiliar',
    key: 'texto-auxiliar',
    bgClass: 'bg-texto-auxiliar',
    hex: colors['texto-auxiliar'],
    role: 'texto secundário',
  },
  {
    name: 'Linha',
    key: 'linha',
    bgClass: 'bg-linha',
    hex: colors['linha'],
    role: 'borda e divisória',
  },
  {
    name: 'Vermelhão',
    key: 'vermelhao',
    bgClass: 'bg-vermelhao',
    hex: colors['vermelhao'],
    role: 'ação e assinatura',
  },
  {
    name: 'Vermelho escuro',
    key: 'vermelho-escuro',
    bgClass: 'bg-vermelho-escuro',
    hex: colors['vermelho-escuro'],
    role: 'ação e assinatura',
  },
  {
    name: 'Vermelho suave',
    key: 'vermelho-suave',
    bgClass: 'bg-vermelho-suave',
    hex: colors['vermelho-suave'],
    role: 'fundo de destaque',
  },
  {
    name: 'Verde RS',
    key: 'verde-rs',
    bgClass: 'bg-verde-rs',
    hex: colors['verde-rs'],
    role: 'confiança e confirmação',
  },
  {
    name: 'Dourado',
    key: 'dourado',
    bgClass: 'bg-dourado',
    hex: colors['dourado'],
    role: 'atenção — nunca CTA',
  },
];

export const tokens = { colors, fontFamily, fontSize, spacing, screens, borderRadius, touchTarget };
