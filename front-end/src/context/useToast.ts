import { createContext, useContext } from 'react';
import type { ToastAction, ToastKind } from '@/components/common/Toast';

export type ToastOptions = {
  kind?: ToastKind;
  durationMs?: number;
  action?: ToastAction;
};

export type ToastContextValue = {
  toast: (message: string, options?: ToastOptions) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Retorna a API de avisos transitórios da aplicação.
 *
 * Deve ser utilizado dentro de ToastProvider.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast('Peça adicionada ao carrinho', { kind: 'success' });
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast deve ser utilizado dentro de ToastProvider');
  }

  return context;
}