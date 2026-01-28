import { useState, useEffect, useCallback } from 'react';
import { apiClient, LogEntry } from '../api/client';
import LogTable from '../components/LogTable';
import LogModal from '../components/LogModal';
import Pagination from '../components/Pagination';
import QueryBuilder, { QueryBuilderFilters } from '../components/QueryBuilder';

const TIME_RANGES = [
  { value: '1h', label: 'Last 1 hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const LEVELS = ['', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

const REGEX_FIELDS = [
  { value: 'message', label: 'Message' },
  { value: 'service', label: 'Service' },
  { value: 'exception', label: 'Exception' },
  { value: 'all', label: 'All Fields' },
];

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  // View mode: 'simple' or 'builder'
  const [viewMode, setViewMode] = useState<'simple' | 'builder'>('simple');

  // Simple Filters
  const [level, setLevel] = useState('');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Regex mode
  const [regexMode, setRegexMode] = useState(false);
  const [regexField, setRegexField] = useState('message');

  // Query Builder filters
  const [builderFilters, setBuilderFilters] = useState<QueryBuilderFilters>({});

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

      let params: Parameters<typeof apiClient.getLogs>[0];

      if (viewMode === 'builder') {
        // Use query builder filters
        params = {
          level: builderFilters.level || undefined,
          service: builderFilters.service || undefined,
          search: builderFilters.search || undefined,
          regex: builderFilters.regex || undefined,
          regex_field: builderFilters.regex_field || undefined,
          start_time: builderFilters.start_time || undefined,
          end_time: builderFilters.end_time || undefined,
          limit: pageSize,
          skip: (currentPage - 1) * pageSize,
        };
      } else {
        // Use simple filters
        params = {
          level: level || undefined,
          service: service || undefined,
          search: search || undefined,
          regex: regexMode || undefined,
          regex_field: regexMode ? regexField : undefined,
          start_time: getStartTime(timeRange),
          limit: pageSize,
          skip: (currentPage - 1) * pageSize,
        };
      }

      const response = await apiClient.getLogs(params);

      setLogs(response.logs);
      setTotalCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setIsLoading(false);
    }
  }, [level, service, search, timeRange, regexMode, regexField, currentPage, pageSize, getStartTime, viewMode, builderFilters]);

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

  const handleBuilderFiltersChange = useCallback((filters: QueryBuilderFilters) => {
    setBuilderFilters(filters);
    setCurrentPage(1);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Logs</h1>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-bg-secondary rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'simple'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setViewMode('builder')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'builder'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Query Builder
            </button>
          </div>

          <button
            onClick={fetchLogs}
            className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded transition-colors ${
              autoRefresh ? 'bg-accent text-white' : 'bg-bg-tertiary hover:bg-border'
            }`}
          >
            {autoRefresh ? 'Stop Auto' : 'Auto Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      {viewMode === 'simple' ? (
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

          {/* Search with Regex Toggle */}
          <div className="flex-1 min-w-[200px] flex gap-1">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={regexMode ? 'Regex pattern...' : 'Search...'}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  handleFilterChange();
                }}
                className={`w-full px-3 py-1.5 bg-bg-tertiary border rounded focus:outline-none focus:border-accent ${
                  regexMode ? 'border-accent font-mono' : 'border-border'
                }`}
              />
              {regexMode && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-accent">
                  .*
                </span>
              )}
            </div>

            {/* Regex Toggle */}
            <button
              onClick={() => setRegexMode(!regexMode)}
              className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                regexMode
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary'
              }`}
              title={regexMode ? 'Disable regex mode' : 'Enable regex mode'}
            >
              .*
            </button>

            {/* Regex Field Selector */}
            {regexMode && (
              <select
                value={regexField}
                onChange={(e) => {
                  setRegexField(e.target.value);
                  handleFilterChange();
                }}
                className="px-3 py-1.5 bg-bg-tertiary border border-border rounded text-sm focus:outline-none focus:border-accent"
              >
                {REGEX_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            )}
          </div>

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
      ) : (
        <div className="mb-4">
          <QueryBuilder
            onFiltersChange={handleBuilderFiltersChange}
          />
        </div>
      )}

      {/* Regex Help (Simple Mode) */}
      {viewMode === 'simple' && regexMode && search && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div className="font-medium text-accent mb-1">Regex Mode Active</div>
            <div className="text-text-secondary">
              Examples: <code className="text-accent">error.*timeout</code>, <code className="text-accent">^Failed</code>, <code className="text-accent">[0-9]{"{3}"}</code>
            </div>
          </div>
        </div>
      )}

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
