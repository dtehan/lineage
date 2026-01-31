import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react';

export interface PaginationProps {
  /** Total number of items across all pages */
  totalCount: number;
  /** Number of items per page */
  limit: number;
  /** Current offset (zero-indexed) */
  offset: number;
  /** Callback when page changes */
  onPageChange: (offset: number) => void;
  /** Additional CSS classes */
  className?: string;
  /** Callback when page size changes (enables page size selector) */
  onPageSizeChange?: (size: number) => void;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Show First/Last buttons (default: true) */
  showFirstLast?: boolean;
  /** Show page info "Page X of Y" (default: true) */
  showPageInfo?: boolean;
  /** Disable all controls during loading */
  isLoading?: boolean;
}

export function Pagination({
  totalCount,
  limit,
  offset,
  onPageChange,
  className = '',
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
  showFirstLast = true,
  showPageInfo = true,
  isLoading = false,
}: PaginationProps) {
  // Calculate pagination state
  const currentPage = totalCount > 0 ? Math.floor(offset / limit) + 1 : 1;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 1;
  const start = totalCount > 0 ? Math.min(offset + 1, totalCount) : 0;
  const end = Math.min(offset + limit, totalCount);

  // Navigation state
  const isFirstPage = offset === 0;
  const isLastPage = offset + limit >= totalCount;
  const isPrevDisabled = isLoading || isFirstPage;
  const isNextDisabled = isLoading || isLastPage;

  // Calculate last page offset
  const lastPageOffset = Math.max(0, Math.floor((totalCount - 1) / limit) * limit);

  // Navigation handlers
  const handleFirst = () => {
    if (!isPrevDisabled) {
      onPageChange(0);
    }
  };

  const handlePrev = () => {
    if (!isPrevDisabled) {
      onPageChange(Math.max(0, offset - limit));
    }
  };

  const handleNext = () => {
    if (!isNextDisabled) {
      onPageChange(offset + limit);
    }
  };

  const handleLast = () => {
    if (!isNextDisabled) {
      onPageChange(lastPageOffset);
    }
  };

  // Page size change handler - maintains approximate position
  const handlePageSizeChange = (newSize: number) => {
    const currentFirstItem = offset + 1;
    const newOffset = Math.floor((currentFirstItem - 1) / newSize) * newSize;
    onPageSizeChange?.(newSize);
    onPageChange(newOffset);
  };

  // Ghost button styling - transparent with border on hover
  const buttonClass = `
    inline-flex items-center justify-center gap-1
    min-w-[36px] min-h-[36px] sm:min-w-[auto]
    px-2 py-1.5
    rounded-md
    text-sm text-slate-700
    bg-transparent
    border border-transparent
    hover:border-slate-300 hover:bg-slate-50
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
    disabled:opacity-50 disabled:cursor-not-allowed
    disabled:hover:border-transparent disabled:hover:bg-transparent
    transition-colors
  `;

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-sm ${className}`}
    >
      {/* Left section: Item count info */}
      <span className="text-slate-600" data-testid="pagination-info">
        {totalCount === 0 ? 'Showing 0 items' : `Showing ${start}-${end} of ${totalCount}`}
      </span>

      {/* Center section: Navigation controls */}
      <div className="flex items-center gap-1">
        {/* First button */}
        {showFirstLast && (
          <button
            onClick={handleFirst}
            disabled={isPrevDisabled}
            className={buttonClass}
            aria-label="First page"
            data-testid="pagination-first"
          >
            <ChevronsLeft className="w-4 h-4" />
            <span className="hidden sm:inline">First</span>
          </button>
        )}

        {/* Previous button */}
        <button
          onClick={handlePrev}
          disabled={isPrevDisabled}
          className={buttonClass}
          aria-label="Previous page"
          data-testid="pagination-prev"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {/* Page info */}
        {showPageInfo && (
          <span
            className="px-3 text-sm text-slate-600 hidden sm:inline"
            data-testid="pagination-page-info"
          >
            Page {currentPage} of {totalPages}
          </span>
        )}

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={isNextDisabled}
          className={buttonClass}
          aria-label="Next page"
          data-testid="pagination-next"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last button */}
        {showFirstLast && (
          <button
            onClick={handleLast}
            disabled={isNextDisabled}
            className={buttonClass}
            aria-label="Last page"
            data-testid="pagination-last"
          >
            <span className="hidden sm:inline">Last</span>
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Right section: Page size selector */}
      {onPageSizeChange && (
        <div className="relative">
          <label htmlFor="page-size-select" className="sr-only">
            Items per page
          </label>
          <select
            id="page-size-select"
            value={limit}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            disabled={isLoading}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="pagination-page-size"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      )}
    </nav>
  );
}
