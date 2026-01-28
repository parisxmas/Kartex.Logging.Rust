import { useMemo } from 'react';
import { LogEntry, WidgetConfig } from '../../../api/client';
import { FilterSelection } from './SavedFilterSelect';

interface RecentLogsData {
  logs: LogEntry[];
}

interface RecentLogsWidgetProps {
  data: unknown;
  config: WidgetConfig;
  filter?: FilterSelection | null;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getLevelBadgeClass(level: string): string {
  const levelUpper = level.toUpperCase();
  switch (levelUpper) {
    case 'TRACE':
      return 'bg-level-trace/20 text-level-trace';
    case 'DEBUG':
      return 'bg-level-debug/20 text-level-debug';
    case 'INFO':
      return 'bg-level-info/20 text-level-info';
    case 'WARN':
      return 'bg-level-warn/20 text-level-warn';
    case 'ERROR':
      return 'bg-level-error/20 text-level-error';
    case 'FATAL':
      return 'bg-level-fatal/20 text-level-fatal';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}

export default function RecentLogsWidget({ data, filter }: RecentLogsWidgetProps) {
  const logsData = data as RecentLogsData | undefined;
  const allLogs = logsData?.logs ?? [];

  // Apply client-side filtering based on saved filter
  const filteredLogs = useMemo(() => {
    if (!filter) return allLogs;

    return allLogs.filter((log) => {
      if (filter.level && log.level.toUpperCase() !== filter.level.toUpperCase()) {
        return false;
      }
      if (filter.service && log.service !== filter.service) {
        return false;
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        if (!log.message.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [allLogs, filter]);

  // Show count when filter is active
  const showCount = filter && (filter.level || filter.service || filter.search);

  return (
    <div className="h-full flex flex-col">
      {/* Count indicator when filtered */}
      {showCount && (
        <div className="text-xs text-text-secondary mb-1 shrink-0">
          Showing {filteredLogs.length} of {allLogs.length}
        </div>
      )}

      {/* Logs list */}
      {filteredLogs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
          {allLogs.length === 0 ? 'No logs available' : 'No matching logs'}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-1">
            {filteredLogs.map((log, index) => {
              const id = typeof log._id === 'string' ? log._id : log._id?.$oid || index;
              return (
                <div
                  key={id}
                  className="flex items-start gap-2 p-2 rounded bg-bg-tertiary hover:bg-border/30 transition-colors"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0 ${getLevelBadgeClass(log.level)}`}
                  >
                    {log.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{log.message}</p>
                    <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
                      <span>{log.service}</span>
                      <span>{formatTimestamp(log.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
