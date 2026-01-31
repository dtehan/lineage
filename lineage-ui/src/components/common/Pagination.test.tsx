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

    it('wraps controls in nav element with aria-label', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
    });

    it('has accessible labels for First and Last buttons', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: /first page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /last page/i })).toBeInTheDocument();
    });

    it('has accessible label for page size selector', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
        />
      );

      expect(screen.getByLabelText(/items per page/i)).toBeInTheDocument();
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

  describe('First/Last Buttons', () => {
    it('shows First and Last buttons by default', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-first')).toBeInTheDocument();
      expect(screen.getByTestId('pagination-last')).toBeInTheDocument();
    });

    it('hides First and Last buttons when showFirstLast is false', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
          showFirstLast={false}
        />
      );

      expect(screen.queryByTestId('pagination-first')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pagination-last')).not.toBeInTheDocument();
    });

    it('disables First button when on first page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-first')).toBeDisabled();
    });

    it('enables First button when not on first page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-first')).not.toBeDisabled();
    });

    it('disables Last button when on last page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={225}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-last')).toBeDisabled();
    });

    it('enables Last button when not on last page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-last')).not.toBeDisabled();
    });

    it('calls onPageChange with 0 when clicking First', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={100}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-first'));

      expect(onPageChange).toHaveBeenCalledWith(0);
    });

    it('calls onPageChange with last page offset when clicking Last', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-last'));
      // Last page offset: Math.floor((250-1) / 25) * 25 = 225
      expect(onPageChange).toHaveBeenCalledWith(225);
    });

    it('does not call onPageChange when clicking disabled First', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-first'));

      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('does not call onPageChange when clicking disabled Last', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={225}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-last'));

      expect(onPageChange).not.toHaveBeenCalled();
    });
  });

  describe('Page Size Selector', () => {
    it('does not show page size selector when onPageSizeChange not provided', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.queryByTestId('pagination-page-size')).not.toBeInTheDocument();
    });

    it('shows page size selector when onPageSizeChange provided', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-page-size')).toBeInTheDocument();
    });

    it('displays default page size options', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={0}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
        />
      );

      const select = screen.getByTestId('pagination-page-size');
      expect(select).toHaveDisplayValue('25 per page');
      expect(screen.getByRole('option', { name: '25 per page' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '50 per page' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '100 per page' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '200 per page' })).toBeInTheDocument();
    });

    it('uses custom page size options when provided', () => {
      render(
        <Pagination
          totalCount={250}
          limit={10}
          offset={0}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          pageSizeOptions={[10, 20, 50]}
        />
      );

      expect(screen.getByRole('option', { name: '10 per page' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '20 per page' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '50 per page' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: '100 per page' })).not.toBeInTheDocument();
    });

    it('calls onPageSizeChange and onPageChange when changing page size', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}  // Page 3 (items 51-75)
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      );

      await user.selectOptions(screen.getByTestId('pagination-page-size'), '50');

      expect(onPageSizeChange).toHaveBeenCalledWith(50);
      // Should keep user at same approximate position: item 51 -> offset 50 with size 50
      expect(onPageChange).toHaveBeenCalledWith(50);
    });

    it('recalculates offset correctly when changing page size from middle page', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={100}  // Page 5 (items 101-125)
          onPageChange={onPageChange}
          onPageSizeChange={() => {}}
        />
      );

      await user.selectOptions(screen.getByTestId('pagination-page-size'), '50');
      // Item 101 with size 50 -> offset 100 (page 3 of 50-item pages)
      expect(onPageChange).toHaveBeenCalledWith(100);
    });

    it('recalculates offset to 0 when changing page size shows all items', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={75}
          limit={25}
          offset={50}  // Page 3 (items 51-75)
          onPageChange={onPageChange}
          onPageSizeChange={() => {}}
        />
      );

      await user.selectOptions(screen.getByTestId('pagination-page-size'), '100');
      // Item 51 with size 100 -> offset 0 (only one page needed)
      expect(onPageChange).toHaveBeenCalledWith(0);
    });
  });

  describe('Page Number Display', () => {
    it('displays current page and total pages', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Page 3 of 10');
    });

    it('shows page 1 of 1 for single page', () => {
      render(
        <Pagination
          totalCount={20}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Page 1 of 1');
    });

    it('shows correct page on last page', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={225}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Page 10 of 10');
    });

    it('shows page 1 of 1 when totalCount is 0', () => {
      render(
        <Pagination
          totalCount={0}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Page 1 of 1');
    });

    it('hides page info when showPageInfo is false', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
          showPageInfo={false}
        />
      );

      expect(screen.queryByTestId('pagination-page-info')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('disables all navigation buttons when isLoading is true', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('pagination-first')).toBeDisabled();
      expect(screen.getByTestId('pagination-prev')).toBeDisabled();
      expect(screen.getByTestId('pagination-next')).toBeDisabled();
      expect(screen.getByTestId('pagination-last')).toBeDisabled();
    });

    it('disables page size selector when isLoading is true', () => {
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('pagination-page-size')).toBeDisabled();
    });

    it('does not call onPageChange when clicking buttons during loading', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={50}
          onPageChange={onPageChange}
          isLoading={true}
        />
      );

      await user.click(screen.getByTestId('pagination-next'));
      await user.click(screen.getByTestId('pagination-prev'));

      expect(onPageChange).not.toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('shows "Showing 0 items" when totalCount is 0', () => {
      render(
        <Pagination
          totalCount={0}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent('Showing 0 items');
    });

    it('disables all navigation buttons when totalCount is 0', () => {
      render(
        <Pagination
          totalCount={0}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-first')).toBeDisabled();
      expect(screen.getByTestId('pagination-prev')).toBeDisabled();
      expect(screen.getByTestId('pagination-next')).toBeDisabled();
      expect(screen.getByTestId('pagination-last')).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('handles last page with exact multiple of limit', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      // 250 items, 25 per page = exactly 10 pages
      render(
        <Pagination
          totalCount={250}
          limit={25}
          offset={225}  // Last page
          onPageChange={onPageChange}
        />
      );

      // Should show items 226-250
      expect(screen.getByTestId('pagination-info')).toHaveTextContent('Showing 226-250 of 250');
      // Last and Next should be disabled
      expect(screen.getByTestId('pagination-last')).toBeDisabled();
      expect(screen.getByTestId('pagination-next')).toBeDisabled();
      // But First and Prev should be enabled
      expect(screen.getByTestId('pagination-first')).not.toBeDisabled();
      expect(screen.getByTestId('pagination-prev')).not.toBeDisabled();
    });

    it('handles single item', () => {
      render(
        <Pagination
          totalCount={1}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent('Showing 1-1 of 1');
      expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Page 1 of 1');
    });

    it('handles totalCount equal to limit', () => {
      render(
        <Pagination
          totalCount={25}
          limit={25}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent('Showing 1-25 of 25');
      expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Page 1 of 1');
      // All navigation should be disabled
      expect(screen.getByTestId('pagination-first')).toBeDisabled();
      expect(screen.getByTestId('pagination-prev')).toBeDisabled();
      expect(screen.getByTestId('pagination-next')).toBeDisabled();
      expect(screen.getByTestId('pagination-last')).toBeDisabled();
    });

    it('handles limit larger than totalCount', () => {
      render(
        <Pagination
          totalCount={10}
          limit={100}
          offset={0}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTestId('pagination-info')).toHaveTextContent('Showing 1-10 of 10');
      expect(screen.getByTestId('pagination-page-info')).toHaveTextContent('Page 1 of 1');
    });

    it('calculates correct last page offset when totalCount is not multiple of limit', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      // 237 items, 25 per page = 9 full pages + 12 items on page 10
      render(
        <Pagination
          totalCount={237}
          limit={25}
          offset={0}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTestId('pagination-last'));
      // Last page offset: Math.floor((237-1) / 25) * 25 = 225
      expect(onPageChange).toHaveBeenCalledWith(225);
    });
  });
});
