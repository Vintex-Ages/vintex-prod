import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupAddress } from '@/services/cepService';
import { useAddressLookup } from './useAddressLookup';

vi.mock('@/services/cepService', () => ({
  lookupAddress: vi.fn(),
}));

describe('useAddressLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preenche rua, bairro, cidade e UF quando o CEP válido é resolvido', async () => {
    vi.mocked(lookupAddress).mockResolvedValue({
      street: 'Rua Ramiro Barcelos',
      neighborhood: 'Bom Fim',
      city: 'Porto Alegre',
      state: 'RS',
    });

    const onChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ cep }) => useAddressLookup(cep, onChange),
      {
        initialProps: { cep: '' },
      },
    );

    expect(result.current.cepStatus).toBe('idle');

    rerender({ cep: '90035-072' });

    await waitFor(() => {
      expect(result.current.cepStatus).toBe('resolved');
    });

    expect(lookupAddress).toHaveBeenCalledWith('90035072');
    expect(onChange).toHaveBeenCalledWith(
      'street',
      'Rua Ramiro Barcelos',
    );
    expect(onChange).toHaveBeenCalledWith('district', 'Bom Fim');
    expect(onChange).toHaveBeenCalledWith('city', 'Porto Alegre');
    expect(onChange).toHaveBeenCalledWith('state', 'RS');
  });

  it('fica como not_found quando o CEP não existe', async () => {
    vi.mocked(lookupAddress).mockResolvedValue(null);

    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useAddressLookup('99999-999', onChange),
    );

    await waitFor(() => {
      expect(result.current.cepStatus).toBe('not_found');
    });

    expect(lookupAddress).toHaveBeenCalledWith('99999999');
  });

  it('permite preenchimento manual quando a consulta do CEP falha', async () => {
    vi.mocked(lookupAddress).mockRejectedValue(
      new Error('network'),
    );

    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useAddressLookup('90035-072', onChange),
    );

    await waitFor(() => {
      expect(result.current.cepStatus).toBe('error');
    });

    expect(onChange).toHaveBeenCalledWith('street', '');
    expect(onChange).toHaveBeenCalledWith('district', '');
    expect(onChange).toHaveBeenCalledWith('city', '');
    expect(onChange).toHaveBeenCalledWith('state', '');
  });
});