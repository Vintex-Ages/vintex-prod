import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StarRating from './StarRating';

afterEach(cleanup);

function getStar(score: number) {
  return screen.getByRole('radio', { name: `${score} de 5 estrelas` });
}

// Estrela cheia é a que preenche com o token dourado; a contagem vale para os dois modos.
function countFilledStars(container: HTMLElement) {
  return container.querySelectorAll('path.fill-dourado').length;
}

// WCAG 1.4.11: o contorno é igual em todas as estrelas; só a cheia tem preenchimento.
function expectStarDrawing(svg: Element | null, filled: boolean) {
  const path = svg?.querySelector('path');

  expect(path).toHaveClass('stroke-texto-auxiliar', filled ? 'fill-dourado' : 'fill-none');
  expect(path).not.toHaveClass(filled ? 'fill-none' : 'fill-dourado');
  expect(svg).not.toHaveClass('text-dourado');
  expect(svg).not.toHaveClass('text-linha');
}

describe('<StarRating mode="select" />', () => {
  // Objetivo: o clique devolve a nota da estrela clicada.
  it('chama onChange com a nota da estrela clicada', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<StarRating mode="select" onChange={handleChange} />);

    await user.click(getStar(4));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(4);
  });

  // Objetivo: setas só movem e pré-visualizam; quem confirma é o Enter, e uma vez só.
  it('escolhe com setas e Enter, chamando onChange só na confirmação', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const { container } = render(<StarRating mode="select" onChange={handleChange} />);

    await user.tab();
    expect(getStar(1)).toHaveFocus();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(getStar(3)).toHaveFocus();
    expect(countFilledStars(container)).toBe(3);
    expect(getStar(3)).toHaveAttribute('aria-checked', 'false');
    expect(handleChange).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(3);
    expect(getStar(3)).toHaveAttribute('aria-checked', 'true');
  });

  it('confirma com Espaço, como um radio', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<StarRating mode="select" onChange={handleChange} />);

    await user.tab();
    await user.keyboard('{ArrowDown} ');

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(2);
  });

  it('dá a volta nas pontas com as setas', async () => {
    const user = userEvent.setup();
    render(<StarRating mode="select" onChange={vi.fn()} />);

    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(getStar(5)).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(getStar(1)).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(getStar(5)).toHaveFocus();
  });

  // Objetivo: outras teclas seguem o comportamento normal da página.
  it('ignora teclas que não são setas nem de confirmação', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<StarRating mode="select" onChange={handleChange} />);

    await user.tab();
    await user.keyboard('a');

    expect(getStar(1)).toHaveFocus();
    expect(handleChange).not.toHaveBeenCalled();
  });

  // Objetivo: sair sem confirmar descarta a pré-visualização.
  it('descarta a pré-visualização ao sair do grupo sem confirmar', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const { container } = render(<StarRating mode="select" value={2} onChange={handleChange} />);

    await user.tab();
    expect(getStar(2)).toHaveFocus();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(countFilledStars(container)).toBe(4);

    await user.tab();
    expect(document.body).toHaveFocus();
    expect(countFilledStars(container)).toBe(2);
    expect(getStar(2)).toHaveAttribute('tabindex', '0');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('dá a cada estrela o rótulo "N de 5 estrelas" e nomeia o grupo', () => {
    render(<StarRating mode="select" onChange={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: 'Escolha uma nota' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((star) => star.getAttribute('aria-label'))).toEqual([
      '1 de 5 estrelas',
      '2 de 5 estrelas',
      '3 de 5 estrelas',
      '4 de 5 estrelas',
      '5 de 5 estrelas',
    ]);
  });

  it('aceita outro nome para o grupo', () => {
    render(<StarRating mode="select" onChange={vi.fn()} ariaLabel="Avalie a loja" />);

    expect(screen.getByRole('radiogroup', { name: 'Avalie a loja' })).toBeInTheDocument();
  });

  // Objetivo: só uma estrela na ordem de tabulação (roving) e só ela marcada.
  it('marca o value atual e deixa só ele na ordem de tabulação', () => {
    const { container } = render(<StarRating mode="select" value={3} onChange={vi.fn()} />);

    const stars = screen.getAllByRole('radio');
    expect(stars.map((star) => star.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(stars.map((star) => star.getAttribute('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
      '-1',
      '-1',
    ]);
    expect(countFilledStars(container)).toBe(3);
  });

  // Objetivo: com value informado quem manda é o pai, mesmo depois do clique.
  it('segue o value do pai quando controlado', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StarRating mode="select" value={2} onChange={vi.fn()} />);

    await user.click(getStar(5));
    expect(getStar(2)).toHaveAttribute('aria-checked', 'true');
    expect(getStar(5)).toHaveAttribute('aria-checked', 'false');

    rerender(<StarRating mode="select" value={5} onChange={vi.fn()} />);
    expect(getStar(5)).toHaveAttribute('aria-checked', 'true');
  });

  // Objetivo: sem value o clique ainda precisa aparecer na tela.
  it('guarda a nota escolhida quando não recebe value', async () => {
    const user = userEvent.setup();
    const { container } = render(<StarRating mode="select" onChange={vi.fn()} />);
    expect(countFilledStars(container)).toBe(0);

    await user.click(getStar(4));

    expect(getStar(4)).toHaveAttribute('aria-checked', 'true');
    expect(countFilledStars(container)).toBe(4);
  });

  it.each([0, 6, 2.5, NaN])('trata value %s como nenhuma nota escolhida', (value) => {
    const { container } = render(<StarRating mode="select" value={value} onChange={vi.fn()} />);

    expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(5);
    expect(getStar(1)).toHaveAttribute('tabindex', '0');
    expect(countFilledStars(container)).toBe(0);
  });

  // Objetivo: cores por token e alvo de toque mínimo.
  it('usa os tokens de cor e o alvo de toque mínimo', () => {
    render(<StarRating mode="select" value={1} onChange={vi.fn()} />);

    expect(getStar(1)).toHaveClass(
      'min-h-touch',
      'min-w-touch',
      'focus:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-tinta',
    );
    expect(getStar(1)).not.toHaveClass('focus-visible:ring-vermelho-escuro');
    expectStarDrawing(getStar(1).querySelector('svg'), true);
    expectStarDrawing(getStar(2).querySelector('svg'), false);
  });
});

describe('<StarRating mode="display" />', () => {
  it('mostra a média com uma casa decimal e vírgula, e a contagem', () => {
    render(<StarRating mode="display" average={4.3} count={12} />);

    expect(screen.getByText('4,3')).toBeInTheDocument();
    expect(screen.getByText('12 avaliações')).toBeInTheDocument();
  });

  it.each([
    [4, '4,0'],
    [4.25, '4,3'],
    [3.14159, '3,1'],
  ])('formata a média %s como %s', (average, expected) => {
    render(<StarRating mode="display" average={average} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it.each([
    [0, '0 avaliações'],
    [1, '1 avaliação'],
    [2, '2 avaliações'],
  ])('escreve a contagem %s como "%s"', (count, expected) => {
    render(<StarRating mode="display" average={4.3} count={count} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('dá ao conjunto um rótulo com média e contagem, e esconde as estrelas', () => {
    const { container } = render(<StarRating mode="display" average={4.3} count={12} />);

    expect(
      screen.getByRole('img', { name: 'Média 4,3 de 5 estrelas, 12 avaliações' }),
    ).toBeInTheDocument();

    const stars = container.querySelectorAll('svg');
    expect(stars).toHaveLength(5);
    stars.forEach((star) => expect(star).toHaveAttribute('aria-hidden', 'true'));
  });

  it('omite a contagem do texto e do rótulo quando não é informada', () => {
    render(<StarRating mode="display" average={4.3} />);

    expect(screen.getByRole('img', { name: 'Média 4,3 de 5 estrelas' })).toBeInTheDocument();
    expect(screen.queryByText(/avalia/)).toBeNull();
  });

  it('pinta as estrelas pela média arredondada', () => {
    const { container, rerender } = render(<StarRating mode="display" average={4.3} />);
    expect(countFilledStars(container)).toBe(4);

    rerender(<StarRating mode="display" average={4.5} />);
    expect(countFilledStars(container)).toBe(5);
  });

  // Objetivo: o modo exibir usa o mesmo desenho de estrela do modo escolher.
  it('desenha cheias e vazias com os mesmos tokens do modo select', () => {
    const { container } = render(<StarRating mode="display" average={2} />);

    const stars = container.querySelectorAll('svg');
    expect(stars).toHaveLength(5);
    stars.forEach((star, index) => expectStarDrawing(star, index < 2));
  });

  it('não é interativo', () => {
    render(<StarRating mode="display" average={4.3} count={12} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it.each([
    [7, '5,0', 5],
    [-2, '0,0', 0],
  ])('limita a média %s a 0..5', (average, expected, filled) => {
    const { container } = render(<StarRating mode="display" average={average} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: `Média ${expected} de 5 estrelas` }),
    ).toBeInTheDocument();
    expect(countFilledStars(container)).toBe(filled);
  });

  it.each([NaN, Infinity, -Infinity])('não mostra média quando ela é %s', (average) => {
    const { container } = render(<StarRating mode="display" average={average} count={3} />);

    expect(screen.getByRole('img', { name: 'Média indisponível, 3 avaliações' })).toBeTruthy();
    expect(screen.queryByText(/\d,\d/)).toBeNull();
    expect(container).not.toHaveTextContent(/NaN|Infinity/);
    expect(screen.getByText('3 avaliações')).toBeInTheDocument();
    expect(countFilledStars(container)).toBe(0);
  });

  it.each([-1, 2.5, NaN])('omite a contagem inválida %s', (count) => {
    render(<StarRating mode="display" average={4.3} count={count} />);

    expect(screen.getByRole('img', { name: 'Média 4,3 de 5 estrelas' })).toBeInTheDocument();
    expect(screen.queryByText(/avalia/)).toBeNull();
  });
});

describe('<StarRating /> em qualquer modo', () => {
  // Objetivo: RN-75, avaliação só por estrelas, sem comentário.
  it('não tem campo de texto', () => {
    const { container, rerender } = render(<StarRating mode="select" onChange={vi.fn()} />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(container.querySelector('input, textarea, [contenteditable]')).toBeNull();

    rerender(<StarRating mode="display" average={4.3} count={12} />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(container.querySelector('input, textarea, [contenteditable]')).toBeNull();
  });

  // Objetivo: a união discriminada exige onChange no escolher e average no exibir
  // (quem falha aqui é o tsc, nas diretivas abaixo).
  it('exige onChange no modo select e average no modo display', () => {
    // @ts-expect-error onChange é obrigatório no modo select
    expect(<StarRating mode="select" />).toBeTruthy();
    // @ts-expect-error average é obrigatório no modo display
    expect(<StarRating mode="display" />).toBeTruthy();
    // @ts-expect-error onChange não existe no modo display
    expect(<StarRating mode="display" average={4} onChange={vi.fn()} />).toBeTruthy();
  });
});
