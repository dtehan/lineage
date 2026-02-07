import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows tooltip after default hover delay (200ms)', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Hover me').closest('div')!;
    fireEvent.mouseEnter(wrapper);

    // Not visible yet
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tooltip text');
  });

  it('does NOT show tooltip before delay elapses', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Hover me').closest('div')!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hides tooltip on mouseLeave', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Hover me').closest('div')!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(wrapper);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('supports custom delay prop', () => {
    render(
      <Tooltip content="Delayed tooltip" delay={500}>
        <button>Hover me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Hover me').closest('div')!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('renders children without tooltip wrapper when disabled', () => {
    const { container } = render(
      <Tooltip content="Should not show" disabled={true}>
        <button>Just a button</button>
      </Tooltip>
    );

    expect(screen.getByText('Just a button')).toBeInTheDocument();
    // When disabled, Tooltip renders a Fragment around children, no wrapper div with onMouseEnter
    const divWithMouseEnter = container.querySelector('div[class*="relative"]');
    expect(divWithMouseEnter).not.toBeInTheDocument();
  });

  it('renders children without tooltip wrapper when content is empty', () => {
    const { container } = render(
      <Tooltip content={null as unknown as React.ReactNode}>
        <button>Just a button</button>
      </Tooltip>
    );

    expect(screen.getByText('Just a button')).toBeInTheDocument();
    const divWithMouseEnter = container.querySelector('div[class*="relative"]');
    expect(divWithMouseEnter).not.toBeInTheDocument();
  });

  it('shows tooltip with correct content text', () => {
    render(
      <Tooltip content="Expected content">
        <button>Hover me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Hover me').closest('div')!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Expected content');
  });

  it('supports ReactNode content (not just string)', () => {
    render(
      <Tooltip content={<span data-testid="rich-content">Bold text</span>}>
        <button>Hover me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Hover me').closest('div')!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('rich-content')).toBeInTheDocument();
    expect(screen.getByTestId('rich-content')).toHaveTextContent('Bold text');
  });

  it('applies correct position classes for all variants', () => {
    const positions = ['top', 'bottom', 'left', 'right'] as const;

    for (const position of positions) {
      const { unmount } = render(
        <Tooltip content="Positioned tooltip" position={position}>
          <button>Hover {position}</button>
        </Tooltip>
      );

      const wrapper = screen.getByText(`Hover ${position}`).closest('div')!;
      fireEvent.mouseEnter(wrapper);

      act(() => {
        vi.advanceTimersByTime(200);
      });

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();

      // Verify position-specific CSS classes
      const tooltipClasses = tooltip.className;
      if (position === 'top') {
        expect(tooltipClasses).toContain('bottom-full');
      } else if (position === 'bottom') {
        expect(tooltipClasses).toContain('top-full');
      } else if (position === 'left') {
        expect(tooltipClasses).toContain('right-full');
      } else if (position === 'right') {
        expect(tooltipClasses).toContain('left-full');
      }

      unmount();
    }
  });

  it('clears timeout on unmount (no memory leak)', () => {
    const { unmount } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Hover me').closest('div')!;
    fireEvent.mouseEnter(wrapper);

    // Unmount before delay elapses -- should not throw or leak
    unmount();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // No errors thrown, no tooltip rendered (component is gone)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus and hides on blur (keyboard accessibility)', () => {
    render(
      <Tooltip content="Keyboard tooltip">
        <button>Focus me</button>
      </Tooltip>
    );

    const wrapper = screen.getByText('Focus me').closest('div')!;
    fireEvent.focus(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Keyboard tooltip');

    fireEvent.blur(wrapper);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
