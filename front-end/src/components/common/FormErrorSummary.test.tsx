import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormErrorSummary, { type FormErrorSummaryItem } from './FormErrorSummary';

afterEach(cleanup);

/** Formulário mínimo: o botão "Enviar" conta um envio, como as telas fazem. */
function Harness({ items }: { items: FormErrorSummaryItem[] }) {
  const [submitCount, setSubmitCount] = useState(0);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitCount((count) => count + 1);
      }}
    >
      <label htmlFor="nome">Nome</label>
      <input id="nome" />
      <label htmlFor="cidade">Cidade</label>
      <input id="cidade" />
      <div id="secao-fotos">
        <div role="button" tabIndex={0}>
          Enviar fotos
        </div>
      </div>
      <FormErrorSummary items={items} submitCount={submitCount} />
      <button type="submit">Enviar</button>
    </form>
  );
}

describe('<FormErrorSummary />', () => {
  it('sem erro não renderiza nada', () => {
    render(<FormErrorSummary items={[{ id: 'nome' }]} submitCount={1} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('é uma região alert só, com a contagem e um link por campo com erro', () => {
    render(
      <FormErrorSummary
        submitCount={0}
        items={[
          { id: 'nome', message: 'Informe o nome.' },
          { id: 'email' },
          { id: 'cidade', message: 'Informe a cidade.' },
        ]}
      />,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Confira 2 campos antes de continuar:');
    expect(screen.getByRole('link', { name: 'Informe o nome.' })).toHaveAttribute('href', '#nome');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('usa o singular com um campo só', () => {
    render(<FormErrorSummary submitCount={0} items={[{ id: 'nome', message: 'Informe.' }]} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Confira 1 campo antes de continuar:');
  });

  it('cada envio leva o foco ao primeiro campo com erro, na ordem de `items`', async () => {
    const user = userEvent.setup();
    render(<Harness items={[{ id: 'nome' }, { id: 'cidade', message: 'Informe a cidade.' }]} />);

    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByLabelText('Cidade')).toHaveFocus();
  });

  it('não move o foco sem envio', () => {
    render(<Harness items={[{ id: 'nome', message: 'Informe o nome.' }]} />);

    expect(screen.getByLabelText('Nome')).not.toHaveFocus();
  });

  it('em um contêiner, foca o controle visível de dentro', async () => {
    const user = userEvent.setup();
    render(<Harness items={[{ id: 'secao-fotos', message: 'Adicione uma foto.' }]} />);

    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByRole('button', { name: 'Enviar fotos' })).toHaveFocus();
  });

  it('o link do resumo foca o campo', async () => {
    const user = userEvent.setup();
    render(
      <FormErrorSummary submitCount={0} items={[{ id: 'nome', message: 'Informe o nome.' }]} />,
    );
    render(<input id="nome" aria-label="Nome" />);

    await user.click(screen.getByRole('link', { name: 'Informe o nome.' }));

    expect(screen.getByLabelText('Nome')).toHaveFocus();
  });
});
