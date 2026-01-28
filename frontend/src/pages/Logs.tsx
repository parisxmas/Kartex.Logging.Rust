import { useState, useEffect, useCallback } from 'react';
import { apiClient, LogEntry } from '../api/client';
import LogTable from '../components/LogTable';
import LogModal from '../components/LogModal';
import Pagination from '../components/Pagination';

const TIME_RANGES = [
  { value: '1h', label: 'Last 1 hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const LEVELS = ['', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  // Filters
  const [level, setLevel] = useState('');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const getStartTime = useCallback((range: string) => {
    const now = new Date();
    switch (range) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return undefined;
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.getLogs({
        level: level || undefined,
        service: service || undefined,
        search: search || undefined,
        start_time: getStartTime(timeRange),
        limit: pageSize,
        skip: (currentPage - 1) * pageSize,
      });

      setLogs(response.logs);
      setTotalCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setIsLoading(false);
    }
  }, [level, service, search, timeRange, currentPage, pageSize, getStartTime]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleLogClick = async (log: LogEntry) => {
    const id = typeof log._id === 'object' ? log._id.$oid : log._id;
    try {
      const fullLog = await apiClient.getLogById(id);
      setSelectedLog(fullLog);
    } catch (err) {
      console.error('Failed to fetch log details:', err);
    }
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Logs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded transition-colors ${
              autoRefresh ? 'bg-accent text-bg-primary' : 'bg-bg-tertiary hover:bg-border'
            }`}
          >
            {autoRefresh ? 'Stop Auto' : 'Auto Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 p-4 bg-bg-secondary rounded-lg border border-border">
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            handleFilterChange();
          }}
          className="px-3 py-1.5 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
        >
          <option value="">All Levels</option>
          {LEVELS.filter(Boolean).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Service..."
          value={service}
          onChange={(e) => {
            setService(e.target.value);
            handleFilterChange();
          }}
          className="px-3 py-1.5 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
        />

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            handleFilterChange();
          }}
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
        />

        <select
          value={timeRange}
          onChange={(e) => {
            setTimeRange(e.target.value);
            handleFilterChange();
          }}
          className="px-3 py-1.5 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
        >
          {TIME_RANGES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 mb-4 bg-error/10 border border-error/30 rounded text-error">
          {error}
        </div>
      )}

      {/* Log Table */}
      <div className="flex-1 overflow-hidden bg-bg-secondary rounded-lg border border-border">
        <LogTable logs={logs} isLoading={isLoading} onLogClick={handleLogClick} />
      </div>

      {/* Pagination */}
      <div className="mt-4">
        <Pagination
          currentPage={currentPage}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <LogModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}
