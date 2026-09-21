import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaUploader, { type MediaItem } from './MediaUploader';

const createObjectURLMock = vi.fn((file: File) => `blob:${file.name}`);
const randomUUIDMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  let uuid = 0;

  randomUUIDMock.mockImplementation(() => {
    uuid += 1;
    return `media-${uuid}`;
  });

  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: createObjectURLMock,
  });

  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: randomUUIDMock,
  });
});

describe('MediaUploader', () => {
  it('soltar 2 arquivos emite onChange com 2 itens ordenados', () => {
    const onChange = vi.fn();
    const firstFile = new File(['foto-1'], 'foto-1.jpg', { type: 'image/jpeg' });
    const secondFile = new File(['foto-2'], 'foto-2.png', { type: 'image/png' });

    render(<MediaUploader id="fotos" label="Fotos da peça" value={[]} onChange={onChange} />);

    const dropzone = screen.getByRole('button', { name: /arraste arquivos para cá/i });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [firstFile, secondFile],
      },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'media-1',
        file: firstFile,
        url: 'blob:foto-1.jpg',
        type: 'image',
        position: 0,
      }),
      expect.objectContaining({
        id: 'media-2',
        file: secondFile,
        url: 'blob:foto-2.png',
        type: 'image',
        position: 1,
      }),
    ]);
  });

  it('selecionar arquivos pelo input emite os novos itens', () => {
    const onChange = vi.fn();
    const file = new File(['foto'], 'foto.jpg', { type: 'image/jpeg' });

    render(<MediaUploader id="fotos" label="Fotos da peça" value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Fotos da peça'), {
      target: {
        files: [file],
      },
    });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'media-1',
        file,
        url: 'blob:foto.jpg',
        type: 'image',
        position: 0,
      }),
    ]);
  });

  it('aceita vídeo e cria item com o tipo video', () => {
    const onChange = vi.fn();
    const video = new File(['video'], 'video.mp4', { type: 'video/mp4' });

    render(<MediaUploader id="midia" label="Mídia" value={[]} onChange={onChange} />);

    fireEvent.drop(screen.getByRole('button', { name: /arraste arquivos para cá/i }), {
      dataTransfer: {
        files: [video],
      },
    });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        file: video,
        url: 'blob:video.mp4',
        type: 'video',
        position: 0,
      }),
    ]);
  });

  it('mover o segundo item para primeiro troca as posições e a capa', () => {
    const onChange = vi.fn();

    const items: MediaItem[] = [
      {
        id: 'foto-1',
        url: 'foto-1.jpg',
        type: 'image',
        position: 0,
      },
      {
        id: 'foto-2',
        url: 'foto-2.jpg',
        type: 'image',
        position: 1,
      },
    ];

    const { rerender } = render(
      <MediaUploader id="fotos" label="Fotos da peça" value={items} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mover mídia 2 para a esquerda' }));

    expect(onChange).toHaveBeenCalledTimes(1);

    const reorderedItems = onChange.mock.calls[0][0] as MediaItem[];

    expect(reorderedItems).toEqual([
      expect.objectContaining({
        id: 'foto-2',
        position: 0,
      }),
      expect.objectContaining({
        id: 'foto-1',
        position: 1,
      }),
    ]);

    rerender(
      <MediaUploader id="fotos" label="Fotos da peça" value={reorderedItems} onChange={onChange} />,
    );

    const previews = screen.getAllByRole('img');

    expect(previews[0]).toHaveAttribute('src', 'foto-2.jpg');
    expect(screen.getByText('Capa')).toBeInTheDocument();
  });

  it('move o primeiro item para a direita', () => {
    const onChange = vi.fn();

    const items: MediaItem[] = [
      {
        id: 'foto-1',
        url: 'foto-1.jpg',
        type: 'image',
        position: 0,
      },
      {
        id: 'foto-2',
        url: 'foto-2.jpg',
        type: 'image',
        position: 1,
      },
    ];

    render(<MediaUploader id="fotos" label="Fotos da peça" value={items} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mover mídia 1 para a direita' }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'foto-2',
        position: 0,
      }),
      expect.objectContaining({
        id: 'foto-1',
        position: 1,
      }),
    ]);
  });

  it('single com um novo arquivo substitui o item anterior', () => {
    const onChange = vi.fn();

    const currentItem: MediaItem = {
      id: 'logo-antigo',
      url: 'logo-antigo.jpg',
      type: 'image',
      position: 0,
    };

    const newFile = new File(['logo-novo'], 'logo-novo.png', {
      type: 'image/png',
    });

    render(
      <MediaUploader
        id="logo"
        label="Logo da loja"
        value={[currentItem]}
        onChange={onChange}
        single
      />,
    );

    fireEvent.change(screen.getByLabelText('Logo da loja'), {
      target: {
        files: [newFile],
      },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'media-1',
        file: newFile,
        url: 'blob:logo-novo.png',
        type: 'image',
        position: 0,
      }),
    ]);
  });

  it('remove um item e atualiza as posições', () => {
    const onChange = vi.fn();

    const items: MediaItem[] = [
      {
        id: 'foto-1',
        url: 'foto-1.jpg',
        type: 'image',
        position: 0,
      },
      {
        id: 'foto-2',
        url: 'foto-2.jpg',
        type: 'image',
        position: 1,
      },
    ];

    render(<MediaUploader id="fotos" label="Fotos da peça" value={items} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover mídia 1' }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'foto-2',
        position: 0,
      }),
    ]);
  });

  it('ignora arquivos fora dos tipos aceitos', () => {
    const onChange = vi.fn();
    const invalidFile = new File(['arquivo'], 'arquivo.txt', {
      type: 'text/plain',
    });

    render(<MediaUploader id="fotos" label="Fotos da peça" value={[]} onChange={onChange} />);

    fireEvent.drop(screen.getByRole('button', { name: /arraste arquivos para cá/i }), {
      dataTransfer: {
        files: [invalidFile],
      },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('respeita uma extensão informada em accept', () => {
    const onChange = vi.fn();
    const file = new File(['imagem'], 'imagem.jpg', {
      type: 'application/octet-stream',
    });

    render(
      <MediaUploader
        id="fotos"
        label="Fotos da peça"
        value={[]}
        onChange={onChange}
        accept=".jpg"
      />,
    );

    fireEvent.drop(screen.getByRole('button', { name: /arraste arquivos para cá/i }), {
      dataTransfer: {
        files: [file],
      },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('respeita o limite máximo de arquivos', () => {
    const onChange = vi.fn();

    const currentItem: MediaItem = {
      id: 'foto-existente',
      url: 'foto-existente.jpg',
      type: 'image',
      position: 0,
    };

    const firstFile = new File(['foto-1'], 'foto-1.jpg', {
      type: 'image/jpeg',
    });

    const secondFile = new File(['foto-2'], 'foto-2.jpg', {
      type: 'image/jpeg',
    });

    render(
      <MediaUploader
        id="fotos"
        label="Fotos da peça"
        value={[currentItem]}
        onChange={onChange}
        max={2}
      />,
    );

    fireEvent.drop(screen.getByRole('button', { name: /arraste arquivos para cá/i }), {
      dataTransfer: {
        files: [firstFile, secondFile],
      },
    });

    expect(onChange).toHaveBeenCalledTimes(1);

    const updatedItems = onChange.mock.calls[0][0] as MediaItem[];

    expect(updatedItems).toHaveLength(2);
    expect(updatedItems[0]).toEqual(
      expect.objectContaining({
        id: 'foto-existente',
        position: 0,
      }),
    );
    expect(updatedItems[1]).toEqual(
      expect.objectContaining({
        file: firstFile,
        position: 1,
      }),
    );
  });

  it('desabilita a seleção quando o limite já foi atingido', () => {
    const item: MediaItem = {
      id: 'foto-1',
      url: 'foto-1.jpg',
      type: 'image',
      position: 0,
    };

    render(
      <MediaUploader id="fotos" label="Fotos da peça" value={[item]} onChange={vi.fn()} max={1} />,
    );

    expect(screen.getByLabelText('Fotos da peça')).toBeDisabled();

    const dropzone = screen.getByRole('button', {
      name: /limite de arquivos atingido/i,
    });

    expect(dropzone).toHaveAttribute('aria-disabled', 'true');
    expect(dropzone).toHaveAttribute('tabindex', '-1');
  });

  it('altera o estado visual enquanto um arquivo é arrastado sobre a dropzone', () => {
    render(<MediaUploader id="fotos" label="Fotos da peça" value={[]} onChange={vi.fn()} />);

    const dropzone = screen.getByRole('button', { name: /arraste arquivos para cá/i });

    expect(dropzone).toHaveClass('border-linha');

    fireEvent.dragOver(dropzone);

    expect(dropzone).toHaveClass('border-vermelho-escuro');

    fireEvent.dragLeave(dropzone);

    expect(dropzone).toHaveClass('border-linha');
  });

  it('permite abrir a seleção de arquivos com Enter', () => {
    render(<MediaUploader id="fotos" label="Fotos da peça" value={[]} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Fotos da peça');
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.keyDown(screen.getByRole('button', { name: /arraste arquivos para cá/i }), {
      key: 'Enter',
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('permite abrir a seleção de arquivos com espaço', () => {
    render(<MediaUploader id="fotos" label="Fotos da peça" value={[]} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Fotos da peça');
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.keyDown(screen.getByRole('button', { name: /arraste arquivos para cá/i }), {
      key: ' ',
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('exibe helperText quando não existe erro', () => {
    render(
      <MediaUploader
        id="fotos"
        label="Fotos da peça"
        value={[]}
        onChange={vi.fn()}
        helperText="Até 8 arquivos"
      />,
    );

    expect(screen.getByText('Até 8 arquivos')).toBeInTheDocument();
  });

  it('exibe a mensagem de erro recebida', () => {
    render(
      <MediaUploader
        id="fotos"
        label="Fotos da peça"
        value={[]}
        onChange={vi.fn()}
        helperText="Até 8 arquivos"
        error="Adicione ao menos uma foto"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Adicione ao menos uma foto');
    expect(screen.queryByText('Até 8 arquivos')).not.toBeInTheDocument();
  });

  it('fica inacessível para interação quando disabled', () => {
    const onChange = vi.fn();

    render(
      <MediaUploader id="fotos" label="Fotos da peça" value={[]} onChange={onChange} disabled />,
    );

    const input = screen.getByLabelText('Fotos da peça');
    const dropzone = screen.getByRole('button', { name: /arraste arquivos para cá/i });

    expect(input).toBeDisabled();
    expect(dropzone).toHaveAttribute('aria-disabled', 'true');
    expect(dropzone).toHaveAttribute('tabindex', '-1');

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [new File(['foto'], 'foto.jpg', { type: 'image/jpeg' })],
      },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renderiza a pré-visualização de vídeo', () => {
    const item: MediaItem = {
      id: 'video-1',
      url: 'video.mp4',
      type: 'video',
      position: 0,
    };

    render(<MediaUploader id="midia" label="Mídia" value={[item]} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Pré-visualização do vídeo 1')).toHaveAttribute(
      'src',
      'video.mp4',
    );

    expect(screen.getByText('Capa')).toBeInTheDocument();
  });
});
