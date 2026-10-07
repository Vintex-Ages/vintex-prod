import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PriceSuggestion from './PriceSuggestion';

const suggestion = {
  min: 8000,
  max: 12000,
  justification: 'Jaquetas de couro parecidas vendem nessa faixa.',
};

function setup(props: Partial<React.ComponentProps<typeof PriceSuggestion>> = {}) {
  const onRequest = vi.fn();
  const onUse = vi.fn();
  render(<PriceSuggestion state="idle" onRequest={onRequest} onUse={onUse} {...props} />);
  return { onRequest, onUse };
}

describe('PriceSuggestion', () => {
  describe('idle', () => {
    it('mostra só o botão de pedir sugestão', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Sugerir preço com IA' })).toBeInTheDocument();
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('chama onRequest ao clicar no botão', () => {
      const { onRequest } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Sugerir preço com IA' }));
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

  describe('ready', () => {
    it('mostra a faixa, a justificativa e a tag de IA', () => {
      setup({ state: 'ready', suggestion });
      expect(screen.getByText('R$ 80,00 – R$ 120,00')).toBeInTheDocument();
      expect(screen.getByText(suggestion.justification)).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Sugerido pela IA' })).toBeInTheDocument();
    });

    it('chama onUse com a média da faixa ao clicar em "Usar"', () => {
      const { onUse } = setup({ state: 'ready', suggestion });
      fireEvent.click(screen.getByRole('button', { name: 'Usar R$ 100,00' }));
      expect(onUse).toHaveBeenCalledWith(10000);
    });

    it('não mostra alerta quando o preço está dentro da faixa', () => {
      setup({ state: 'ready', suggestion, currentPrice: 10000 });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('não mostra alerta quando ainda não há preço', () => {
      setup({ state: 'ready', suggestion, currentPrice: null });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('mostra alerta quando o preço está abaixo da faixa', () => {
      setup({ state: 'ready', suggestion, currentPrice: 5000 });
      expect(screen.getByRole('status')).toHaveTextContent('abaixo da faixa sugerida');
    });

    it('mostra alerta quando o preço está acima da faixa', () => {
      setup({ state: 'ready', suggestion, currentPrice: 20000 });
      expect(screen.getByRole('status')).toHaveTextContent('acima da faixa sugerida');
    });

    it('o alerta nunca bloqueia: os botões continuam habilitados', () => {
      setup({ state: 'ready', suggestion, currentPrice: 20000 });
      expect(screen.getByRole('button', { name: 'Usar R$ 100,00' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Sugerir preço com IA' })).toBeEnabled();
    });

    it('não mostra nada da sugestão se vier sem dados', () => {
      setup({ state: 'ready' });
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    });
  });

  describe('unavailable', () => {
    it('mostra a mensagem sem estilo de erro e deixa seguir com o preço', () => {
      setup({ state: 'unavailable' });
      expect(
        screen.getByText('Sugestão indisponível agora. Você pode seguir com seu preço'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sugerir preço com IA' })).toBeEnabled();
    });
  });
});