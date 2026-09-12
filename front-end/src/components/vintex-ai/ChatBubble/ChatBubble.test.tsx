import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChatBubble } from './ChatBubble';
import type { ChatMessage } from '@/types/vintex-ai';

afterEach(() => {
  cleanup();
});

const userMessage: ChatMessage = {
  id: 'm1',
  role: 'user',
  timestamp: 'agora',
  text: 'Quero um look para um café no domingo.',
};

const vintexMessage: ChatMessage = {
  id: 'm2',
  role: 'vintex',
  timestamp: 'agora',
  text: 'Entendi: confortável, com memória de brechó.',
};

const vintexMessageWithOutfit: ChatMessage = {
  ...vintexMessage,
  id: 'm3',
  outfit: {
    title: 'Domingo de garimpo',
    description: 'Uma composição leve para circular pela cidade.',
    items: [{ id: 'i1', label: 'Camisa leve', icon: 'shirt' }],
    note: 'Conteúdo sintético para visualizar a ideia.',
  },
};

describe('ChatBubble', () => {
  it('renderiza a bolha do usuário com rótulo "Você", texto e horário', () => {
    render(<ChatBubble message={userMessage} />);

    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.getByText(userMessage.text)).toBeInTheDocument();
    expect(screen.getByText('agora')).toBeInTheDocument();
  });

  it('renderiza a bolha da Vintex com rótulo "Vintex" e texto', () => {
    render(<ChatBubble message={vintexMessage} />);

    expect(screen.getByText('Vintex')).toBeInTheDocument();
    expect(screen.getByText(vintexMessage.text)).toBeInTheDocument();
  });

  it('não renderiza o OutfitSuggestionCard quando a mensagem não tem outfit', () => {
    render(<ChatBubble message={vintexMessage} />);

    expect(screen.queryByText('Domingo de garimpo')).not.toBeInTheDocument();
  });

  it('compõe o OutfitSuggestionCard quando a mensagem da Vintex tem outfit', () => {
    render(<ChatBubble message={vintexMessageWithOutfit} />);

    expect(screen.getByText('Domingo de garimpo')).toBeInTheDocument();
    expect(screen.getByText('Camisa leve')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeInTheDocument();
  });

  it('não usa nenhuma cor em hex cru', () => {
    const { container } = render(<ChatBubble message={userMessage} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
