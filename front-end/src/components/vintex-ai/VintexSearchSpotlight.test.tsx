import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VintexSearchSpotlight } from './VintexSearchSpotlight';

afterEach(() => {
  cleanup();
});

describe('VintexSearchSpotlight', () => {
  it('renderiza no tamanho default por padrão (heading text-h2)', () => {
    render(<VintexSearchSpotlight />);

    const heading = screen.getByRole('heading', { name: 'O que você procura hoje no RS?' });
    expect(heading).toHaveClass('text-h2');
    expect(heading).not.toHaveClass('text-h3');
  });

  it('size="compact" reduz o heading para text-h3 e o padding interno', () => {
    render(<VintexSearchSpotlight size="compact" heading="Prefere descrever o que procura?" />);

    const heading = screen.getByRole('heading', { name: 'Prefere descrever o que procura?' });
    expect(heading).toHaveClass('text-h3');
    expect(heading).not.toHaveClass('text-h2');
  });

  it('continua chamando onSubmit com o termo, no tamanho compacto', () => {
    const onSubmit = vi.fn();
    render(<VintexSearchSpotlight size="compact" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'jaqueta jeans' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).toHaveBeenCalledWith('jaqueta jeans');
  });

  it('clicar num chip de sugestão preenche o campo de busca', () => {
    render(<VintexSearchSpotlight suggestions={['Blazer de lã']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Blazer de lã' }));

    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('Blazer de lã');
  });

  it('não chama onSubmit quando o termo é só espaço em branco', () => {
    const onSubmit = vi.fn();
    render(<VintexSearchSpotlight onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('com eyebrow vazio (uso real da Home/Catálogo), não renderiza texto de eyebrow', () => {
    render(<VintexSearchSpotlight eyebrow="" isOnline />);

    // O indicador "Online" continua aparecendo (isOnline=true); só o texto
    // do eyebrow que deve estar ausente, já que eyebrow="" é falsy.
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.queryByText('IA calibrada • Vintage 90s + Alfaiataria')).not.toBeInTheDocument();
  });

  it('com eyebrow e isOnline ambos ausentes, não renderiza a linha de cima', () => {
    const { container } = render(<VintexSearchSpotlight eyebrow="" isOnline={false} />);

    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    // Nem o <p> do eyebrow nem o <span/> vazio do "sem eyebrow" devem existir:
    // a linha inteira (eyebrow || isOnline) fica de fora quando os dois faltam.
    expect(container.querySelector('.mb-3, .mb-5')).not.toBeInTheDocument();
  });

  it('com eyebrow preenchido e isOnline=false, mostra só o eyebrow', () => {
    render(<VintexSearchSpotlight eyebrow="Testando combinação" isOnline={false} />);

    expect(screen.getByText('Testando combinação')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
  });

  it('com suggestions vazio (uso real do Catálogo), não renderiza nenhum chip', () => {
    render(<VintexSearchSpotlight suggestions={[]} />);

    expect(
      screen.queryAllByRole('button').filter((btn) => btn.getAttribute('type') !== 'submit'),
    ).toHaveLength(0);
  });

  it('não usa nenhuma cor em hex cru em nenhum dos dois tamanhos', () => {
    const { container: defaultContainer } = render(<VintexSearchSpotlight />);
    expect(defaultContainer.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    cleanup();

    const { container: compactContainer } = render(<VintexSearchSpotlight size="compact" />);
    expect(compactContainer.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});