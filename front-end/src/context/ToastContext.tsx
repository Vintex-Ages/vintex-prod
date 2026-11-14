import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Toast, { type ToastAction, type ToastKind } from '@/components/common/Toast';
import { ToastContext, type ToastContextValue, type ToastOptions } from './useToast';

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
  durationMs: number;
  action?: ToastAction;
};

type TimerState = {
  timeoutId: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  remainingMs: number;
};

const DEFAULT_DURATION_MS = 5000;

/**
 * Disponibiliza avisos transitórios para toda a aplicação.
 *
 * Mantém a lista de toasts e controla o tempo de exibição de cada aviso.
 * O temporizador é pausado enquanto o usuário mantém o mouse ou
 * o foco sobre um toast.
 *
 * Usage:
 *   <ToastProvider>
 *     <AppRoutes />
 *   </ToastProvider>
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, TimerState>());

  const removeToast = useCallback((id: number) => {
    const timer = timers.current.get(id);

    if (timer?.timeoutId) {
      clearTimeout(timer.timeoutId);
    }

    timers.current.delete(id);

    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const startTimer = useCallback(
    (id: number, durationMs: number) => {
      const timeoutId = setTimeout(() => {
        removeToast(id);
      }, durationMs);

      timers.current.set(id, {
        timeoutId,
        startedAt: Date.now(),
        remainingMs: durationMs,
      });
    },
    [removeToast],
  );

  const pauseToast = useCallback((id: number) => {
    const timer = timers.current.get(id);

    if (!timer || timer.timeoutId === null) {
      return;
    }

    clearTimeout(timer.timeoutId);

    const elapsed = Date.now() - timer.startedAt;

    timers.current.set(id, {
      timeoutId: null,
      startedAt: timer.startedAt,
      remainingMs: Math.max(0, timer.remainingMs - elapsed),
    });
  }, []);

  const resumeToast = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);

      if (!timer || timer.timeoutId !== null) {
        return;
      }

      startTimer(id, timer.remainingMs);
    },
    [startTimer],
  );

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current;
      nextId.current += 1;

      const item: ToastItem = {
        id,
        message,
        kind: options.kind ?? 'info',
        durationMs: options.durationMs ?? DEFAULT_DURATION_MS,
        action: options.action,
      };

      setToasts((current) => [...current, item]);
      startTimer(id, item.durationMs);
    },
    [startTimer],
  );

  useEffect(() => {
    const activeTimers = timers.current;

    return () => {
      activeTimers.forEach((timer) => {
        if (timer.timeoutId) {
          clearTimeout(timer.timeoutId);
        }
      });

      activeTimers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col gap-2 web:inset-x-auto web:bottom-auto web:right-6 web:top-6 web:w-full web:max-w-md"
        aria-label="Notificações"
      >
        {toasts.map((item) => (
          <div key={item.id} className="pointer-events-auto motion-reduce:transition-none">
            <Toast
              message={item.message}
              kind={item.kind}
              action={item.action}
              onClose={() => removeToast(item.id)}
              onPause={() => pauseToast(item.id)}
              onResume={() => resumeToast(item.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
