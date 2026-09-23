import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { CepError, lookupAddress } from './cepService';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

const mockedGet = vi.mocked(axios.get);

describe('cepService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolve bairro/cidade/estado para um CEP válido', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { bairro: 'Bom Fim', localidade: 'Porto Alegre', uf: 'RS' },
    });

    const address = await lookupAddress('90035-072');

    expect(mockedGet).toHaveBeenCalledWith('https://viacep.com.br/ws/90035072/json/');
    expect(address).toEqual({ neighborhood: 'Bom Fim', city: 'Porto Alegre', state: 'RS' });
  });

  it('aceita CEP só com dígitos, sem máscara', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { bairro: 'Bom Fim', localidade: 'Porto Alegre', uf: 'RS' },
    });

    await lookupAddress('90035072');

    expect(mockedGet).toHaveBeenCalledWith('https://viacep.com.br/ws/90035072/json/');
  });

  it('retorna null quando o CEP tem formato válido mas não existe', async () => {
    mockedGet.mockResolvedValueOnce({ data: { erro: true } });

    const address = await lookupAddress('00000-000');

    expect(address).toBeNull();
  });

  it('rejeita com CepError para CEP com formato inválido, sem chamar a API', async () => {
    await expect(lookupAddress('123')).rejects.toBeInstanceOf(CepError);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('rejeita com CepError quando a consulta falha (rede/serviço fora)', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network error'));

    await expect(lookupAddress('90035-072')).rejects.toBeInstanceOf(CepError);
  });
});
