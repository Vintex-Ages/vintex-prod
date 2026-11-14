import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AISuggestedTag from './AISuggestedTag';

afterEach(cleanup);

describe('<AISuggestedTag />', () => {
  it('renderiza o rótulo padrão', () => {
    render(<AISuggestedTag />);

    expect(screen.getByText('Sugerido pela IA')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Sugerido pela IA' })).toBeTruthy();
  });

  it('aceita um rótulo customizado', () => {
    render(<AISuggestedTag label="Preço sugerido pela IA" />);

    expect(screen.getByRole('img', { name: 'Preço sugerido pela IA' })).toBeTruthy();
    expect(screen.getByText('Preço sugerido pela IA')).toBeTruthy();
  });

  it('compact mantém o nome acessível sem mostrar o texto', () => {
    render(<AISuggestedTag compact />);

    expect(screen.getByRole('img', { name: 'Sugerido pela IA' })).toBeTruthy();
    expect(screen.queryByText('Sugerido pela IA')).toBeNull();
  });

  it('usa os tokens de identidade da Vintex (vermelho), nunca dourado', () => {
    render(<AISuggestedTag />);

    const tag = screen.getByRole('img');
    expect(tag.className).toContain('bg-vermelho-suave');
    expect(tag.className).toContain('text-vermelho-escuro');
    expect(tag.className).not.toContain('dourado');
  });
});
