import { useState } from 'react';
import { TraceDetail, Span } from '../api/client';

interface TraceWaterfallProps {
  trace: TraceDetail;
}

export default function TraceWaterfall({ trace }: TraceWaterfallProps) {
  const [activeTab, setActiveTab] = useState<'waterfall' | 'spans' | 'logs'>('waterfall');
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

  const { spans, logs } = trace;

  if (spans.length === 0) {
    return <div className="text-text-secondary">No spans found in this trace</div>;
  }

  // Find root span and calculate timeline
  const rootSpan = spans.find((s) => !s.parent_span_id) || spans[0];
  const traceStart = rootSpan.start_time_unix_nano;
  const traceEnd = Math.max(...spans.map((s) => s.end_time_unix_nano));
  const traceDuration = traceEnd - traceStart;

  // Sort spans by start time
  const sortedSpans = [...spans].sort(
    (a, b) => a.start_time_unix_nano - b.start_time_unix_nano
  );

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <span className="text-text-secondary text-sm">Trace ID</span>
          <div className="font-mono text-sm break-all">{trace.trace_id}</div>
        </div>
        <div>
          <span className="text-text-secondary text-sm">Duration</span>
          <div className="font-mono">{formatDuration((traceEnd - traceStart) / 1000000)}</div>
        </div>
        <div>
          <span className="text-text-secondary text-sm">Spans</span>
          <div>{spans.length}</div>
        </div>
        <div>
          <span className="text-text-secondary text-sm">Service</span>
          <div>{rootSpan.service}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('waterfall')}
          className={`px-4 py-2 -mb-px ${
            activeTab === 'waterfall'
              ? 'border-b-2 border-accent text-accent'
              : 'text-text-secondary'
          }`}
        >
          Waterfall
        </button>
        <button
          onClick={() => setActiveTab('spans')}
          className={`px-4 py-2 -mb-px ${
            activeTab === 'spans'
              ? 'border-b-2 border-accent text-accent'
              : 'text-text-secondary'
          }`}
        >
          Spans
        </button>
        {logs.length > 0 && (
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 -mb-px ${
              activeTab === 'logs'
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-secondary'
            }`}
          >
            Logs ({logs.length})
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'waterfall' && (
        <div className="space-y-1">
          {sortedSpans.map((span) => {
            const offset = ((span.start_time_unix_nano - traceStart) / traceDuration) * 100;
            const width = Math.max(
              ((span.end_time_unix_nano - span.start_time_unix_nano) / traceDuration) * 100,
              0.5
            );
            const isError = span.status?.code === 'ERROR';

            return (
              <div
                key={span.span_id}
                onClick={() => setSelectedSpan(span)}
                className="flex items-center gap-2 hover:bg-bg-tertiary rounded p-1 cursor-pointer"
              >
                <div className="w-48 truncate text-sm">
                  <div className="font-medium truncate" title={span.name}>
                    {span.name}
                  </div>
                  <div className="text-xs text-text-secondary truncate">{span.service}</div>
                </div>
                <div className="flex-1 h-6 bg-bg-tertiary rounded relative">
                  <div
                    className={`absolute h-full rounded ${
                      isError ? 'bg-error' : 'bg-accent'
                    } opacity-80`}
                    style={{ left: `${offset}%`, width: `${width}%` }}
                  />
                  <span
                    className="absolute text-xs text-text-primary px-1"
                    style={{ left: `${offset + width + 1}%` }}
                  >
                    {formatDuration(span.duration_ms)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'spans' && (
        <div className="space-y-3">
          {sortedSpans.map((span) => (
            <div
              key={span.span_id}
              className={`p-4 bg-bg-tertiary rounded border ${
                span.status?.code === 'ERROR' ? 'border-error' : 'border-border'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{span.name}</div>
                  <div className="text-sm text-text-secondary">{span.service}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono">{formatDuration(span.duration_ms)}</div>
                  <div className="text-xs text-text-secondary">{span.kind}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-text-secondary space-y-1">
                <div>
                  <span className="font-medium">Span ID:</span>{' '}
                  <code>{span.span_id}</code>
                </div>
                {span.parent_span_id && (
                  <div>
                    <span className="font-medium">Parent:</span>{' '}
                    <code>{span.parent_span_id}</code>
                  </div>
                )}
              </div>
              {span.status && span.status.code !== 'UNSET' && (
                <div
                  className={`mt-2 text-sm ${
                    span.status.code === 'ERROR' ? 'text-error' : 'text-success'
                  }`}
                >
                  Status: {span.status.code}
                  {span.status.message && ` - ${span.status.message}`}
                </div>
              )}
              {span.attributes && Object.keys(span.attributes).length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-text-secondary mb-1">
                    Attributes
                  </div>
                  <pre className="text-xs bg-bg-secondary p-2 rounded overflow-auto">
                    {JSON.stringify(span.attributes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-1 font-mono text-sm">
          {logs.map((log, index) => {
            const id = typeof log._id === 'object' ? log._id.$oid : log._id;
            return (
              <div
                key={`${id}-${index}`}
                className="flex items-start gap-3 py-1 hover:bg-bg-tertiary rounded px-2"
              >
                <span className="text-text-secondary whitespace-nowrap">
                  {formatTime(log.timestamp)}
                </span>
                <span className={`level-badge level-${log.level}`}>{log.level}</span>
                <span className="flex-1">{log.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Span Detail Modal */}
      {selectedSpan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-secondary rounded-lg border border-border w-full max-w-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">{selectedSpan.name}</h3>
              <button
                onClick={() => setSelectedSpan(null)}
                className="p-1 hover:bg-bg-tertiary rounded"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
              <div>
                <span className="text-text-secondary">Service:</span> {selectedSpan.service}
              </div>
              <div>
                <span className="text-text-secondary">Kind:</span> {selectedSpan.kind}
              </div>
              <div>
                <span className="text-text-secondary">Duration:</span>{' '}
                {formatDuration(selectedSpan.duration_ms)}
              </div>
              <div>
                <span className="text-text-secondary">Span ID:</span>{' '}
                <code className="text-xs">{selectedSpan.span_id}</code>
              </div>
              {selectedSpan.parent_span_id && (
                <div>
                  <span className="text-text-secondary">Parent Span ID:</span>{' '}
                  <code className="text-xs">{selectedSpan.parent_span_id}</code>
                </div>
              )}
              {selectedSpan.status && selectedSpan.status.code !== 'UNSET' && (
                <div>
                  <span className="text-text-secondary">Status:</span>{' '}
                  <span
                    className={
                      selectedSpan.status.code === 'ERROR' ? 'text-error' : 'text-success'
                    }
                  >
                    {selectedSpan.status.code}
                  </span>
                  {selectedSpan.status.message && ` - ${selectedSpan.status.message}`}
                </div>
              )}
              {selectedSpan.attributes && Object.keys(selectedSpan.attributes).length > 0 && (
                <div>
                  <div className="text-text-secondary mb-1">Attributes:</div>
                  <pre className="bg-bg-tertiary p-2 rounded text-xs overflow-auto">
                    {JSON.stringify(selectedSpan.attributes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
