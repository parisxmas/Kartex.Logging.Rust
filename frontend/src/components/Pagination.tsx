interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalCount,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const hasPrev = currentPage > 1;
  const hasNext = totalCount >= pageSize;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="text-xs sm:text-sm text-text-secondary order-2 sm:order-1">
        Showing {(currentPage - 1) * pageSize + 1} -{' '}
        {Math.min(currentPage * pageSize, (currentPage - 1) * pageSize + totalCount)} logs
      </div>
      <div className="flex items-center gap-2 order-1 sm:order-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev}
          className="px-2 sm:px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Prev
        </button>
        <span className="px-2 sm:px-3 py-1.5 bg-bg-secondary rounded text-sm">
          <span className="hidden sm:inline">Page </span>{currentPage}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext}
          className="px-2 sm:px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Next
        </button>
      </div>
    </div>
  );
}
