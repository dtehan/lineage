import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LargeGraphWarning, LARGE_GRAPH_THRESHOLD } from './LargeGraphWarning';

describe('LargeGraphWarning', () => {
  const defaultProps = {
    nodeCount: 250,
    currentDepth: 10,
    suggestedDepth: 5,
    onAcceptSuggestion: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('visibility', () => {
    it('shows warning when nodeCount >= LARGE_GRAPH_THRESHOLD', () => {
      render(<LargeGraphWarning {...defaultProps} nodeCount={LARGE_GRAPH_THRESHOLD} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Large graph detected/)).toBeInTheDocument();
    });

    it('shows warning when nodeCount > LARGE_GRAPH_THRESHOLD', () => {
      render(<LargeGraphWarning {...defaultProps} nodeCount={300} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('300 nodes. This may take a moment to render.')).toBeInTheDocument();
    });

    it('is hidden when nodeCount < LARGE_GRAPH_THRESHOLD', () => {
      render(<LargeGraphWarning {...defaultProps} nodeCount={199} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('is hidden when nodeCount is 0', () => {
      render(<LargeGraphWarning {...defaultProps} nodeCount={0} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('depth suggestion', () => {
    it('shows depth suggestion when currentDepth > suggestedDepth', () => {
      render(
        <LargeGraphWarning
          {...defaultProps}
          currentDepth={10}
          suggestedDepth={5}
        />
      );

      expect(screen.getByText(/Try reducing depth from 10 to 5/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Use depth 5/ })).toBeInTheDocument();
    });

    it('hides depth suggestion when currentDepth <= suggestedDepth', () => {
      render(
        <LargeGraphWarning
          {...defaultProps}
          currentDepth={5}
          suggestedDepth={5}
        />
      );

      expect(screen.queryByText(/Try reducing depth/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Use depth/ })).not.toBeInTheDocument();
    });

    it('hides depth suggestion when currentDepth < suggestedDepth', () => {
      render(
        <LargeGraphWarning
          {...defaultProps}
          currentDepth={3}
          suggestedDepth={5}
        />
      );

      expect(screen.queryByText(/Try reducing depth/)).not.toBeInTheDocument();
    });
  });

  describe('callbacks', () => {
    it('calls onAcceptSuggestion when depth suggestion button is clicked', () => {
      const onAcceptSuggestion = vi.fn();
      render(
        <LargeGraphWarning
          {...defaultProps}
          onAcceptSuggestion={onAcceptSuggestion}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Use depth 5/ }));

      expect(onAcceptSuggestion).toHaveBeenCalledTimes(1);
    });

    it('calls onDismiss when X button is clicked', () => {
      const onDismiss = vi.fn();
      render(<LargeGraphWarning {...defaultProps} onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /Dismiss warning/ }));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('also calls onDismiss when accepting suggestion', () => {
      const onDismiss = vi.fn();
      const onAcceptSuggestion = vi.fn();
      render(
        <LargeGraphWarning
          {...defaultProps}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismiss={onDismiss}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Use depth 5/ }));

      expect(onAcceptSuggestion).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('dismissal', () => {
    it('hides warning after dismissing', () => {
      render(<LargeGraphWarning {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Dismiss warning/ }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('persists dismissal in sessionStorage', () => {
      render(<LargeGraphWarning {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /Dismiss warning/ }));

      expect(sessionStorage.getItem('lineage-large-graph-warning-dismissed')).toBe('true');
    });

    it('stays hidden when sessionStorage has dismissal flag', () => {
      sessionStorage.setItem('lineage-large-graph-warning-dismissed', 'true');

      render(<LargeGraphWarning {...defaultProps} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has role="alert"', () => {
      render(<LargeGraphWarning {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('has aria-live="polite"', () => {
      render(<LargeGraphWarning {...defaultProps} />);

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
    });

    it('has accessible labels on buttons', () => {
      render(<LargeGraphWarning {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /Use depth 5 instead of 10/ })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Dismiss warning/ })).toBeInTheDocument();
    });
  });

  describe('threshold constant', () => {
    it('exports LARGE_GRAPH_THRESHOLD as 200', () => {
      expect(LARGE_GRAPH_THRESHOLD).toBe(200);
    });
  });
});
