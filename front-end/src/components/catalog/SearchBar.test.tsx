import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  it('dispara onSubmit com o termo ao pressionar Enter', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="camiseta" onChange={() => {}} onSubmit={onSubmit} />);

    const input = screen.getByRole('searchbox');
    await user.type(input, '{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('camiseta');
  });

  it('dispara onSubmit com o termo ao clicar no botão', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="camiseta" onChange={() => {}} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).toHaveBeenCalledWith('camiseta');
  });

  it('usa o placeholder padrão quando nenhum é informado', () => {
    render(<SearchBar value="" onChange={() => {}} onSubmit={() => {}} />);

    expect(screen.getByPlaceholderText('Busque por peça ou marca')).toBeInTheDocument();
  });

  it('aceita um placeholder customizado', () => {
    render(
      <SearchBar value="" onChange={() => {}} onSubmit={() => {}} placeholder="Buscar produto" />,
    );

    expect(screen.getByPlaceholderText('Buscar produto')).toBeInTheDocument();
  });

  it('desabilita o botão e não dispara onSubmit quando loading é true', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="camiseta" onChange={() => {}} onSubmit={onSubmit} loading />);

    // Carregando, o botao troca o rotulo pelo giro mais um texto so de leitor
    // de tela — por isso o nome acessivel deixa de ser "Buscar".
    const button = screen.getByRole('button', { name: 'Buscando' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('chama onChange conforme o usuário digita', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="" onChange={onChange} onSubmit={() => {}} />);

    await user.type(screen.getByRole('searchbox'), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  describe('submitVariant="arrow" (admin, Figma)', () => {
    it('o botão é verde, quadrado e só tem a seta, mas continua se chamando "Buscar"', () => {
      render(<SearchBar value="" onChange={() => {}} onSubmit={() => {}} submitVariant="arrow" />);

      const button = screen.getByRole('button', { name: 'Buscar' });
      expect(button).toHaveClass('bg-verde-rs');
      expect(button).not.toHaveClass('bg-vermelho-escuro');
      expect(button).toHaveTextContent('');
      expect(button.querySelector('svg')).toBeInTheDocument();
    });

    it('dispara onSubmit com o termo ao clicar na seta', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();

      render(
        <SearchBar
          value="camiseta"
          onChange={() => {}}
          onSubmit={onSubmit}
          submitVariant="arrow"
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      expect(onSubmit).toHaveBeenCalledWith('camiseta');
    });

    it('carregando, desabilita e vira "Buscando"', () => {
      render(
        <SearchBar
          value="a"
          onChange={() => {}}
          onSubmit={() => {}}
          submitVariant="arrow"
          loading
        />,
      );

      expect(screen.getByRole('button', { name: 'Buscando' })).toBeDisabled();
    });

    it('o padrão continua sendo o botão vermelho com texto', () => {
      render(<SearchBar value="" onChange={() => {}} onSubmit={() => {}} />);

      const button = screen.getByRole('button', { name: 'Buscar' });
      expect(button).toHaveClass('bg-vermelho-escuro');
      expect(button).toHaveTextContent('Buscar');
    });
  });

  describe('busca por foto (onImageSelect)', () => {
    it('não mostra o botão de câmera sem onImageSelect', () => {
      render(<SearchBar value="" onChange={() => {}} onSubmit={() => {}} />);

      expect(screen.queryByLabelText('Buscar por foto')).not.toBeInTheDocument();
    });

    it('abre a câmera no celular e aceita só imagem', () => {
      render(
        <SearchBar value="" onChange={() => {}} onSubmit={() => {}} onImageSelect={() => {}} />,
      );

      const input = screen.getByLabelText('Buscar por foto');
      expect(input).toHaveAttribute('type', 'file');
      expect(input).toHaveAttribute('accept', 'image/*');
      expect(input).toHaveAttribute('capture', 'environment');
    });

    it('entrega a foto escolhida em onImageSelect', async () => {
      const onImageSelect = vi.fn();
      const user = userEvent.setup();
      const file = new File(['x'], 'look.jpg', { type: 'image/jpeg' });

      render(
        <SearchBar
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
          onImageSelect={onImageSelect}
        />,
      );
      await user.upload(screen.getByLabelText('Buscar por foto'), file);

      expect(onImageSelect).toHaveBeenCalledWith(file);
    });
  });
});
