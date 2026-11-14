import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Avatar from './Avatar';

afterEach(cleanup);

describe('<Avatar />', () => {
  it('renders the initials from name when no src is provided', () => {
    render(<Avatar name="Ana Souza" />);

    expect(screen.getByLabelText('Ana Souza')).toHaveTextContent('AS');
  });

  it('renders a single initial when name has only one word', () => {
    render(<Avatar name="Ana" />);

    expect(screen.getByLabelText('Ana')).toHaveTextContent('A');
  });

  it('renders an image with the correct alt when src is provided', () => {
    render(<Avatar name="Ana Souza" src="https://example.com/ana.jpg" />);

    const img = screen.getByRole('img', { name: 'Ana Souza' }) as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.src).toBe('https://example.com/ana.jpg');
  });

  it('falls back to initials when src is null', () => {
    render(<Avatar name="Ana Souza" src={null} />);

    expect(screen.getByLabelText('Ana Souza')).toHaveTextContent('AS');
  });

  it('renders no initials when name is empty or blank', () => {
    render(<Avatar name="   " />);

    expect(screen.getByRole('img')).toHaveTextContent('');
  });

  it('applies different dimension classes for sm, md and lg', () => {
    const { rerender } = render(<Avatar name="Ana Souza" size="sm" />);
    expect(screen.getByLabelText('Ana Souza').className).toContain('h-7');
    expect(screen.getByLabelText('Ana Souza').className).toContain('w-7');

    rerender(<Avatar name="Ana Souza" size="md" />);
    expect(screen.getByLabelText('Ana Souza').className).toContain('h-9');
    expect(screen.getByLabelText('Ana Souza').className).toContain('w-9');

    rerender(<Avatar name="Ana Souza" size="lg" />);
    expect(screen.getByLabelText('Ana Souza').className).toContain('h-12');
    expect(screen.getByLabelText('Ana Souza').className).toContain('w-12');
  });
});
