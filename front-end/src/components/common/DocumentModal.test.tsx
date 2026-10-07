import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentModal from './DocumentModal';
import type { LegalDocument } from '@/types/legal';

const terms: LegalDocument = {
  kind: 'terms',
  version: 'termos-1.0',
  publishedAt: '2026-09-25T00:00:00.000Z',
  content: 'Cláusula 1. Texto dos termos.',
};

// O jsdom não faz layout: `scrollHeight`/`clientHeight` são sempre 0. Aqui o
// texto passa a "ter" 1000px numa caixa de 200px, para existir o que rolar.
function fakeOverflowingText() {
  const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
  const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  return () => {
    scrollHeight.mockRestore();
    clientHeight.mockRestore();
  };
}

afterEach(cleanup);

describe('<DocumentModal />', () => {
  it('mostra título, versão e conteúdo do documento', () => {
    render(<DocumentModal open document={terms} onAccept={() => {}} onDecline={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Termos de uso' })).toBeInTheDocument();
    expect(screen.getByText('Versão termos-1.0')).toBeInTheDocument();
    expect(screen.getByText('Cláusula 1. Texto dos termos.')).toBeInTheDocument();
  });

  it('usa o rótulo do contrato de venda para o outro documento', () => {
    render(
      <DocumentModal
        open
        document={{ ...terms, kind: 'seller-contract' }}
        onAccept={() => {}}
        onDecline={() => {}}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Contrato de venda' })).toBeInTheDocument();
  });

  // Objetivo: garantir o registro (RN-93).
  it('Aceitar emite a versão do documento', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<DocumentModal open document={terms} onAccept={onAccept} onDecline={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Aceitar' }));

    expect(onAccept).toHaveBeenCalledWith('termos-1.0');
  });

  it('Não aceitar, Fechar e ESC emitem onDecline', async () => {
    const user = userEvent.setup();
    const onDecline = vi.fn();
    render(<DocumentModal open document={terms} onAccept={() => {}} onDecline={onDecline} />);

    await user.click(screen.getByRole('button', { name: 'Não aceitar' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await user.keyboard('{Escape}');

    expect(onDecline).toHaveBeenCalledTimes(3);
  });

  it('com requireScrollToEnd, Aceitar só habilita depois de rolar até o fim', () => {
    const restore = fakeOverflowingText();
    try {
      render(
        <DocumentModal
          open
          document={terms}
          requireScrollToEnd
          onAccept={() => {}}
          onDecline={() => {}}
        />,
      );

      const accept = screen.getByRole('button', { name: 'Aceitar' });
      const text = screen.getByRole('document', { name: 'Texto: Termos de uso' });
      expect(accept).toBeDisabled();
      expect(screen.getByText('Role até o fim do documento para aceitar.')).toBeInTheDocument();

      text.scrollTop = 400;
      fireEvent.scroll(text);
      expect(accept).toBeDisabled();

      text.scrollTop = 800;
      fireEvent.scroll(text);
      expect(accept).toBeEnabled();
    } finally {
      restore();
    }
  });

  it('com requireScrollToEnd, texto que cabe sem rolar já libera o Aceitar', () => {
    render(
      <DocumentModal
        open
        document={terms}
        requireScrollToEnd
        onAccept={() => {}}
        onDecline={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeEnabled();
  });
});
