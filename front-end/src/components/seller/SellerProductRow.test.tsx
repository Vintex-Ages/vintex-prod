import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SellerProduct } from '@/types/product';
import SellerProductRow, { type RowAction, type SellerProductRowProps } from './SellerProductRow';

afterEach(cleanup);

const baseProduct: SellerProduct = {
  id: 'seller-product-1',
  name: 'Vestido Midi Floral',
  price: 149.9,
  status: 'ativo',
  coverImageUrl: 'https://example.com/vestido.jpg',
};

function renderRow(overrides: Partial<SellerProductRowProps> = {}) {
  const props: SellerProductRowProps = {
    product: baseProduct,
    actions: [],
    ...overrides,
  };

  return render(<SellerProductRow {...props} />);
}

describe('<SellerProductRow />', () => {
  it('renderiza miniatura, título e preço formatado em reais', () => {
    renderRow();

    expect(screen.getByRole('img', { name: baseProduct.name })).toHaveAttribute(
      'src',
      baseProduct.coverImageUrl,
    );
    expect(screen.getByText(baseProduct.name)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?149,90/)).toBeInTheDocument();
  });

  it('exibe o placeholder quando coverImageUrl é null', () => {
    renderRow({ product: { ...baseProduct, coverImageUrl: null } });

    const placeholder = screen.getByRole('img', { name: baseProduct.name });
    expect(placeholder.tagName).not.toBe('IMG');
  });

  it('exibe o placeholder quando coverImageUrl está undefined', () => {
    const productWithoutCover = { ...baseProduct };
    delete productWithoutCover.coverImageUrl;
    renderRow({ product: productWithoutCover });

    const placeholder = screen.getByRole('img', { name: baseProduct.name });
    expect(placeholder.tagName).not.toBe('IMG');
  });

  it('renderiza StatusBadge para todos os status definidos pela #202', () => {
    const expectedLabels: Record<SellerProduct['status'], string> = {
      rascunho: 'Rascunho',
      ativo: 'Anunciada',
      vendido: 'Já vendida',
      despublicado: 'Pausada',
    };
    const statuses = Object.entries(expectedLabels) as [SellerProduct['status'], string][];
    const { rerender } = render(
      <SellerProductRow product={{ ...baseProduct, status: 'rascunho' }} actions={[]} />,
    );

    for (const [status, label] of statuses) {
      rerender(<SellerProductRow product={{ ...baseProduct, status }} actions={[]} />);
      expect(screen.getByRole('status')).toHaveTextContent(label);
    }
  });

  it('renderiza todas as ações recebidas por props', () => {
    const actions: RowAction[] = [
      { label: 'Editar', onSelect: vi.fn() },
      { label: 'Despublicar', onSelect: vi.fn() },
      { label: 'Excluir', onSelect: vi.fn() },
    ];
    renderRow({ actions });

    for (const action of actions) {
      expect(screen.getByRole('button', { name: action.label })).toBeInTheDocument();
    }
  });

  it('executa onSelect uma vez quando uma ação habilitada é selecionada', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRow({ actions: [{ label: 'Editar', onSelect }] });

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('não executa onSelect quando disabled é true', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRow({ actions: [{ label: 'Editar', onSelect, disabled: true }] });

    const action = screen.getByRole('button', { name: 'Editar' });
    expect(action).toBeDisabled();
    await user.click(action);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('exibe disabledReason como texto visível', () => {
    renderRow({
      actions: [
        {
          label: 'Editar',
          onSelect: vi.fn(),
          disabled: true,
          disabledReason: 'Peças vendidas não podem ser editadas.',
        },
      ],
    });

    expect(screen.getByText('Peças vendidas não podem ser editadas.')).toBeVisible();
  });

  it('associa disabledReason ao respectivo botão por aria-describedby', () => {
    renderRow({
      actions: [
        {
          label: 'Editar',
          onSelect: vi.fn(),
          disabled: true,
          disabledReason: 'Peças vendidas não podem ser editadas.',
        },
      ],
    });

    const action = screen.getByRole('button', { name: 'Editar' });
    const reason = screen.getByText('Peças vendidas não podem ser editadas.');
    expect(reason).toHaveAttribute('id');
    expect(action).toHaveAttribute('aria-describedby', reason.id);
  });

  it('executa onOpen com o ID do produto ao selecionar o título', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderRow({ onOpen });

    await user.click(screen.getByRole('button', { name: baseProduct.name }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(baseProduct.id);
  });

  it('renderiza o título como texto não interativo quando onOpen não é informado', () => {
    renderRow();

    expect(screen.getByText(baseProduct.name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: baseProduct.name })).not.toBeInTheDocument();
  });

  it('permite interação por teclado com o título e as ações habilitadas', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    renderRow({ onOpen, actions: [{ label: 'Editar', onSelect }] });

    await user.tab();
    expect(screen.getByRole('button', { name: baseProduct.name })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(baseProduct.id);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renderiza normalmente quando actions é um array vazio', () => {
    renderRow({ actions: [] });

    expect(screen.getByText(baseProduct.name)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Anunciada');
  });

  it('mantém associações independentes para múltiplas ações desabilitadas', () => {
    renderRow({
      actions: [
        {
          label: 'Editar',
          onSelect: vi.fn(),
          disabled: true,
          disabledReason: 'Edição indisponível.',
        },
        {
          label: 'Excluir',
          onSelect: vi.fn(),
          disabled: true,
          disabledReason: 'Exclusão indisponível.',
        },
      ],
    });

    const editReason = screen.getByText('Edição indisponível.');
    const deleteReason = screen.getByText('Exclusão indisponível.');
    expect(editReason.id).not.toBe('');
    expect(deleteReason.id).not.toBe('');
    expect(editReason.id).not.toBe(deleteReason.id);
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveAttribute(
      'aria-describedby',
      editReason.id,
    );
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveAttribute(
      'aria-describedby',
      deleteReason.id,
    );
  });
});
