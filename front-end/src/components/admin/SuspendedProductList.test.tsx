import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SuspendedProduct } from '@/types/adminModeration';
import { SuspendedProductList } from './SuspendedProductList';

// RED #414: contrato de apresentação proposto; nenhum componente vazio é criado.
function product(id: string, overrides: Partial<SuspendedProduct> = {}): SuspendedProduct {
  return {
    id,
    name: `Jaqueta ${id}`,
    price: 90,
    status: 'despublicado',
    coverImageUrl: `/images/products/jaqueta-${id}.jpg`,
    store: { id: `store-${id}`, name: `Brechó ${id}` },
    moderationReason: `Motivo ${id}`,
    moderatedAt: '2026-11-14T12:30:00Z',
    moderatedBy: { id: 'internal-admin', name: 'Autora interna' },
    ...overrides,
  };
}

function renderList(
  items: SuspendedProduct[],
  restoringIds = new Set<string>(),
  restoreErrors: Record<string, string> = {},
) {
  const onRestore = vi.fn();
  render(
    <SuspendedProductList
      items={items}
      restoringIds={restoringIds}
      restoreErrors={restoreErrors}
      onRestore={onRestore}
    />,
  );
  return { onRestore };
}

afterEach(cleanup);

describe('SuspendedProductList — RED #414', () => {
  it('mantém a ordem recebida e apresenta foto, nome, brechó, motivo, data e ação', () => {
    renderList([product('2'), product('1')]);
    const rows = within(screen.getByRole('list', { name: /suspens/i })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('heading', { name: 'Jaqueta 2' })).toBeInTheDocument();
    expect(within(rows[1]).getByRole('heading', { name: 'Jaqueta 1' })).toBeInTheDocument();
    const row = within(rows[0]);
    expect(row.getByRole('img', { name: 'Jaqueta 2' })).toHaveAttribute(
      'src',
      '/images/products/jaqueta-2.jpg',
    );
    expect(row.getByText('Brechó 2')).toBeInTheDocument();
    expect(row.getByText('Motivo 2')).toBeInTheDocument();
    expect(row.getByText('Suspensa', { exact: true })).toBeInTheDocument();
    const time = rows[0].querySelector('time');
    expect(time).not.toBeNull();
    expect(time).toHaveTextContent(/14\/11\/2026/);
    expect(row.getByRole('button', { name: 'Restaurar anúncio' })).toBeInTheDocument();
    expect(screen.queryByText(/Autora interna|internal-admin|R\$|Pausada/)).not.toBeInTheDocument();
  });

  it('aceita UTC sem sufixo e timestamp com offset para o mesmo instante', () => {
    renderList([
      product('1', { moderatedAt: '2026-11-14T01:30:00' }),
      product('2', { moderatedAt: '2026-11-13T22:30:00-03:00' }),
    ]);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].querySelector('time')?.textContent).toBe(
      rows[1].querySelector('time')?.textContent,
    );
  });

  it('motivo, data e autor ausentes recebem fallbacks sem fabricar metadados', () => {
    renderList([
      product('1', { moderationReason: undefined, moderatedAt: undefined, moderatedBy: undefined }),
    ]);
    expect(screen.getByText('Motivo não informado')).toBeInTheDocument();
    expect(screen.getByText('Data da moderação não informada')).toBeInTheDocument();
    expect(screen.getByRole('listitem').querySelector('time')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restaurar anúncio' })).toBeEnabled();
  });

  it('data inválida usa fallback sem mostrar Invalid Date ou a data atual', () => {
    renderList([product('1', { moderatedAt: 'data-inválida' })]);
    expect(screen.getByText('Data da moderação não informada')).toBeInTheDocument();
    expect(screen.getByRole('listitem').querySelector('time')).toBeNull();
    expect(screen.queryByText(/Invalid Date|NaN/)).not.toBeInTheDocument();
  });

  it('sem foto usa placeholder acessível', () => {
    renderList([product('1', { coverImageUrl: null })]);
    const image = screen.getByRole('img', { name: 'Jaqueta 1' });
    expect(image).not.toHaveAttribute('src');
    expect(screen.getByRole('button', { name: 'Restaurar anúncio' })).toBeEnabled();
  });

  it('foto quebrada troca para placeholder sem perder o cartão', () => {
    renderList([product('1')]);
    fireEvent.error(screen.getByRole('img', { name: 'Jaqueta 1' }));
    expect(screen.getByRole('img', { name: 'Jaqueta 1' })).not.toHaveAttribute('src');
    expect(screen.getByText('Brechó 1')).toBeInTheDocument();
  });

  it('texto do motivo é exibido como texto, sem executar HTML', () => {
    const reason = '<script>alert(1)</script><b>Motivo</b>';
    const { container } = render(
      <SuspendedProductList
        items={[product('1', { moderationReason: reason })]}
        restoringIds={new Set<string>()}
        restoreErrors={{}}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(container.querySelector('script, b')).toBeNull();
  });

  it('restaurar por teclado comunica somente o ID do cartão acionado', async () => {
    const { onRestore } = renderList([product('1'), product('2')]);
    const button = within(screen.getAllByRole('listitem')[1]).getByRole('button', {
      name: 'Restaurar anúncio',
    });
    button.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(onRestore).toHaveBeenCalledExactlyOnceWith('2');
  });

  it('carregamento é específico do item e bloqueia seu botão', () => {
    const { onRestore } = renderList([product('1'), product('2')], new Set(['1']));
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first).getByRole('button', { name: /restaurando/i })).toBeDisabled();
    expect(first).toHaveAttribute('aria-busy', 'true');
    expect(within(second).getByRole('button', { name: 'Restaurar anúncio' })).toBeEnabled();
    fireEvent.click(within(first).getByRole('button', { name: /restaurando/i }));
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('falha é anunciada no cartão certo e mantém nova tentativa disponível', () => {
    renderList([product('1'), product('2')], new Set(), {
      '1': 'A peça precisa de ao menos uma foto.',
    });
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first).getByRole('alert')).toHaveTextContent(/ao menos uma foto/);
    expect(within(first).getByRole('button', { name: 'Restaurar anúncio' })).toBeEnabled();
    expect(within(second).queryByRole('alert')).not.toBeInTheDocument();
  });
});
