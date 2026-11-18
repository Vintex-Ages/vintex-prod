import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CartItemRow, { type CartItem, type CartItemRowProps } from './CartItemRow';

type OptionalAction = {
  label: string;
  onClick: (productId: string) => void;
  disabled?: boolean;
};

type RowOptions = Partial<CartItemRowProps> & { action?: OptionalAction };

const availableItem: CartItem = {
  id: 'produto-ficticio-310',
  name: 'Jaqueta fictícia',
  price: 198.5,
  coverImageUrl: null,
  store: { id: 'loja-ficticia-310', name: 'Brechó Fictício' },
};

const soldItem: CartItem = { ...availableItem, unavailable: 'vendido' };
const pausedItem: CartItem = { ...availableItem, unavailable: 'pausado' };
// O service já representa uma reserva como `pausado`; não existe outro motivo na linha.
const unavailableItems = [
  { state: 'vendido', item: soldItem },
  { state: 'pausado (inclui reserva normalizada)', item: pausedItem },
];

const actionLabel = 'Adicionar ao carrinho';
const removeLabel = `Remover ${availableItem.name} do carrinho`;
// Com `action` a linha serve fora do carrinho (Favoritos, #329): o nome não cita o carrinho.
const actionRemoveLabel = `Remover ${availableItem.name}`;

function renderRow(options: RowOptions = {}) {
  const onRemove = vi.fn<(productId: string) => void>();
  render(<CartItemRow item={availableItem} onRemove={onRemove} {...options} />);
  return { onRemove };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CartItemRow sem action — compatibilidade', () => {
  it('renderiza nome, loja e preço em reais', () => {
    renderRow();

    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByText(availableItem.name)).toBeInTheDocument();
    expect(screen.getByText(availableItem.store.name)).toBeInTheDocument();
    expect(screen.getByText('R$ 198,50')).toBeInTheDocument();
  });

  it('mantém somente o controle de remover quando onOpen não é informado', () => {
    renderRow();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: actionLabel })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: removeLabel })).toBeInTheDocument();
  });

  it('mantém remover habilitado e com o nome acessível atual', () => {
    renderRow();

    expect(screen.getByRole('button', { name: removeLabel })).toBeEnabled();
  });

  it('chama onRemove uma vez com o ID correto', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderRow();

    await user.click(screen.getByRole('button', { name: removeLabel }));

    expect(onRemove).toHaveBeenCalledExactlyOnceWith(availableItem.id);
  });

  it('preserva a abertura pelo título quando onOpen é informado', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { onRemove } = renderRow({ onOpen });

    await user.click(screen.getByRole('button', { name: availableItem.name }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(availableItem.id);
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('mantém o título como texto quando onOpen não é informado', () => {
    renderRow();

    expect(screen.getByText(availableItem.name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: availableItem.name })).not.toBeInTheDocument();
  });
});

