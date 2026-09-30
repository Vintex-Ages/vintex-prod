import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { getSellerContract } from '@/services/legalService';
import type { LegalDocument } from '@/types/legal';
import { useSellerContract } from './useSellerContract';

const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('@/services/legalService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/legalService')>()),
  getSellerContract: vi.fn(),
}));

const CONTRACT: LegalDocument = {
  kind: 'seller-contract',
  version: 'contrato-2.0',
  publishedAt: '2026-09-25T00:00:00.000Z',
  content: 'Cláusulas do contrato.',
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  navigate.mockReset();
  vi.mocked(getSellerContract).mockReset().mockResolvedValue(CONTRACT);
});

describe('useSellerContract', () => {
  it('carrega o contrato e fica pendente até o aceite', async () => {
    const { result } = renderHook(() => useSellerContract(), { wrapper });

    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('pending'));
    expect(result.current.acceptedVersion).toBeUndefined();
  });

  it('aceitar guarda a versão aceita', async () => {
    const { result } = renderHook(() => useSellerContract(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('pending'));

    act(() => result.current.accept('contrato-2.0'));

    expect(result.current.state.status).toBe('accepted');
    expect(result.current.acceptedVersion).toBe('contrato-2.0');
  });

  it('não aceitar navega para a Home', async () => {
    const { result } = renderHook(() => useSellerContract(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('pending'));

    act(() => result.current.decline());

    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('falha ao carregar vira erro, e tentar de novo busca outra vez', async () => {
    vi.mocked(getSellerContract).mockRejectedValueOnce(new Error('fora do ar'));
    const { result } = renderHook(() => useSellerContract(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.state.status).toBe('pending'));
    expect(getSellerContract).toHaveBeenCalledTimes(2);
  });
});
