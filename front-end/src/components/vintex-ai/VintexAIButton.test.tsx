import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { VintexAIButton } from './VintexAIButton';

afterEach(() => {
  cleanup();
});

describe('VintexAIButton', () => {
  it('renderiza um botão acessível com o aria-label padrão', () => {
    render(<VintexAIButton onClick={() => {}} />);

    expect(screen.getByRole('button', { name: 'Abrir assistente Vintex' })).toBeInTheDocument();
  });

  it('aceita um aria-label customizado', () => {
    render(<VintexAIButton onClick={() => {}} ariaLabel="Falar com a Vintex" />);

    expect(screen.getByRole('button', { name: 'Falar com a Vintex' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Abrir assistente Vintex' }),
    ).not.toBeInTheDocument();
  });

  it('chama onClick ao clicar', () => {
    const onClick = vi.fn();
    render(<VintexAIButton onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente Vintex' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('não usa nenhuma cor em hex cru (só classes de token)', () => {
    render(<VintexAIButton onClick={() => {}} />);

    const button = screen.getByRole('button', { name: 'Abrir assistente Vintex' });
    expect(button.className).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(button.closest('div')?.className).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
