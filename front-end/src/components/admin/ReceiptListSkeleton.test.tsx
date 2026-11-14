import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReceiptListSkeleton } from './ReceiptListSkeleton';

afterEach(cleanup);

describe('<ReceiptListSkeleton />', () => {
  it('anuncia o carregamento', () => {
    render(<ReceiptListSkeleton />);

    expect(screen.getByRole('status', { name: 'Carregando comprovantes' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
