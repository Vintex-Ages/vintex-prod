import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StyleGuide from './StyleGuide';
import { colorTokens } from '@/styles/tokens';

afterEach(cleanup);

describe('<StyleGuide />', () => {
  it('renders a section for every token group', () => {
    render(<StyleGuide />);
    for (const title of ['Cores', 'Tipografia', 'Espaçamento', 'Breakpoints']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
  });

  it('lists all ten colour tokens with their hex values', () => {
    render(<StyleGuide />);
    for (const token of colorTokens) {
      expect(screen.getAllByText(token.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(token.hex).length).toBeGreaterThan(0);
    }
  });

  it('shows the type scale and the three breakpoints', () => {
    render(<StyleGuide />);
    expect(screen.getByText(/display · 6rem/i)).toBeTruthy();
    for (const name of ['mobile', 'tablet', 'web']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });
});
