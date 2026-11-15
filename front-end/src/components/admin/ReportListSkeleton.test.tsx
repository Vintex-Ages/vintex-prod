import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReportListSkeleton } from './ReportListSkeleton';

afterEach(cleanup);

describe('<ReportListSkeleton />', () => {
  it('anuncia o carregamento', () => {
    render(<ReportListSkeleton />);

    expect(screen.getByRole('status', { name: 'Carregando reclamações' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
