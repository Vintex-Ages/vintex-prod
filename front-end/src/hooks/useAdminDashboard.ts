import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboard } from '@/services/dashboardService';
import type { AdminDashboard } from '@/types/dashboard';

export type AdminDashboardState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; dashboard: AdminDashboard };

/**
 * Números do painel geral da administradora (FE-US033-1, #413), via
 * `dashboardService.getDashboard`. Os números vêm prontos: o hook não calcula
 * nem reordena nada.
 *
 * - `retry()` busca de novo, passando por `loading`.
 * - Resposta de consulta que ficou velha (ou de tela desmontada) é descartada.
 * - Qualquer falha vira `error`, inclusive o 403: quem não é administradora
 *   nem chega aqui (`RequireRole`).
 *
 * Mesmo padrão de estados do `useAdminReports` e do `useReceiptQueue`.
 *
 * Usage:
 *   const { state, retry } = useAdminDashboard();
 */
export function useAdminDashboard() {
  const [state, setState] = useState<AdminDashboardState>({ status: 'loading' });
  // Só a consulta mais recente escreve.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    setState({ status: 'loading' });

    try {
      const dashboard = await getDashboard();
      if (request === latest.current) setState({ status: 'ready', dashboard });
    } catch {
      if (request === latest.current) setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
    // Desmontou: nenhuma resposta pendente escreve mais.
    return () => {
      latest.current += 1;
    };
  }, [load]);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  return { state, retry };
}
