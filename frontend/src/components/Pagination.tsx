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
    <div className="flex items-center justify-between">
      <div className="text-sm text-text-secondary">
        Showing {(currentPage - 1) * pageSize + 1} -{' '}
        {Math.min(currentPage * pageSize, (currentPage - 1) * pageSize + totalCount)} logs
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev}
          className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="px-3 py-1.5 bg-bg-secondary rounded">Page {currentPage}</span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext}
          className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
