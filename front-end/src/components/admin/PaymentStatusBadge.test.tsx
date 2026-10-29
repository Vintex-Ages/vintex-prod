import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PaymentStatusBadge } from './PaymentStatusBadge';

afterEach(cleanup);

describe('<PaymentStatusBadge />', () => {
  it.each([
    ['pendente', 'Pendente de validação'],
    ['aprovado', 'Aprovado'],
    ['rejeitado', 'Rejeitado'],
  ] as const)('mostra o rótulo de %s', (status, label) => {
    render(<PaymentStatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
