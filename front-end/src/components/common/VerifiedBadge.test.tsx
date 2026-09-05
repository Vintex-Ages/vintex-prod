import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import VerifiedBadge from './VerifiedBadge';

afterEach(cleanup);

describe('<VerifiedBadge />', () => {
  it('renders the badge when verified is true', () => {
    render(<VerifiedBadge verified />);

    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders nothing when verified is false', () => {
    const { container } = render(<VerifiedBadge verified={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('uses the default accessible label when no label is provided', () => {
    render(<VerifiedBadge verified />);

    expect(screen.getByRole('status', { name: 'Confiável' })).toBeTruthy();
  });

  it('shows the label text and uses it as the accessible name when provided', () => {
    render(<VerifiedBadge verified label="Vendedor confiável" />);

    expect(screen.getByText('Vendedor confiável')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Vendedor confiável' })).toBeTruthy();
  });

  it('renders no visible text when label is not provided', () => {
    render(<VerifiedBadge verified />);

    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
