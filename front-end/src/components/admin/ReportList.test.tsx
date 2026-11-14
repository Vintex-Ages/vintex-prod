import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { AdminOrderReport } from '@/types/report';
import { formatDateTime } from '@/utils/format';
import { ReportList } from './ReportList';

/** Lista de Reclamações da administradora (FE-US025-2, #427). Só leitura. */

function reclamacao(id: string, overrides: Partial<AdminOrderReport> = {}): AdminOrderReport {
  return {
    id,
    orderId: `ped-${id}`,
    reason: 'danificado',
    description: 'A manga veio rasgada.',
    createdAt: '2026-10-29T14:32:00',
    buyer: { id: 'u_1', name: 'Ana Compradora' },
    store: { id: 's_1', name: 'Brechó da Bia' },
    ...overrides,
  };
}

afterEach(cleanup);

function itens() {
  return within(screen.getByRole('list', { name: 'Reclamações' })).getAllByRole('listitem');
}

describe('<ReportList />', () => {
  // Teste 1: motivo, descrição, pedido, comprador, loja e data, na ordem do service.
  it('mostra os dados de cada Reclamação na ordem recebida', () => {
    render(
      <ReportList
        items={[
          reclamacao('2', {
            reason: 'nao_recebido',
            description: 'Nunca chegou.',
            orderId: '42',
            createdAt: '2026-10-30T09:05:00',
            buyer: { id: 'u_2', name: 'Bia Souza' },
            store: { id: 's_2', name: 'Garimpo da Redenção' },
          }),
          reclamacao('1'),
        ]}
      />,
    );

    const [primeira, segunda] = itens();
    const p = within(primeira);
    expect(p.getByText('Não recebido')).toBeInTheDocument();
    expect(p.getByText('Nunca chegou.')).toBeInTheDocument();
    expect(p.getByText('Pedido #42')).toBeInTheDocument();
    expect(p.getByText('Bia Souza')).toBeInTheDocument();
    expect(p.getByText('Garimpo da Redenção')).toBeInTheDocument();
    const data = p.getByText(formatDateTime('2026-10-30T09:05:00'));
    expect(data.tagName).toBe('TIME');
    expect(data).toHaveAttribute('dateTime', '2026-10-30T09:05:00');

    const s = within(segunda);
    expect(s.getByText('Danificado')).toBeInTheDocument();
    expect(s.getByText('Pedido #ped-1')).toBeInTheDocument();
    expect(s.getByText('Ana Compradora')).toBeInTheDocument();
    expect(s.getByText('Brechó da Bia')).toBeInTheDocument();
  });

  // Só leitura: sem link para o Pedido do comprador nem ações.
  it('não tem link nem botão', () => {
    render(<ReportList items={[reclamacao('1')]} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // Teste 7: texto livre do comprador nunca vira HTML.
  it('descrição com HTML/script aparece como texto puro', () => {
    const malicioso = '<img src=x onerror="alert(1)"><script>alert(2)</script><b>negrito</b>';
    const { container } = render(
      <ReportList items={[reclamacao('1', { description: malicioso })]} />,
    );

    expect(screen.getByText(malicioso)).toBeInTheDocument();
    expect(container.querySelector('script, img, b')).toBeNull();
  });

  it('preserva quebras de linha e quebra palavras longas', () => {
    render(<ReportList items={[reclamacao('1', { description: 'Linha 1\nLinha 2' })]} />);

    const descricao = screen.getByText(/Linha 1/);
    expect(descricao.textContent).toBe('Linha 1\nLinha 2');
    expect(descricao).toHaveClass('whitespace-pre-line', 'break-words');
  });

  it('não usa nenhuma cor em hex cru', () => {
    const { container } = render(<ReportList items={[reclamacao('1')]} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
