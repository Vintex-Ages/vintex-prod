import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar } from '@/components/catalog/SearchBar';

describe('SearchBar', () => {
  it('dispara onSubmit com o termo ao pressionar Enter', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="camiseta" onChange={() => {}} onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
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

    expect(screen.getByPlaceholderText('Busque por peça, marca ou brechó…')).toBeInTheDocument();
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

    const button = screen.getByRole('button', { name: 'Buscar' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('chama onChange conforme o usuário digita', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="" onChange={onChange} onSubmit={() => {}} />);

    await user.type(screen.getByRole('textbox'), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });
});
