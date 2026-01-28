import { LogEntry } from '../api/client';

interface LogModalProps {
  log: LogEntry;
  onClose: () => void;
}

export default function LogModal({ log, onClose }: LogModalProps) {
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getId = () => {
    return typeof log._id === 'object' ? log._id.$oid : log._id;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-secondary rounded-lg border border-border w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">Log Details</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-tertiary rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">ID</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded font-mono text-sm break-all">
              {getId()}
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Timestamp</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded font-mono">
              {formatTimestamp(log.timestamp)}
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Level</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded">
              <span className={`level-badge level-${log.level}`}>{log.level}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Service</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded">{log.service}</div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Source IP</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded font-mono">
              {log.source_ip}
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Message</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded whitespace-pre-wrap">
              {log.message}
            </div>
          </div>

          {log.trace_id && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">Trace ID</label>
              <div className="px-3 py-2 bg-bg-tertiary rounded font-mono text-sm break-all">
                {log.trace_id}
              </div>
            </div>
          )}

          {log.span_id && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">Span ID</label>
              <div className="px-3 py-2 bg-bg-tertiary rounded font-mono text-sm break-all">
                {log.span_id}
              </div>
            </div>
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">Metadata</label>
              <pre className="px-3 py-2 bg-bg-tertiary rounded font-mono text-sm overflow-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-bg-tertiary hover:bg-border rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