describe('CartItemRow com action', () => {
  it('renderiza texto e nome acessível a partir de action.label', () => {
    const label = 'Consultar peça';
    renderRow({ action: { label, onClick: vi.fn() } });

    const button = screen.getByRole('button', { name: label });
    expect(button).toHaveTextContent(label);
    expect(button).toHaveAccessibleName(label);
  });

  it('chama action.onClick exatamente uma vez e somente com item.id', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderRow({ action: { label: actionLabel, onClick } });

    await user.click(screen.getByRole('button', { name: actionLabel }));

    expect(onClick).toHaveBeenCalledExactlyOnceWith(availableItem.id);
  });

  it('habilita a ação de produto disponível quando disabled está ausente', () => {
    renderRow({ action: { label: actionLabel, onClick: vi.fn() } });

    expect(screen.getByRole('button', { name: actionLabel })).toBeEnabled();
  });

  it('habilita a ação de produto disponível com disabled false', () => {
    renderRow({ action: { label: actionLabel, onClick: vi.fn(), disabled: false } });

    expect(screen.getByRole('button', { name: actionLabel })).toBeEnabled();
  });

  it('aplica disabled real e bloqueia o clique quando action.disabled é true', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderRow({ action: { label: actionLabel, onClick, disabled: true } });

    const button = screen.getByRole('button', { name: actionLabel });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('disabled');
    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(unavailableItems)(
    'desabilita a ação para item $state e bloqueia o callback',
    async ({ item }) => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderRow({ item, action: { label: actionLabel, onClick } });

      const button = screen.getByRole('button', { name: actionLabel });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('disabled');
      await user.click(button);

      expect(onClick).not.toHaveBeenCalled();
    },
  );

  it.each(unavailableItems)(
    'prioriza item $state mesmo com action.disabled false',
    async ({ item }) => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderRow({ item, action: { label: actionLabel, onClick, disabled: false } });

      const button = screen.getByRole('button', { name: actionLabel });
      expect(button).toBeDisabled();
      await user.click(button);

      expect(onClick).not.toHaveBeenCalled();
    },
  );

  it('clicar na ação não chama onRemove nem onOpen', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onOpen = vi.fn();
    const { onRemove } = renderRow({ onOpen, action: { label: actionLabel, onClick } });

    await user.click(screen.getByRole('button', { name: actionLabel }));

    expect(onClick).toHaveBeenCalledExactlyOnceWith(availableItem.id);
    expect(onRemove).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('o remover não fala em carrinho, porque a linha é reusada em Favoritos', () => {
    renderRow({ action: { label: actionLabel, onClick: vi.fn() } });

    expect(screen.getByRole('button', { name: actionRemoveLabel })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /do carrinho/ })).not.toBeInTheDocument();
  });

  it('clicar em remover não chama action.onClick nem onOpen', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onOpen = vi.fn();
    const { onRemove } = renderRow({ onOpen, action: { label: actionLabel, onClick } });
    expect(screen.getByRole('button', { name: actionLabel })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: actionRemoveLabel }));

    expect(onRemove).toHaveBeenCalledExactlyOnceWith(availableItem.id);
    expect(onClick).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('remover permanece funcional com action explicitamente desabilitada', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { onRemove } = renderRow({ action: { label: actionLabel, onClick, disabled: true } });
    expect(screen.getByRole('button', { name: actionLabel })).toBeDisabled();

    const removeButton = screen.getByRole('button', { name: actionRemoveLabel });
    expect(removeButton).toBeEnabled();
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledExactlyOnceWith(availableItem.id);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(unavailableItems)('remover permanece funcional para item $state', async ({ item }) => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { onRemove } = renderRow({ item, action: { label: actionLabel, onClick } });
    expect(screen.getByRole('button', { name: actionLabel })).toBeDisabled();

    const removeButton = screen.getByRole('button', { name: actionRemoveLabel });
    expect(removeButton).toBeEnabled();
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledExactlyOnceWith(item.id);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('preserva onOpen pelo título com action presente, sem acionar os outros controles', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onOpen = vi.fn();
    const { onRemove } = renderRow({ onOpen, action: { label: actionLabel, onClick } });
    expect(screen.getByRole('button', { name: actionLabel })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: availableItem.name }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(availableItem.id);
    expect(onClick).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it.each([
    { keyName: 'Enter', keys: '{Enter}' },
    { keyName: 'Espaço', keys: ' ' },
  ])('permite chegar à ação por Tab e acioná-la com $keyName', async ({ keys }) => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { onRemove } = renderRow({ action: { label: actionLabel, onClick } });
    const button = screen.getByRole('button', { name: actionLabel });

    for (let index = 0; index < screen.getAllByRole('button').length; index += 1) {
      await user.tab();
      if (document.activeElement === button) break;
    }
    expect(button).toHaveFocus();
    await user.keyboard(keys);

    expect(onClick).toHaveBeenCalledExactlyOnceWith(availableItem.id);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('ignora a ação desabilitada na navegação por Tab e não a aciona por teclado', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderRow({ action: { label: actionLabel, onClick, disabled: true } });
    const button = screen.getByRole('button', { name: actionLabel });
    expect(button).toBeDisabled();

    await user.tab();
    expect(button).not.toHaveFocus();
    expect(screen.getByRole('button', { name: actionRemoveLabel })).toHaveFocus();
    // Desfoca Remover para que Enter/Espaço não executem outra ação da linha.
    await user.tab();
    await user.keyboard('{Enter} ');

    expect(onClick).not.toHaveBeenCalled();
  });
});
