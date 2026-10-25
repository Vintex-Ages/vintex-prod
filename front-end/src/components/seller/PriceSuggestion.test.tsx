import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PriceSuggestion from './PriceSuggestion';

const suggestion = {
  min: 80,
  max: 120,
  justification: 'Jaquetas de couro parecidas vendem nessa faixa.',
  basedOn: 12,
};

const noBasis = {
  min: null,
  max: null,
  justification: 'Ainda não há peças parecidas suficientes para sugerir uma faixa.',
  basedOn: 2,
};

function setup(props: Partial<React.ComponentProps<typeof PriceSuggestion>> = {}) {
  const onRequest = vi.fn();
  const onUse = vi.fn();
  render(<PriceSuggestion state="idle" onRequest={onRequest} onUse={onUse} {...props} />);
  return { onRequest, onUse };
}

describe('PriceSuggestion', () => {
  describe('idle', () => {
    it('mostra só o botão de pedir sugestão, sem citar IA', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Sugerir preço' })).toBeInTheDocument();
      expect(screen.queryByText(/\bIA\b/)).not.toBeInTheDocument();
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('chama onRequest ao clicar no botão', () => {
      const { onRequest } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Sugerir preço' }));
      expect(onRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading', () => {
    it('desabilita o botão e mostra o indicador de carregamento', () => {
      const { onRequest } = setup({ state: 'loading' });
      const button = screen.getByRole('button', { name: 'Buscando sugestão…' });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onRequest).not.toHaveBeenCalled();
    });
  });

  describe('ready, com faixa', () => {
    it('mostra a faixa e a justificativa, sem a tag de IA', () => {
      setup({ state: 'ready', suggestion });
      expect(screen.getByText('R$ 80,00 – R$ 120,00')).toBeInTheDocument();
      expect(screen.getByText(suggestion.justification)).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Sugerido pela IA' })).not.toBeInTheDocument();
      expect(screen.queryByText(/\bIA\b/)).not.toBeInTheDocument();
    });

    it('mostra com base em quantas peças a faixa foi calculada', () => {
      setup({ state: 'ready', suggestion });
      expect(screen.getByText('com base em 12 peças parecidas')).toBeInTheDocument();
    });

    it('usa o singular com uma peça', () => {
      setup({ state: 'ready', suggestion: { ...suggestion, basedOn: 1 } });
      expect(screen.getByText('com base em 1 peça parecida')).toBeInTheDocument();
    });

    it('chama onUse com a média da faixa, em reais, ao clicar em "Usar"', () => {
      const { onUse } = setup({ state: 'ready', suggestion });
      fireEvent.click(screen.getByRole('button', { name: 'Usar R$ 100,00' }));
      expect(onUse).toHaveBeenCalledWith(100);
    });

    it('não mostra alerta quando o preço está dentro da faixa', () => {
      setup({ state: 'ready', suggestion, currentPrice: 100 });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('não mostra alerta quando ainda não há preço', () => {
      setup({ state: 'ready', suggestion, currentPrice: null });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('mostra alerta quando o preço está abaixo da faixa', () => {
      setup({ state: 'ready', suggestion, currentPrice: 50 });
      expect(screen.getByRole('status')).toHaveTextContent('abaixo da faixa sugerida');
    });

    it('mostra alerta quando o preço está acima da faixa', () => {
      setup({ state: 'ready', suggestion, currentPrice: 200 });
      expect(screen.getByRole('status')).toHaveTextContent('acima da faixa sugerida');
    });

    it('o alerta nunca bloqueia: os botões continuam habilitados', () => {
      setup({ state: 'ready', suggestion, currentPrice: 200 });
      expect(screen.getByRole('button', { name: 'Usar R$ 100,00' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Sugerir preço' })).toBeEnabled();
    });

    it('não mostra nada da sugestão se vier sem dados', () => {
      setup({ state: 'ready' });
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    });
  });

  describe('ready, sem base', () => {
    it('mostra só a justificativa: não inventa número', () => {
      setup({ state: 'ready', suggestion: noBasis });
      expect(screen.getByText(noBasis.justification)).toBeInTheDocument();
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
      expect(screen.queryByText(/com base em/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Usar/ })).not.toBeInTheDocument();
    });

    it('não mostra alerta de preço fora da faixa, mesmo com preço digitado', () => {
      setup({ state: 'ready', suggestion: noBasis, currentPrice: 50 });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('trata faixa pela metade (só um limite nulo) como sem base', () => {
      setup({ state: 'ready', suggestion: { ...noBasis, max: 120 }, currentPrice: 500 });
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Usar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('continua deixando pedir uma nova sugestão', () => {
      const { onRequest } = setup({ state: 'ready', suggestion: noBasis });
      fireEvent.click(screen.getByRole('button', { name: 'Sugerir preço' }));
      expect(onRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('unavailable', () => {
    it('mostra a mensagem sem estilo de erro e deixa seguir com o preço', () => {
      setup({ state: 'unavailable' });
      expect(
        screen.getByText('Sugestão indisponível agora. Você pode seguir com o seu preço.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sugerir preço' })).toBeEnabled();
    });
  });
});
