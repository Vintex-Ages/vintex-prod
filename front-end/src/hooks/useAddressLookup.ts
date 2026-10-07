import { useEffect, useState } from 'react';
import { lookupAddress } from '@/services/cepService';
import type { StoreAddress } from '@/types/store';

export type CepStatus =
  | 'idle'
  | 'loading'
  | 'resolved'
  | 'not_found'
  | 'error';

type AddressField = keyof StoreAddress;

/**
 * Consulta o endereço quando o CEP possui 8 dígitos.
 *
 * O hook contém somente a regra de consulta do endereço.
 * A apresentação dos campos fica em `AddressFields`.
 *
 * Usage:
 *   const { cepStatus } = useAddressLookup(address.cep, setAddressField);
 */
export function useAddressLookup(
  cep: string,
  onChange: (field: AddressField, value: string) => void,
) {
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');

  const cepDigits = cep.replace(/\D/g, '');

  useEffect(() => {
    if (cepDigits.length !== 8) {
      setCepStatus('idle');
      return;
    }

    let active = true;

    setCepStatus('loading');

    lookupAddress(cepDigits)
      .then((address) => {
        if (!active) {
          return;
        }

        if (!address) {
          setCepStatus('not_found');
          return;
        }

        setCepStatus('resolved');

        onChange('street', address.street);
        onChange('district', address.neighborhood);
        onChange('city', address.city);
        onChange('state', address.state);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setCepStatus('error');

        // Remove dados que possam ter vindo de uma consulta anterior.
        // Assim o usuário pode preencher o endereço manualmente.
        onChange('street', '');
        onChange('district', '');
        onChange('city', '');
        onChange('state', '');
      });

    return () => {
      active = false;
    };
  }, [cepDigits, onChange]);

  return { cepStatus };
}