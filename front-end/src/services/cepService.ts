import axios from 'axios';

/**
 * Busca de endereço por CEP (FE-US002-1) — usa a API pública do ViaCEP
 * diretamente, sem passar pelo `httpClient` do back (não é o mesmo domínio,
 * não leva `Authorization`). Endereço resolvido é só para exibição na tela de
 * cadastro; não faz parte do `RegisterInput` enviado ao backend.
 *
 * Usage:
 *   import { lookupAddress, CepError } from '@/services/cepService';
 *   try {
 *     const address = await lookupAddress('90035-072');
 *     if (address) setEndereco(address); // { neighborhood, city, state }
 *     else setErro('CEP não encontrado.');
 *   } catch (error) {
 *     if (error instanceof CepError) setErro(error.message);
 *   }
 */

export interface CepAddress {
  neighborhood: string;
  city: string;
  state: string;
}

interface ViaCepResponse {
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

const CEP_DIGITS = /^\d{8}$/;

export class CepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CepError';
  }
}

/**
 * Resolve um CEP em bairro/cidade/estado. `null` quando o CEP tem formato
 * válido mas não existe (ViaCEP devolve `{ erro: true }` com status 200).
 * Lança `CepError` para formato inválido ou falha de rede/serviço.
 */
export async function lookupAddress(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, '');
  if (!CEP_DIGITS.test(digits)) {
    throw new CepError('CEP inválido — informe os 8 dígitos.');
  }

  let data: ViaCepResponse;
  try {
    const response = await axios.get<ViaCepResponse>(`https://viacep.com.br/ws/${digits}/json/`);
    data = response.data;
  } catch {
    throw new CepError('Não foi possível consultar o CEP agora. Tente novamente.');
  }

  if (data.erro) {
    return null;
  }

  return { neighborhood: data.bairro, city: data.localidade, state: data.uf };
}
