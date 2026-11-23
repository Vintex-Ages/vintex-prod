import { useEffect, useState } from 'react';
import { listReceipts } from '@/services/adminReceiptService';

/**
 * Quantos comprovantes esperam análise (RN-21), ou `null` enquanto carrega ou
 * se a consulta falhar.
 *
 * Usage:
 *   const pending = usePendingReceipts();
 */
export function usePendingReceipts(): number | null {
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    listReceipts({ status: 'pendente' })
      .then(({ total }) => {
        if (active) setPending(total);
      })
      .catch(() => {
        // Sem a contagem, o painel mostra só os atalhos.
      });
    return () => {
      active = false;
    };
  }, []);

  return pending;
}
