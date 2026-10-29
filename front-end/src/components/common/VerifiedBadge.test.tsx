import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import VerifiedBadge from './VerifiedBadge';

afterEach(cleanup);

describe('<VerifiedBadge />', () => {
  it('renders the badge when verified is true', () => {
    render(<VerifiedBadge verified />);

    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('renders nothing when verified is false', () => {
    const { container } = render(<VerifiedBadge verified={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('uses the default accessible label when no label is provided', () => {
    render(<VerifiedBadge verified />);

    expect(screen.getByRole('img', { name: 'Confiável' })).toBeTruthy();
  });

  it('shows the label text and uses it as the accessible name when provided', () => {
    render(<VerifiedBadge verified label="Vendedor confiável" />);

    expect(screen.getByText('Vendedor confiável')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Vendedor confiável' })).toBeTruthy();
  });

  it('renders no visible text when label is not provided', () => {
    render(<VerifiedBadge verified />);

    expect(screen.getByRole('img')).toHaveTextContent('');
  });

  // FE-US007-1 — objetivo declarado: garantir os estados do selo (RN-73).
  it('state="pendente" renderiza "Pendente"', () => {
    render(<VerifiedBadge state="pendente" label="Confiável" />);

    expect(screen.getByRole('img', { name: 'Pendente' })).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
    expect(screen.queryByText('Confiável')).toBeNull();
  });

  it('state="confiavel" renderiza "Confiável"', () => {
    render(<VerifiedBadge state="confiavel" label="Confiável" />);

    expect(screen.getByRole('img', { name: 'Confiável' })).toBeTruthy();
    expect(screen.getByText('Confiável')).toBeTruthy();
  });

  it('state tem precedência sobre verified', () => {
    render(<VerifiedBadge state="pendente" verified />);

    expect(screen.getByRole('img', { name: 'Pendente' })).toBeTruthy();
  });
});
