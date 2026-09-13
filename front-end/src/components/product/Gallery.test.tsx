import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Gallery from './Gallery';
import type { ProductMedia } from '@/types/product';

afterEach(cleanup);

const unordered: ProductMedia[] = [
  { type: 'image', url: 'https://example.com/2.jpg', position: 2 },
  { type: 'image', url: 'https://example.com/0.jpg', position: 0 },
  { type: 'image', url: 'https://example.com/1.jpg', position: 1 },
];

describe('<Gallery />', () => {
  // Objetivo declarado do ticket: garantir a ordem das fotos por `position`.
  it('mostra as fotos na ordem de position, mesmo recebendo media fora de ordem', () => {
    render(<Gallery media={unordered} productName="Camiseta" />);

    expect(screen.getByRole('img', { name: /foto 1 de 3/ })).toHaveAttribute(
      'src',
      'https://example.com/0.jpg',
    );
  });

  // Objetivo declarado do ticket: garantir robustez sem fotos.
  it('usa o placeholder quando a peça não tem media, sem quebrar o layout', () => {
    render(<Gallery media={[]} productName="Camiseta" />);

    expect(screen.getByRole('img', { name: 'Camiseta' })).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('não mostra setas nem miniaturas quando há só uma foto', () => {
    render(
      <Gallery
        media={[{ type: 'image', url: 'https://example.com/0.jpg', position: 0 }]}
        productName="Camiseta"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Próxima foto' })).toBeNull();
    expect(screen.queryByText(/Foto 1 de/)).toBeNull();
  });

  it('clicar numa miniatura troca a foto principal e atualiza o indicador', async () => {
    const user = userEvent.setup();
    render(<Gallery media={unordered} productName="Camiseta" />);

    expect(screen.getByText('Foto 1 de 3')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Ver foto 3 de 3' }));

    expect(screen.getByText('Foto 3 de 3')).toBeTruthy();
    expect(screen.getByRole('img', { name: /foto 3 de 3/ })).toHaveAttribute(
      'src',
      'https://example.com/2.jpg',
    );
  });

  it('a seta "próxima" avança e dá a volta da última pra primeira foto', async () => {
    const user = userEvent.setup();
    render(<Gallery media={unordered} productName="Camiseta" />);

    const next = screen.getByRole('button', { name: 'Próxima foto' });
    await user.click(next);
    await user.click(next);
    expect(screen.getByText('Foto 3 de 3')).toBeTruthy();

    await user.click(next);
    expect(screen.getByText('Foto 1 de 3')).toBeTruthy();
  });

  it('a seta "anterior" dá a volta da primeira pra última foto', async () => {
    const user = userEvent.setup();
    render(<Gallery media={unordered} productName="Camiseta" />);

    await user.click(screen.getByRole('button', { name: 'Foto anterior' }));

    expect(screen.getByText('Foto 3 de 3')).toBeTruthy();
  });

  // Objetivo declarado do ticket (FE-US012-3): com mídia de vídeo, exibe o player.
  it('mídia de vídeo entra na trilha sem quebrar: vira principal com controles e a miniatura mostra o ícone de play', async () => {
    const user = userEvent.setup();
    const media: ProductMedia[] = [
      { type: 'image', url: 'https://example.com/0.jpg', position: 0 },
      { type: 'video', url: 'https://example.com/0.mp4', position: 1 },
    ];
    render(<Gallery media={media} productName="Camiseta" />);

    await user.click(screen.getByRole('button', { name: 'Ver vídeo 2 de 2' }));

    const video = screen.getByLabelText('Camiseta — vídeo 2 de 2');
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('src', 'https://example.com/0.mp4');
  });

  // Objetivo declarado do ticket (FE-US012-3): sem vídeo, galeria só com fotos, sem espaço quebrado.
  it('sem vídeo na lista, mostra só as fotos — sem <video> nem miniatura de vídeo', () => {
    render(<Gallery media={unordered} productName="Camiseta" />);

    expect(document.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: /vídeo/ })).toBeNull();
  });

  // Critério de aceite da FE-US012-3: o player respeita a ordem de position, mesmo
  // recebendo o vídeo fora de ordem (misturado com fotos) na lista de media.
  it('o vídeo entra na posição certa da trilha, respeitando position mesmo fora de ordem', () => {
    const mixed: ProductMedia[] = [
      { type: 'image', url: 'https://example.com/1.jpg', position: 1 },
      { type: 'video', url: 'https://example.com/0.mp4', position: 0 },
      { type: 'image', url: 'https://example.com/2.jpg', position: 2 },
    ];
    render(<Gallery media={mixed} productName="Camiseta" />);

    // position 0 é o vídeo: a galeria abre com ele como mídia principal.
    expect(screen.getByLabelText('Camiseta — vídeo 1 de 3')).toBeTruthy();

    const thumbnails = screen.getAllByRole('button', { name: /Ver (foto|vídeo) \d de 3/ });
    expect(thumbnails.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Ver vídeo 1 de 3',
      'Ver foto 2 de 3',
      'Ver foto 3 de 3',
    ]);
  });
});
