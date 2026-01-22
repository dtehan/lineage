import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default medium size', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner.className).toContain('w-8');
    expect(spinner.className).toContain('h-8');
  });

  it('renders with small size', () => {
    render(<LoadingSpinner size="sm" />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('w-4');
    expect(spinner.className).toContain('h-4');
  });

  it('renders with large size', () => {
    render(<LoadingSpinner size="lg" />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('w-12');
    expect(spinner.className).toContain('h-12');
  });

  it('has accessible label', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('has animation class', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('animate-spin');
  });
});
