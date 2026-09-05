import type { Config } from 'tailwindcss';
import { tokens } from './src/styles/tokens';

/**
 * Vintex design tokens live in `src/styles/tokens.ts` and are wired here.
 * `screens` is overridden so only the project's breakpoints (mobile/tablet/web)
 * are reachable. Spacing keeps Tailwind's default 4px rem grid — the style
 * guide's canonical steps (`tokens.spacing`) are a documented subset for
 * reference, not a restriction (overriding it silently dropped `1.5`, `px`, …
 * and broke utilities people reach for by habit).
 */
const config: Config = {
  darkMode: 'class',
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
