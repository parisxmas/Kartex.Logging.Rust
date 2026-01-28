import { useState, useEffect, useCallback } from 'react';
import { apiClient, TraceSummary, TraceDetail } from '../api/client';
import TraceWaterfall from '../components/TraceWaterfall';

const TIME_RANGES = [
  { value: '1h', label: 'Last 1 hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
];

export default function Traces() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);

  // Filters
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');
  const [timeRange, setTimeRange] = useState('24h');

  const getStartTime = useCallback((range: string) => {
    const now = new Date();
    switch (range) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return undefined;
    }
  }, []);

  const fetchTraces = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.getTraces({
        service: service || undefined,
        status: status || undefined,
        start_time: getStartTime(timeRange),
        limit: 50,
      });

      setTraces(response.traces);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch traces');
    } finally {
      setIsLoading(false);
    }
  }, [service, status, timeRange, getStartTime]);

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  const handleTraceClick = async (trace: TraceSummary) => {
    try {
      setIsLoadingTrace(true);
      const traceDetail = await apiClient.getTraceById(trace.trace_id);
      setSelectedTrace(traceDetail);
    } catch (err) {
      console.error('Failed to fetch trace details:', err);
    } finally {
      setIsLoadingTrace(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Traces</h1>
        <button
          onClick={fetchTraces}
          className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 p-3 sm:p-4 bg-bg-secondary rounded-lg border border-border">
        <input
          type="text"
          placeholder="Service..."
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="flex-1 min-w-[120px] px-3 py-1.5 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent text-sm"
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-1.5 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent text-sm"
        >
          <option value="">All Status</option>
          <option value="ok">OK</option>
          <option value="error">Error</option>
        </select>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-3 py-1.5 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent text-sm"
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

      {/* Traces List */}
      <div className="flex-1 overflow-auto bg-bg-secondary rounded-lg border border-border">
        {isLoading ? (
          <div className="p-8 text-center text-text-secondary">Loading traces...</div>
        ) : traces.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            No traces found matching your criteria
          </div>
        ) : (
          <div className="divide-y divide-border">
            {traces.map((trace) => (
              <div
                key={trace.trace_id}
                onClick={() => handleTraceClick(trace)}
                className="p-3 sm:p-4 hover:bg-bg-tertiary active:bg-bg-tertiary cursor-pointer transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm sm:text-base truncate">{trace.root_span_name}</div>
                    <div className="text-xs sm:text-sm text-text-secondary font-mono">
                      {trace.trace_id.substring(0, 16)}...
                    </div>
                  </div>
                  <div className="text-left sm:text-right flex sm:block items-center gap-3">
                    <div className="font-mono text-sm">{formatDuration(trace.duration_ms)}</div>
                    <div className="text-xs sm:text-sm text-text-secondary">
                      {trace.span_count} spans
                      {trace.error_count > 0 && (
                        <span className="ml-2 text-error">{trace.error_count} errors</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                  <span className="text-text-secondary truncate max-w-[150px]">Service: {trace.service}</span>
                  <span className={`status-badge status-${trace.status}`}>{trace.status}</span>
                  <span className="text-text-secondary hidden sm:inline">{formatTime(trace.start_time)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trace Detail Modal */}
      {selectedTrace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-bg-secondary rounded-lg border border-border w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border">
              <h2 className="text-base sm:text-lg font-bold">Trace Details</h2>
              <button
                onClick={() => setSelectedTrace(null)}
                className="p-2 hover:bg-bg-tertiary rounded"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2 sm:p-4">
              {isLoadingTrace ? (
                <div className="text-center text-text-secondary">Loading...</div>
              ) : (
                <TraceWaterfall trace={selectedTrace} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
