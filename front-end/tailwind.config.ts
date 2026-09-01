import type { Config } from 'tailwindcss';
import { tokens } from './src/styles/tokens';

/**
 * Vintex design tokens live in `src/styles/tokens.ts` and are wired here.
 * `screens` and `spacing` are overridden (not extended) so only the project's
 * breakpoints and 4px grid are reachable from utilities.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: tokens.screens,
    spacing: tokens.spacing,
    extend: {
      colors: tokens.colors,
      fontFamily: tokens.fontFamily,
      fontSize: tokens.fontSize,
    },
  },
  plugins: [],
};

export default config;
