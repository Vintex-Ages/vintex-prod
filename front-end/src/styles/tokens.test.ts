import { describe, expect, it } from 'vitest';
import { colors, colorTokens, fontFamily, fontSize, screens, spacing } from './tokens';

describe('design tokens', () => {
  it('exposes the eleven official colours by token name', () => {
    expect(colors).toMatchObject({
      papel: '#F6F1E8',
      'papel-profundo': '#EEE5D7',
      'branco-quente': '#FFFAF2',
      tinta: '#1D1B1A',
      'texto-auxiliar': '#655E57',
      linha: '#CFC3B3',
      vermelhao: '#982632',
      'vermelho-escuro': '#741D27',
      'vermelho-suave': '#F0D9D4',
      'verde-rs': '#315443',
      dourado: '#B88C38',
    });
    expect(Object.keys(colors)).toHaveLength(11);
  });

  it('declares Fraunces for display and Inter for UI, each with a fallback stack', () => {
    expect(fontFamily.display[0]).toBe('Fraunces');
    expect(fontFamily.ui[0]).toBe('Inter');
    expect(fontFamily.sans[0]).toBe('Inter');
    expect(fontFamily.display.length).toBeGreaterThan(1);
    expect(fontFamily.ui.length).toBeGreaterThan(1);
  });

  it('configures the editorial type scale, from display down to label', () => {
    expect(Object.keys(fontSize)).toEqual([
      'display',
      'h1',
      'h2',
      'h3',
      'h4',
      'body',
      'body-sm',
      'label',
    ]);
    expect(fontSize.body[0]).toBe('1rem');
  });

  it('keeps the style guide ceiling on the fluid steps and a fixed size below them', () => {
    // display/h1/h2 encolhem no celular, mas o teto continua sendo o valor do
    // style guide (96/72/48px). Do h3 para baixo o tamanho é fixo.
    expect(fontSize.display[0]).toBe('clamp(2.5rem, 9vw, 6rem)');
    expect(fontSize.h1[0]).toBe('clamp(2rem, 6.5vw, 4.5rem)');
    expect(fontSize.h2[0]).toBe('clamp(1.625rem, 4vw, 3rem)');

    for (const key of ['h3', 'h4', 'body', 'body-sm', 'label']) {
      expect(fontSize[key][0]).toMatch(/^\d+(\.\d+)?rem$/);
    }
  });

  it('never lets a step land below the 12px readability floor', () => {
    // `label` rotula nome de brechó e trilha; abaixo de 12px fica ilegível.
    const fixed = ['h3', 'h4', 'body', 'body-sm', 'label'];
    for (const key of fixed) {
      expect(Number.parseFloat(fontSize[key][0]) * 16).toBeGreaterThanOrEqual(12);
    }
  });

  it('documents the canonical 4px spacing steps in rem', () => {
    // Reference subset only — not wired into Tailwind (see tokens.ts / tailwind.config.ts).
    const values = Object.values(spacing);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      if (value === '0px') continue;
      expect(value).toMatch(/^\d+(\.\d+)?rem$/);
      // 0.25rem === 4px at a 16px root, so every step lands on the 4px grid.
      expect((Number.parseFloat(value) * 16) % 4).toBe(0);
    }
  });

  it('defines exactly the three project breakpoints', () => {
    expect(screens).toEqual({ mobile: '0px', tablet: '720px', web: '1050px' });
  });

  it('keeps the sample-page swatch metadata in sync with the colour tokens', () => {
    expect(colorTokens).toHaveLength(11);
    for (const token of colorTokens) {
      expect(colors[token.key]).toBe(token.hex);
      expect(token.bgClass).toBe(`bg-${token.key}`);
    }
  });
});
