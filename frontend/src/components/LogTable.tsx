import { LogEntry } from '../api/client';

interface LogTableProps {
  logs: LogEntry[];
  isLoading: boolean;
  onLogClick: (log: LogEntry) => void;
}

export default function LogTable({ logs, isLoading, onLogClick }: LogTableProps) {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.toLocaleTimeString()} ${date.toLocaleDateString()}`;
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-text-secondary">Loading logs...</div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center text-text-secondary">
        No logs found matching your criteria
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Desktop Table View */}
      <div className="hidden md:block">
        {/* Header */}
        <div className="sticky top-0 bg-bg-tertiary border-b border-border">
          <div className="flex items-center px-4 py-2 text-sm font-medium text-text-secondary">
            <div className="w-48">Time</div>
            <div className="w-20">Level</div>
            <div className="w-32">Service</div>
            <div className="flex-1">Message</div>
          </div>
        </div>

        {/* Rows */}
        <div>
          {logs.map((log) => {
            const id = typeof log._id === 'object' ? log._id.$oid : log._id;
            return (
              <div
                key={id}
                onClick={() => onLogClick(log)}
                className="flex items-center px-4 py-2 border-b border-border/50 hover:bg-bg-tertiary cursor-pointer transition-colors"
              >
                <div className="w-48 text-sm text-text-secondary font-mono">
                  {formatTimestamp(log.timestamp)}
                </div>
                <div className="w-20">
                  <span className={`level-badge level-${log.level}`}>{log.level}</span>
                </div>
                <div className="w-32 text-sm truncate" title={log.service}>
                  {log.service}
                </div>
                <div className="flex-1 text-sm truncate" title={log.message}>
                  {log.message}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-2 p-2">
        {logs.map((log) => {
          const id = typeof log._id === 'object' ? log._id.$oid : log._id;
          return (
            <div
              key={id}
              onClick={() => onLogClick(log)}
              className="bg-bg-tertiary rounded-lg p-3 border border-border/50 active:bg-border cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`level-badge level-${log.level}`}>{log.level}</span>
                <span className="text-xs text-text-secondary font-mono">
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>
              <div className="text-sm font-medium text-accent mb-1 truncate">
                {log.service}
              </div>
              <div className="text-sm text-text-primary line-clamp-2">
                {log.message}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
