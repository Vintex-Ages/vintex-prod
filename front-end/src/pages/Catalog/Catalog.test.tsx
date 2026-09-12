import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Catalog from './Catalog';
import { search } from '@/services/catalogService';

vi.mock('@/services/catalogService', () => ({
  search: vi.fn(),
}));

const mockResult = {
  match_type: 'exact' as const,
  items: [
    { id: '1', name: 'Camiseta', price: 50, coverImageUrl: null, store: { id: '1', name: 'Loja' } },
  ],
  total: 1,
};

describe('Catalog', () => {
  it('busca produtos ao montar e mostra a contagem', async () => {
    vi.mocked(search).mockResolvedValue(mockResult);

    render(<Catalog />);

    await waitFor(() => {
      expect(screen.getByText('Camiseta')).toBeInTheDocument();
      expect(screen.getByText('1 resultado(s)')).toBeInTheDocument();
    });

    expect(search).toHaveBeenCalledWith('', {});
  });

  it('buscar combina o termo com os filtros ativos, sem descartá-los', async () => {
    vi.mocked(search).mockResolvedValue(mockResult);
    const user = userEvent.setup();

    render(<Catalog />);
    await waitFor(() => expect(search).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Roupas' }));

    await waitFor(() => {
      expect(search).toHaveBeenLastCalledWith('', expect.objectContaining({ category: 'roupas' }));
    });

    const input = screen.getByRole('textbox');
    await user.type(input, 'camiseta{Enter}');

    await waitFor(() => {
      expect(search).toHaveBeenLastCalledWith(
        'camiseta',
        expect.objectContaining({ category: 'roupas' }),
      );
    });
  });
});
