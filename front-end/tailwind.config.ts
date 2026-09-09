import type { Config } from 'tailwindcss';
import { tokens } from './src/styles/tokens';

/**
 * Vintex design tokens live in `src/styles/tokens.ts` and are wired here.
 * `screens` is overridden so only the project's breakpoints (mobile/tablet/web)
 * are reachable. Spacing keeps Tailwind's default 4px rem grid — the style
 * guide's canonical steps (`tokens.spacing`) are a documented subset for
 * reference, not a restriction (overriding it silently dropped `1.5`, `px`, …
 * and broke utilities people reach for by habit).
 *
 * `hoverOnlyWhenSupported` faz `hover:` só valer em ponteiro fino, para o
 * estado não "grudar" após um toque no mobile (ver `.ai/interaction-states.md`).
 */
const config: Config = {
  darkMode: 'class',
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: tokens.screens,
    extend: {
      colors: tokens.colors,
      fontFamily: tokens.fontFamily,
      fontSize: tokens.fontSize,
    },
  },
  plugins: [],
};

export default config;
