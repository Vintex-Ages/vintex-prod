import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './ToastContext';
import { useToast } from './useToast';

afterEach(() => {
  vi.useRealTimers();
});

function ToastTrigger({
  message,
  kind = 'info',
  durationMs,
}: {
  message: string;
  kind?: 'info' | 'success' | 'error';
  durationMs?: number;
}) {
  const { toast } = useToast();

  return (
    <button
      type="button"
      onClick={() =>
        toast(message, {
          kind,
          durationMs,
        })
      }
    >
      Mostrar toast
    </button>
  );
}

describe('ToastProvider', () => {
  // Objetivo: garantir o ciclo de vida do toast.
  it('renderiza e remove o toast após durationMs', () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <ToastTrigger
          message="Peça adicionada ao carrinho"
          durationMs={1000}
        />
      </ToastProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Mostrar toast',
      }),
    );

    expect(
      screen.getByText('Peça adicionada ao carrinho'),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      screen.queryByText('Peça adicionada ao carrinho'),
    ).not.toBeInTheDocument();
  });

  // Objetivo: garantir a acessibilidade de mensagens de erro.
  it('usa role alert para toast de erro', () => {
    render(
      <ToastProvider>
        <ToastTrigger
          message="Não foi possível concluir a ação"
          kind="error"
        />
      </ToastProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Mostrar toast',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível concluir a ação',
    );
  });

  it('pausa o auto-dismiss no hover e retoma ao sair', () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <ToastTrigger
          message="Toast temporário"
          durationMs={1000}
        />
      </ToastProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Mostrar toast',
      }),
    );

    const toast = screen.getByRole('status');

    act(() => {
      vi.advanceTimersByTime(400);
    });

    fireEvent.mouseEnter(toast);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Toast temporário')).toBeInTheDocument();

    fireEvent.mouseLeave(toast);

    act(() => {
      vi.advanceTimersByTime(599);
    });

    expect(screen.getByText('Toast temporário')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByText('Toast temporário')).not.toBeInTheDocument();
  });

  it('useToast lança erro quando utilizado fora do provider', () => {
    function Consumer() {
      useToast();
      return null;
    }

    expect(() => render(<Consumer />)).toThrow(
      'useToast deve ser utilizado dentro de ToastProvider',
    );
  });
});