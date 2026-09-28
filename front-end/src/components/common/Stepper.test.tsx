import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Stepper from './Stepper';

afterEach(cleanup);

const steps = [
  { id: 'fotos', label: 'Fotos' },
  { id: 'dados', label: 'Dados' },
  { id: 'revisao', label: 'Revisão' },
];

// A variante horizontal é a lista ordenada; a compacta ("2 de 3 · Dados") só
// resume o progresso, então as consultas por etapa ficam restritas à lista.
function getSteps() {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

describe('<Stepper />', () => {
  // Objetivo: garantir os três estados visuais (concluída/atual/futura) por índice.
  it('renderiza as etapas com os estados concluída, atual e futura conforme current', () => {
    render(<Stepper steps={steps} current={1} />);

    const [fotos, dados, revisao] = getSteps();

    expect(fotos).toHaveAttribute('data-state', 'completed');
    expect(dados).toHaveAttribute('data-state', 'current');
    expect(revisao).toHaveAttribute('data-state', 'upcoming');

    // Só a etapa atual é anunciada como tal para leitores de tela.
    expect(within(dados).getByText('Dados').closest('[aria-current="step"]')).not.toBeNull();
    expect(within(fotos).queryByText('Fotos')?.closest('[aria-current]')).toBeNull();
    expect(within(revisao).queryByText('Revisão')?.closest('[aria-current]')).toBeNull();
  });

  // Objetivo: a etapa atual usa o token vermelho-escuro (definido na issue #198).
  it('pinta o marcador da etapa atual com vermelho-escuro', () => {
    render(<Stepper steps={steps} current={1} />);

    const marker = getSteps()[1].querySelector('[aria-hidden="true"]');

    expect(marker).toHaveClass(
      'border-vermelho-escuro',
      'bg-vermelho-escuro',
      'text-branco-quente',
    );
    expect(marker).not.toHaveClass('bg-tinta');
  });

  it('muda os estados quando current muda (componente controlado)', () => {
    const { rerender } = render(<Stepper steps={steps} current={0} />);
    expect(getSteps().map((step) => step.getAttribute('data-state'))).toEqual([
      'current',
      'upcoming',
      'upcoming',
    ]);

    rerender(<Stepper steps={steps} current={2} />);
    expect(getSteps().map((step) => step.getAttribute('data-state'))).toEqual([
      'completed',
      'completed',
      'current',
    ]);
  });

  it('exibe o resumo compacto "2 de 3 · Dados"', () => {
    render(<Stepper steps={steps} current={1} />);

    expect(screen.getByText('2 de 3 · Dados')).toBeInTheDocument();
  });

  // Objetivo: só etapa concluída é navegável; etapa futura não é clicável.
  it('chama onStepSelect ao clicar numa etapa concluída e não chama numa futura', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(<Stepper steps={steps} current={1} onStepSelect={handleSelect} />);

    await user.click(within(screen.getByRole('list')).getByRole('button', { name: /Fotos/ }));
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(0);

    // Futura e atual não viram botão.
    expect(screen.queryByRole('button', { name: /Revisão/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Dados/ })).toBeNull();

    await user.click(within(getSteps()[2]).getByText('Revisão'));
    expect(handleSelect).toHaveBeenCalledTimes(1);
  });

  it('não renderiza botões quando onStepSelect não é informado', () => {
    render(<Stepper steps={steps} current={2} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  // Objetivo: no mobile só existe o resumo compacto, então é ele que oferece o
  // caminho de volta para a etapa concluída mais recente.
  it('oferece no resumo compacto um botão para voltar à etapa concluída mais recente', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(<Stepper steps={steps} current={2} onStepSelect={handleSelect} />);

    await user.click(screen.getByRole('button', { name: 'Voltar para Dados' }));

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(1);
  });

  it('não mostra o botão de voltar no resumo sem onStepSelect ou na primeira etapa', () => {
    const { rerender } = render(<Stepper steps={steps} current={1} />);
    expect(screen.queryByRole('button', { name: /Voltar para/ })).toBeNull();
    expect(screen.getByText('2 de 3 · Dados')).toBeInTheDocument();

    rerender(<Stepper steps={steps} current={0} onStepSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Voltar para/ })).toBeNull();
    expect(screen.getByText('1 de 3 · Fotos')).toBeInTheDocument();
  });
});
