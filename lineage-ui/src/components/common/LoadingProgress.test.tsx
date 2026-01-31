import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingProgress } from './LoadingProgress';

describe('LoadingProgress', () => {
  describe('progress bar rendering', () => {
    it('renders progress bar with correct width percentage', () => {
      render(<LoadingProgress progress={50} message="Loading..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveStyle({ width: '50%' });
    });

    it('renders progress bar at 0%', () => {
      render(<LoadingProgress progress={0} message="Starting..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveStyle({ width: '0%' });
    });

    it('renders progress bar at 100%', () => {
      render(<LoadingProgress progress={100} message="" />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });

    it('clamps progress below 0 to 0%', () => {
      render(<LoadingProgress progress={-20} message="Error" />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveStyle({ width: '0%' });
    });

    it('clamps progress above 100 to 100%', () => {
      render(<LoadingProgress progress={150} message="Overflow" />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });
  });

  describe('message display', () => {
    it('displays message text', () => {
      render(<LoadingProgress progress={30} message="Loading data..." />);

      expect(screen.getByText('Loading data...')).toBeInTheDocument();
    });

    it('displays different messages correctly', () => {
      const { rerender } = render(
        <LoadingProgress progress={30} message="Fetching..." />
      );
      expect(screen.getByText('Fetching...')).toBeInTheDocument();

      rerender(<LoadingProgress progress={60} message="Calculating layout..." />);
      expect(screen.getByText('Calculating layout...')).toBeInTheDocument();
    });

    it('does not render message element when message is empty', () => {
      render(<LoadingProgress progress={100} message="" />);

      // Should not have any text content besides the progress bar
      expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
    });
  });

  describe('size prop', () => {
    it('applies small size classes', () => {
      const { container } = render(
        <LoadingProgress progress={50} message="Loading..." size="sm" />
      );

      const progressContainer = container.querySelector('.w-48');
      expect(progressContainer).toBeInTheDocument();
      expect(progressContainer).toHaveClass('h-2');

      expect(screen.getByText('Loading...')).toHaveClass('text-xs');
    });

    it('applies medium size classes by default', () => {
      const { container } = render(
        <LoadingProgress progress={50} message="Loading..." />
      );

      const progressContainer = container.querySelector('.w-64');
      expect(progressContainer).toBeInTheDocument();
      expect(progressContainer).toHaveClass('h-3');

      expect(screen.getByText('Loading...')).toHaveClass('text-sm');
    });

    it('applies large size classes', () => {
      const { container } = render(
        <LoadingProgress progress={50} message="Loading..." size="lg" />
      );

      const progressContainer = container.querySelector('.w-80');
      expect(progressContainer).toBeInTheDocument();
      expect(progressContainer).toHaveClass('h-4');

      expect(screen.getByText('Loading...')).toHaveClass('text-base');
    });
  });

  describe('ARIA attributes', () => {
    it('has role progressbar', () => {
      render(<LoadingProgress progress={50} message="Loading..." />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('has correct aria-valuenow', () => {
      render(<LoadingProgress progress={75} message="Loading..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '75');
    });

    it('has aria-valuemin of 0', () => {
      render(<LoadingProgress progress={50} message="Loading..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    });

    it('has aria-valuemax of 100', () => {
      render(<LoadingProgress progress={50} message="Loading..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('has aria-label with message', () => {
      render(<LoadingProgress progress={50} message="Calculating layout..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-label', 'Calculating layout...');
    });

    it('has fallback aria-label when message is empty', () => {
      render(<LoadingProgress progress={50} message="" />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-label', 'Loading progress');
    });

    it('aria-valuenow reflects clamped value', () => {
      render(<LoadingProgress progress={-10} message="Test" />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });
  });

  describe('visual styling', () => {
    it('has transition class for smooth animation', () => {
      render(<LoadingProgress progress={50} message="Loading..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('transition-all');
      expect(progressBar).toHaveClass('duration-300');
    });

    it('has blue background for progress fill', () => {
      render(<LoadingProgress progress={50} message="Loading..." />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-blue-500');
    });

    it('has slate text color for message', () => {
      render(<LoadingProgress progress={50} message="Loading..." />);

      expect(screen.getByText('Loading...')).toHaveClass('text-slate-600');
    });

    it('container has centered flex layout', () => {
      const { container } = render(
        <LoadingProgress progress={50} message="Loading..." />
      );

      const outerContainer = container.firstChild;
      expect(outerContainer).toHaveClass('flex');
      expect(outerContainer).toHaveClass('flex-col');
      expect(outerContainer).toHaveClass('items-center');
      expect(outerContainer).toHaveClass('justify-center');
    });
  });
});
