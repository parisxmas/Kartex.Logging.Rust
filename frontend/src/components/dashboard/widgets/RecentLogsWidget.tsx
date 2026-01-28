import { LogEntry, WidgetConfig } from '../../../api/client';

interface RecentLogsData {
  logs: LogEntry[];
}

interface RecentLogsWidgetProps {
  data: unknown;
  config: WidgetConfig;
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

export default function RecentLogsWidget({ data }: RecentLogsWidgetProps) {
  const logsData = data as RecentLogsData | undefined;
  const logs = logsData?.logs ?? [];

  if (logs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        No logs available
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-1">
        {logs.map((log, index) => {
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
  );
}
