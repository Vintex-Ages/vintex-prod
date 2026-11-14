import type { CepStatus } from '@/hooks/useAddressLookup';
import { onlyDigits } from '@/utils/document';

/**
 * Validação do endereço da loja, a mesma na criação (`useCreateStore`, #212) e
 * na edição (`useEditStore`, #335). Só as chaves com mensagem voltam: `{}` quer
 * dizer endereço válido.
 *
 * Usage:
 *   const errors = validateStoreAddress(values, cepStatus);
 */

export const CEP_NOT_FOUND_MESSAGE = 'CEP não encontrado.';

export type StoreAddressField = 'cep' | 'street' | 'number' | 'district' | 'city' | 'state';

export interface StoreAddressValues {
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string | null;
}

function required(value: string | null, message: string): string | undefined {
  return value?.trim() ? undefined : message;
}

export function validateStoreAddress(
  address: StoreAddressValues,
  cepStatus: CepStatus,
): Partial<Record<StoreAddressField, string>> {
  const errors: Partial<Record<StoreAddressField, string>> = {
    cep:
      onlyDigits(address.cep).length !== 8
        ? 'Informe um CEP válido.'
        : cepStatus === 'not_found'
          ? CEP_NOT_FOUND_MESSAGE
          : cepStatus === 'loading'
            ? 'Aguarde a busca do CEP.'
            : undefined,
    street: required(address.street, 'Informe a rua.'),
    number: required(address.number, 'Informe o número.'),
    district: required(address.district, 'Informe o bairro.'),
    city: required(address.city, 'Informe a cidade.'),
    state: required(address.state, 'Selecione a UF.'),
  };

  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined),
  ) as Partial<Record<StoreAddressField, string>>;
}
