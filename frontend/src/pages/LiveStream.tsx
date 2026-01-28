import { useState, useEffect, useRef, useCallback } from 'react';
import { LogEntry, RealtimeMetrics } from '../api/client';
import QueryBuilder, { QueryBuilderFilters } from '../components/QueryBuilder';

interface WsMessage {
  type: 'log' | 'span' | 'metrics' | 'connected' | 'error';
  data?: LogEntry | RealtimeMetrics;
  message?: string;
}

interface SavedFilter {
  name: string;
  level: string;
  service: string;
  search: string;
  regexMode: boolean;
}

const LEVELS = ['', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const STORAGE_KEY = 'kartex_live_filters';

export default function LiveStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxLogs = 500;

  // View mode
  const [viewMode, setViewMode] = useState<'simple' | 'builder'>('simple');

  // Simple filter state
  const [level, setLevel] = useState('');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');
  const [regexMode, setRegexMode] = useState(false);

  // Builder filters
  const [builderFilters, setBuilderFilters] = useState<QueryBuilderFilters>({});

  // Saved filters (for simple mode)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [showSavedList, setShowSavedList] = useState(false);

  // Load saved filters from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedFilters(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load saved filters:', e);
    }
  }, []);

  // Filter function for simple mode
  const matchesSimpleFilter = useCallback((log: LogEntry): boolean => {
    if (level && log.level !== level) {
      return false;
    }

    if (service) {
      if (!log.service.toLowerCase().includes(service.toLowerCase())) {
        return false;
      }
    }

    if (search) {
      if (regexMode) {
        try {
          const regex = new RegExp(search, 'i');
          if (!regex.test(log.message) && !regex.test(log.service)) {
            return false;
          }
        } catch {
          if (!log.message.toLowerCase().includes(search.toLowerCase())) {
            return false;
          }
        }
      } else {
        const searchLower = search.toLowerCase();
        if (!log.message.toLowerCase().includes(searchLower) &&
            !log.service.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
    }

    return true;
  }, [level, service, search, regexMode]);

  // Filter function for builder mode
  const matchesBuilderFilter = useCallback((log: LogEntry): boolean => {
    const filters = builderFilters;

    if (filters.level && log.level !== filters.level) {
      return false;
    }

    if (filters.service) {
      if (!log.service.toLowerCase().includes(filters.service.toLowerCase())) {
        return false;
      }
    }

    if (filters.search) {
      if (filters.regex) {
        try {
          const regex = new RegExp(filters.search, 'i');
          const field = filters.regex_field || 'message';
          if (field === 'message' && !regex.test(log.message)) return false;
          if (field === 'service' && !regex.test(log.service)) return false;
          if (field === 'all' && !regex.test(log.message) && !regex.test(log.service)) return false;
        } catch {
          return true;
        }
      } else {
        const searchLower = filters.search.toLowerCase();
        if (!log.message.toLowerCase().includes(searchLower) &&
            !log.service.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
    }

    return true;
  }, [builderFilters]);

  // Update filtered logs when filters or logs change
  useEffect(() => {
    if (viewMode === 'simple') {
      if (!level && !service && !search) {
        setFilteredLogs(logs);
      } else {
        setFilteredLogs(logs.filter(matchesSimpleFilter));
      }
    } else {
      const hasFilters = builderFilters.level || builderFilters.service || builderFilters.search;
      if (!hasFilters) {
        setFilteredLogs(logs);
      } else {
        setFilteredLogs(logs.filter(matchesBuilderFilter));
      }
    }
  }, [logs, level, service, search, regexMode, viewMode, builderFilters, matchesSimpleFilter, matchesBuilderFilter]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      setWsStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setWsStatus('disconnected');
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);

          if (msg.type === 'log' && msg.data && !isPaused) {
            setLogs((prev) => {
              const newLogs = [msg.data as LogEntry, ...prev];
              return newLogs.slice(0, maxLogs);
            });
          } else if (msg.type === 'metrics' && msg.data) {
            setMetrics(msg.data as RealtimeMetrics);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isPaused]);

  const clearLogs = () => {
    setLogs([]);
  };

  const clearFilters = () => {
    setLevel('');
    setService('');
    setSearch('');
    setRegexMode(false);
  };

  const handleSaveFilter = () => {
    if (!filterName.trim()) return;

    const newFilter: SavedFilter = {
      name: filterName.trim(),
      level,
      service,
      search,
      regexMode,
    };

    const updated = [...savedFilters.filter(f => f.name !== newFilter.name), newFilter];
    setSavedFilters(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShowSaveModal(false);
    setFilterName('');
  };

  const loadFilter = (filter: SavedFilter) => {
    setLevel(filter.level);
    setService(filter.service);
    setSearch(filter.search);
    setRegexMode(filter.regexMode);
    setShowSavedList(false);
  };

  const deleteFilter = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedFilters.filter(f => f.name !== name);
    setSavedFilters(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const hasActiveFilters = viewMode === 'simple'
    ? (level || service || search)
    : (builderFilters.level || builderFilters.service || builderFilters.search);
  const canSave = level || service || search;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl sm:text-2xl font-bold">Live Stream</h1>
          <div className="flex items-center gap-2">
            <span className={`ws-indicator ws-${wsStatus}`}></span>
            <span className="text-sm text-text-secondary capitalize">{wsStatus}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-bg-secondary rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'simple'
                  ? 'bg-accent text-white'
                  : 'hover:bg-bg-tertiary'
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setViewMode('builder')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'builder'
                  ? 'bg-accent text-white'
                  : 'hover:bg-bg-tertiary'
              }`}
            >
              Builder
            </button>
          </div>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 rounded transition-colors text-sm ${
              isPaused ? 'bg-success text-bg-primary' : 'bg-warning text-bg-primary'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Query Builder Mode */}
      {viewMode === 'builder' && (
        <div className="mb-4">
          <QueryBuilder onFiltersChange={setBuilderFilters} />
          {hasActiveFilters && (
            <div className="mt-2 text-xs text-text-secondary">
              Showing {filteredLogs.length} of {logs.length} logs (filtered in real-time)
            </div>
          )}
        </div>
      )}

      {/* Simple Filters Mode */}
      {viewMode === 'simple' && (
        <div className="mb-4 p-3 sm:p-4 bg-bg-secondary rounded-lg border border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <span className="text-sm font-medium text-text-secondary">Live Filters</span>
            <div className="flex flex-wrap gap-2">
              {/* Saved Filters Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSavedList(!showSavedList)}
                  className="px-2 py-1 text-xs bg-bg-tertiary hover:bg-border rounded transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Saved ({savedFilters.length})
                </button>
                {showSavedList && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowSavedList(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 w-64 bg-bg-secondary border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-auto">
                      {savedFilters.length === 0 ? (
                        <div className="p-3 text-sm text-text-secondary text-center">
                          No saved filters
                        </div>
                      ) : (
                        savedFilters.map((filter) => (
                          <div
                            key={filter.name}
                            onClick={() => loadFilter(filter)}
                            className="p-2 hover:bg-bg-tertiary cursor-pointer flex items-center justify-between group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{filter.name}</div>
                              <div className="text-xs text-text-secondary">
                                {[filter.level, filter.service, filter.search].filter(Boolean).join(', ') || 'No filters'}
                              </div>
                            </div>
                            <button
                              onClick={(e) => deleteFilter(filter.name, e)}
                              className="p-1 text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete filter"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Save Button */}
              <button
                onClick={() => setShowSaveModal(true)}
                disabled={!canSave}
                className="px-2 py-1 text-xs bg-accent hover:bg-accent/80 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save
              </button>

              <button
                onClick={clearFilters}
                className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="px-3 py-1.5 bg-bg-tertiary border border-border rounded text-sm focus:outline-none focus:border-accent"
            >
              <option value="">All Levels</option>
              {LEVELS.filter(Boolean).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Service..."
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="px-3 py-1.5 bg-bg-tertiary border border-border rounded text-sm focus:outline-none focus:border-accent w-32 sm:w-auto"
            />

            <div className="flex-1 min-w-[150px] flex gap-1">
              <input
                type="text"
                placeholder={regexMode ? 'Regex pattern...' : 'Search...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`flex-1 px-3 py-1.5 bg-bg-tertiary border rounded text-sm focus:outline-none focus:border-accent ${
                  regexMode ? 'border-accent font-mono' : 'border-border'
                }`}
              />
              <button
                onClick={() => setRegexMode(!regexMode)}
                className={`px-2 py-1.5 rounded text-xs font-mono transition-colors ${
                  regexMode
                    ? 'bg-accent text-white'
                    : 'bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary'
                }`}
                title={regexMode ? 'Disable regex' : 'Enable regex'}
              >
                .*
              </button>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-2 text-xs text-text-secondary">
              Showing {filteredLogs.length} of {logs.length} logs
            </div>
          )}
        </div>
      )}

      {/* Live Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4">
          <div className="p-3 sm:p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-xs sm:text-sm">Logs/sec</div>
            <div className="text-xl sm:text-2xl font-mono text-accent">
              {metrics.logs_per_second.toFixed(2)}
            </div>
          </div>
          <div className="p-3 sm:p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-xs sm:text-sm">Error Rate</div>
            <div className="text-xl sm:text-2xl font-mono text-error">
              {(metrics.error_rate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="p-3 sm:p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-xs sm:text-sm">Errors/sec</div>
            <div className="text-xl sm:text-2xl font-mono text-error">
              {metrics.errors_per_second.toFixed(2)}
            </div>
          </div>
          <div className="p-3 sm:p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-xs sm:text-sm">Last Minute</div>
            <div className="text-xl sm:text-2xl font-mono">{metrics.logs_last_minute}</div>
          </div>
        </div>
      )}

      {/* Live Logs */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-bg-secondary rounded-lg border border-border p-2 font-mono text-xs sm:text-sm"
      >
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            {logs.length === 0 ? 'Waiting for live logs...' : 'No logs match your filters'}
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            const id = typeof log._id === 'object' ? log._id.$oid : log._id;
            return (
              <div
                key={`${id}-${index}`}
                className="flex items-start gap-2 sm:gap-3 py-1 hover:bg-bg-tertiary rounded px-2"
              >
                <span className="text-text-secondary whitespace-nowrap">
                  {formatTime(log.timestamp)}
                </span>
                <span className={`level-badge level-${log.level}`}>{log.level}</span>
                <span className="text-accent whitespace-nowrap truncate max-w-[80px] sm:max-w-none">{log.service}</span>
                <span className="flex-1 truncate">{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Save Filter Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-secondary rounded-lg border border-border w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold">Save Filter</h2>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setFilterName('');
                }}
                className="p-1 hover:bg-bg-tertiary rounded"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <label className="block text-sm text-text-secondary mb-2">Filter Name</label>
              <input
                type="text"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Enter a name for this filter..."
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filterName.trim()) {
                    handleSaveFilter();
                  }
                }}
              />
              <div className="mt-2 text-xs text-text-secondary">
                {[
                  level && `Level: ${level}`,
                  service && `Service: ${service}`,
                  search && `Search: ${search}${regexMode ? ' (regex)' : ''}`,
                ].filter(Boolean).join(', ') || 'No filters set'}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setFilterName('');
                }}
                className="px-4 py-2 bg-bg-tertiary hover:bg-border rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFilter}
                disabled={!filterName.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
