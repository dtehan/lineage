import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  totalCount: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  className?: string;
}

export function Pagination({
  totalCount,
  limit,
  offset,
  onPageChange,
  className = '',
}: PaginationProps) {
  const start = Math.min(offset + 1, totalCount);
  const end = Math.min(offset + limit, totalCount);

  const isPrevDisabled = offset === 0;
  const isNextDisabled = offset + limit >= totalCount;

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

  return (
    <div className={`flex items-center justify-between text-sm ${className}`}>
      <span className="text-slate-600" data-testid="pagination-info">
        Showing {start}-{end} of {totalCount}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={handlePrev}
          disabled={isPrevDisabled}
          className="p-1.5 rounded-md text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          aria-label="Previous page"
          data-testid="pagination-prev"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={handleNext}
          disabled={isNextDisabled}
          className="p-1.5 rounded-md text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          aria-label="Next page"
          data-testid="pagination-next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
