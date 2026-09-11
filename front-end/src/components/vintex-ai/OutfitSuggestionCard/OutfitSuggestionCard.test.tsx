import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { OutfitSuggestionCard } from './OutfitSuggestionCard';
import type { OutfitSuggestion } from '@/types/vintex-ai';

afterEach(() => {
  cleanup();
});

const suggestion: OutfitSuggestion = {
  title: 'Domingo de garimpo',
  description: 'Uma composição leve para circular pela cidade e ainda render um achado.',
  items: [
    { id: 'i1', label: 'Camisa leve', icon: 'shirt' },
    { id: 'i2', label: 'Jeans reto', icon: 'pants' },
    { id: 'i3', label: 'Bolsa de couro', icon: 'bag' },
  ],
  note: 'Conteúdo sintético para visualizar a ideia.',
};

describe('OutfitSuggestionCard', () => {
  it('renderiza título, descrição, as peças e a nota', () => {
    render(<OutfitSuggestionCard suggestion={suggestion} />);

    expect(screen.getByText(suggestion.title)).toBeInTheDocument();
    expect(screen.getByText(suggestion.description)).toBeInTheDocument();
    expect(screen.getByText('Camisa leve')).toBeInTheDocument();
    expect(screen.getByText('Jeans reto')).toBeInTheDocument();
    expect(screen.getByText('Bolsa de couro')).toBeInTheDocument();
    expect(screen.getByText(suggestion.note)).toBeInTheDocument();
  });

  it('renderiza as duas ações como botões acessíveis pelo nome', () => {
    render(<OutfitSuggestionCard suggestion={suggestion} />);

    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver peças' })).toBeInTheDocument();
  });

  it('chama onSaveDraft ao clicar em "Salvar rascunho"', () => {
    const onSaveDraft = vi.fn();
    render(<OutfitSuggestionCard suggestion={suggestion} onSaveDraft={onSaveDraft} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it('chama onViewItems ao clicar em "Ver peças"', () => {
    const onViewItems = vi.fn();
    render(<OutfitSuggestionCard suggestion={suggestion} onViewItems={onViewItems} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver peças' }));

    expect(onViewItems).toHaveBeenCalledTimes(1);
  });

  it('não quebra ao clicar quando os callbacks não são passados', () => {
    render(<OutfitSuggestionCard suggestion={suggestion} />);

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' })),
    ).not.toThrow();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Ver peças' }))).not.toThrow();
  });
});
