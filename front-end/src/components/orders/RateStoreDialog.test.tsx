import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { rateStore, StoreError } from '@/services/storeService';
import RateStoreDialog from './RateStoreDialog';

vi.mock('@/services/storeService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storeService')>()),
  rateStore: vi.fn(),
}));

/** "Avaliar loja" no Pedido concluído (FE-US026-1, #409; RN-75/RN-76). */

const STORE = { id: '5', name: 'Baú da Vó Nair' };

const RATING = {
  id: 'r_1',
  storeId: '5',
  orderId: 'ped-1',
  score: 4,
  createdAt: '2026-11-15T12:00:00Z',
};

function renderDialog() {
  const onRated = vi.fn();
  const onClose = vi.fn();
  render(
    <RateStoreDialog open orderId="ped-1" store={STORE} onRated={onRated} onClose={onClose} />,
  );
  return { onRated, onClose };
}

function estrela(nota: number) {
  return screen.getByRole('radio', { name: `${nota} de 5 estrelas` });
}

function enviar() {
  return screen.getByRole('button', { name: 'Enviar avaliação' });
}

beforeEach(() => {
  vi.mocked(rateStore).mockReset();
});

afterEach(cleanup);

describe('<RateStoreDialog />', () => {
  // RN-75: só estrelas de 1 a 5, sem comentário.
  it('oferece só as cinco estrelas, sem campo de texto', () => {
    renderDialog();

    expect(
      screen.getByRole('radiogroup', { name: 'Nota para a loja Baú da Vó Nair' }),
    ).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('"Enviar avaliação" só habilita depois de escolher a nota', () => {
    renderDialog();

    expect(enviar()).toBeDisabled();
    expect(enviar()).toHaveAccessibleDescription('Escolha de 1 a 5 estrelas.');

    fireEvent.click(estrela(4));

    expect(enviar()).toBeEnabled();
  });

  it('envia só a nota e mostra a confirmação', async () => {
    vi.mocked(rateStore).mockResolvedValue(RATING);
    const { onRated } = renderDialog();

    fireEvent.click(estrela(4));
    fireEvent.click(enviar());

    expect(await screen.findByRole('status')).toHaveTextContent('Avaliação enviada');
    expect(rateStore).toHaveBeenCalledWith('5', 'ped-1', 4);
    expect(onRated).toHaveBeenCalledWith('ped-1');
    // O botão de envio sumiu: o foco vai para "Entendi" e não escapa do diálogo.
    expect(screen.getByRole('button', { name: 'Entendi' })).toHaveFocus();
  });

  it('409 ALREADY_RATED é "já avaliado", não erro', async () => {
    vi.mocked(rateStore).mockRejectedValue(
      new StoreError('ALREADY_RATED', 'Este pedido já foi avaliado.'),
    );
    const { onRated } = renderDialog();

    fireEvent.click(estrela(5));
    fireEvent.click(enviar());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Você já avaliou a loja neste pedido.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onRated).toHaveBeenCalledWith('ped-1');
  });

  it('403 RATING_NOT_ALLOWED mostra a mensagem do back e mantém a nota', async () => {
    vi.mocked(rateStore).mockRejectedValue(
      new StoreError('RATING_NOT_ALLOWED', 'Só quem recebeu um pedido desta loja pode avaliá-la.'),
    );
    const { onRated } = renderDialog();

    fireEvent.click(estrela(3));
    fireEvent.click(enviar());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Só quem recebeu um pedido desta loja pode avaliá-la.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(estrela(3)).toBeChecked();
    expect(enviar()).toBeEnabled();
    expect(onRated).not.toHaveBeenCalled();
  });

  it('falha de rede mostra a mensagem genérica', async () => {
    vi.mocked(rateStore).mockRejectedValue(
      new StoreError('INTERNAL_ERROR', 'Erro ao consultar loja.'),
    );
    renderDialog();

    fireEvent.click(estrela(2));
    fireEvent.click(enviar());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível enviar a avaliação. Tente de novo.',
    );
  });

  it('"Cancelar" fecha sem enviar', () => {
    const { onClose } = renderDialog();

    fireEvent.click(estrela(4));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalled();
    expect(rateStore).not.toHaveBeenCalled();
  });
});
