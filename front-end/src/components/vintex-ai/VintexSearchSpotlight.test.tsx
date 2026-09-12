import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VintexSearchSpotlight } from './VintexSearchSpotlight';

afterEach(() => {
  cleanup();
});

describe('VintexSearchSpotlight', () => {
  it('renderiza eyebrow, heading e indicador online por padrão', () => {
    render(<VintexSearchSpotlight />);

    expect(screen.getByText('IA calibrada • Vintage 90s + Alfaiataria')).toBeInTheDocument();
    expect(screen.getByText('O que você procura hoje no RS?')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('esconde o indicador quando isOnline é false', () => {
    render(<VintexSearchSpotlight isOnline={false} />);

    expect(screen.queryByText('Online')).not.toBeInTheDocument();
  });

  it('renderiza um FilterChip por sugestão e preenche a busca ao clicar', () => {
    render(<VintexSearchSpotlight suggestions={['Blazer de lã']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Blazer de lã' }));

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('Blazer de lã');
  });

  it('chama onSubmit com o termo sem espaços nas pontas e limpa o campo', () => {
    const onSubmit = vi.fn();
    render(<VintexSearchSpotlight onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox', { name: 'Buscar' });
    fireEvent.change(input, { target: { value: '  jeans vintage  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar busca' }));

    expect(onSubmit).toHaveBeenCalledWith('jeans vintage');
    expect(input).toHaveValue('');
  });

  it('não chama onSubmit quando o termo é só espaço em branco', () => {
    const onSubmit = vi.fn();
    render(<VintexSearchSpotlight onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar busca' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('não navega sozinho: funciona normalmente sem react-router (nenhum useNavigate)', () => {
    // Se o componente chamasse useNavigate, este render já falharia
    // fora de um <BrowserRouter>. Não falhar aqui é a prova de que ele
    // não navega mais por conta própria.
    expect(() => render(<VintexSearchSpotlight />)).not.toThrow();
  });

  it('não usa nenhuma cor em hex cru nem style inline', () => {
    const { container } = render(<VintexSearchSpotlight />);

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(container.querySelector('[style]')).toBeNull();
  });
});
