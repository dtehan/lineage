import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

describe('Pagination Component', () => {
  describe('Display', () => {
    it('shows correct range text for first page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 1-100 of 250'
      );
    });

    it('shows correct range text for middle page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={100}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 101-200 of 250'
      );
    });

    it('shows correct range text for last page with partial results', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={200}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 201-250 of 250'
      );
    });

    it('shows correct range when total equals page size', () => {
      render(
        <Pagination
          totalCount={100}
          limit={100}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 1-100 of 100'
      );
    });

    it('shows correct range for small dataset', () => {
      render(
        <Pagination
          totalCount={25}
          limit={100}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 1-25 of 25'
      );
    });
  });

  describe('Prev Button State', () => {
    it('disables prev button when offset is 0', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-prev')).toBeDisabled();
    });

    it('enables prev button when offset > 0', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={100}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-prev')).not.toBeDisabled();
    });
  });

  describe('Next Button State', () => {
    it('disables next button when at last page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={200}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-next')).toBeDisabled();
    });

    it('disables next button when offset + limit equals totalCount', () => {
      render(
        <Pagination
          totalCount={200}
          limit={100}
          offset={100}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-next')).toBeDisabled();
    });

    it('enables next button when more pages available', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-next')).not.toBeDisabled();
    });

    it('disables next button when total is less than page size', () => {
      render(
        <Pagination
          totalCount={50}
          limit={100}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-next')).toBeDisabled();
    });
  });

  describe('onPageChange Callback', () => {
    it('calls onPageChange with correct offset when clicking next', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={0}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-next'));

      expect(onPageChange).toHaveBeenCalledTimes(1);
      expect(onPageChange).toHaveBeenCalledWith(100);
    });

    it('calls onPageChange with correct offset when clicking prev', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={100}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-prev'));

      expect(onPageChange).toHaveBeenCalledTimes(1);
      expect(onPageChange).toHaveBeenCalledWith(0);
    });

    it('does not call onPageChange when prev is disabled', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={0}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-prev'));

      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('does not call onPageChange when next is disabled', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={200}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-next'));

      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('calculates prev offset correctly to not go below 0', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      // Offset is 50, limit is 100 - prev should go to 0, not -50
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={50}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-prev'));

      expect(onPageChange).toHaveBeenCalledWith(0);
    });
  });

  describe('Accessibility', () => {
    it('has accessible labels for buttons', () => {
      render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={100}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies className prop', () => {
      const { container } = render(
        <Pagination
          totalCount={250}
          limit={100}
          offset={0}
          onPageChange={() => {}}
          className="mt-4 px-2"
        />
      );

      expect(container.firstChild).toHaveClass('mt-4', 'px-2');
    });
  });
});
