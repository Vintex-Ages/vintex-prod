// src/pages/onboarding/StyleSelection.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StyleSelection from './StyleSelection';
import { getStyles } from '@/services/preferenceService';

vi.mock('@/services/preferenceService', () => ({
  getStyles: vi.fn(),
}));

const mockStyles = [
  { type: 'style', value: 'casual', label: 'Casual' },
  { type: 'style', value: 'vintage', label: 'Vintage' },
];

describe('StyleSelection', () => {
  it('renderiza a lista de estilos vinda do service', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);

    render(<StyleSelection />);

    await waitFor(() => {
      expect(screen.getByText('Casual')).toBeInTheDocument();
      expect(screen.getByText('Vintage')).toBeInTheDocument();
    });
  });

  it('marca o card ao selecionar um estilo', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);
    const user = userEvent.setup();

    render(<StyleSelection />);

    const checkbox = await screen.findByRole('checkbox', { name: /casual/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
