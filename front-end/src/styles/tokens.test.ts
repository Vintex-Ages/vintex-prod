import { describe, expect, it } from 'vitest';
import { colors, colorTokens, fontFamily, fontSize, screens, spacing } from './tokens';

describe('design tokens', () => {
  it('exposes the ten official colours by token name', () => {
    expect(colors).toMatchObject({
      papel: '#F6F1E8',
      'papel-profundo': '#EEE5D7',
      'branco-quente': '#FFFAF2',
      tinta: '#1D1B1A',
      'texto-auxiliar': '#655E57',
      linha: '#CFC3B3',
      'vermelho-escuro': '#7D0020',
      'vermelho-suave': '#F0D9D4',
      'verde-rs': '#315443',
      dourado: '#B88C38',
    });
    expect(Object.keys(colors)).toHaveLength(10);
  });

  it('declares Fraunces for display and Inter for UI, each with a fallback stack', () => {
    expect(fontFamily.display[0]).toBe('Fraunces');
    expect(fontFamily.ui[0]).toBe('Inter');
    expect(fontFamily.sans[0]).toBe('Inter');
    expect(fontFamily.display.length).toBeGreaterThan(1);
    expect(fontFamily.ui.length).toBeGreaterThan(1);
  });

  it('configures the editorial type scale', () => {
    expect(Object.keys(fontSize)).toEqual(['display', 'h1', 'h2', 'body', 'label']);
    expect(fontSize.display[0]).toBe('6rem');
    expect(fontSize.body[0]).toBe('1rem');
    expect(fontSize.h1[1].lineHeight).toBe('0.92');
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
    expect(colorTokens).toHaveLength(10);
    for (const token of colorTokens) {
      expect(colors[token.key]).toBe(token.hex);
      expect(token.bgClass).toBe(`bg-${token.key}`);
    }
  });
});
