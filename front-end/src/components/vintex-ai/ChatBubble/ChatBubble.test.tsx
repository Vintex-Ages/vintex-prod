import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ChatBubble } from './ChatBubble';
import type { ChatMessage } from '@/types/vintex-ai';
import type { Product } from '@/types/product';

afterEach(() => {
  cleanup();
});

const userMessage: ChatMessage = {
  id: 'm1',
  role: 'user',
  createdAt: 'agora',
  text: 'Quero um look para um café no domingo.',
};

const vintexMessage: ChatMessage = {
  id: 'm2',
  role: 'vintex',
  createdAt: 'agora',
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
  it('renderiza a bolha do usuário com rótulo "Você", texto e horário (createdAt)', () => {
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
  });

  // --- #199 (FE-CMP-30): streaming, products, error ---

  it('streaming=true mostra o cursor e anuncia o texto via aria-live', () => {
    render(<ChatBubble message={vintexMessage} streaming />);

    expect(screen.getByTestId('chat-bubble-streaming-cursor')).toBeInTheDocument();
    expect(screen.getByText(vintexMessage.text).closest('p')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('sem streaming, não mostra cursor nem aria-live', () => {
    render(<ChatBubble message={vintexMessage} />);

    expect(screen.queryByTestId('chat-bubble-streaming-cursor')).not.toBeInTheDocument();
    expect(screen.getByText(vintexMessage.text).closest('p')).not.toHaveAttribute('aria-live');
  });

  it('message.products renderiza a ChatProductList', () => {
    const product: Product = {
      id: 'p1',
      name: 'Vestido floral',
      price: 89.9,
      coverImageUrl: 'https://example.com/vestido.jpg',
      store: { id: 's1', name: 'Brechó Ana' },
    };

    render(
      <MemoryRouter>
        <ChatBubble message={{ ...vintexMessage, products: [product] }} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Vestido floral')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver peça: Vestido floral' })).toBeInTheDocument();
  });

  it('repassa onOpenProduct para o onOpen da ChatProductList', async () => {
    const user = userEvent.setup();
    const onOpenProduct = vi.fn();
    const product: Product = {
      id: 'p1',
      name: 'Vestido floral',
      price: 89.9,
      coverImageUrl: null,
      store: { id: 's1', name: 'Brechó Ana' },
    };

    render(
      <MemoryRouter>
        <ChatBubble
          message={{ ...vintexMessage, products: [product] }}
          onOpenProduct={onOpenProduct}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'Ver peça: Vestido floral' }));

    expect(onOpenProduct).toHaveBeenCalledWith('p1');
  });

  it('sem message.products, não renderiza a ChatProductList', () => {
    render(
      <MemoryRouter>
        <ChatBubble message={vintexMessage} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('error mostra a mensagem de falha e o botão de retry, no lugar do conteúdo normal', () => {
    render(<ChatBubble message={vintexMessage} error="Falha ao responder." onRetry={() => {}} />);

    expect(screen.getByText('Falha ao responder.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.queryByText(vintexMessage.text)).not.toBeInTheDocument();
  });

  it('clicar em "Tentar de novo" chama onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ChatBubble message={vintexMessage} error="Falha ao responder." onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error sem onRetry não renderiza o botão (não quebra)', () => {
    render(<ChatBubble message={vintexMessage} error="Falha ao responder." />);

    expect(screen.getByText('Falha ao responder.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('não usa nenhuma cor em hex cru em nenhum dos estados', () => {
    const product: Product = {
      id: 'p1',
      name: 'Vestido floral',
      price: 89.9,
      coverImageUrl: null,
      store: { id: 's1', name: 'Brechó Ana' },
    };

    const { container: streamingContainer } = render(
      <ChatBubble message={vintexMessage} streaming />,
    );
    expect(streamingContainer.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    cleanup();

    const { container: errorContainer } = render(
      <ChatBubble message={vintexMessage} error="Falha." onRetry={() => {}} />,
    );
    expect(errorContainer.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    cleanup();

    const { container: productsContainer } = render(
      <MemoryRouter>
        <ChatBubble message={{ ...vintexMessage, products: [product] }} />
      </MemoryRouter>,
    );
    expect(productsContainer.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
