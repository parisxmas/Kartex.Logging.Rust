import { useState, useEffect, useRef } from 'react';
import { LogEntry, WidgetConfigLiveStream } from '../../../api/client';

interface WsMessage {
  type: 'log' | 'span' | 'metrics' | 'connected' | 'error';
  data?: LogEntry;
  message?: string;
}

interface LiveStreamWidgetProps {
  config: WidgetConfigLiveStream;
}

export default function LiveStreamWidget({ config }: LiveStreamWidgetProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxLogs = config.max_logs || 50;

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
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setWsStatus('disconnected');
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);

          if (msg.type === 'log' && msg.data && !isPaused) {
            const log = msg.data as LogEntry;

            // Apply filters
            if (config.level && log.level !== config.level) return;
            if (config.service && log.service !== config.service) return;

            setLogs((prev) => {
              const newLogs = [log, ...prev];
              return newLogs.slice(0, maxLogs);
            });

            // Auto-scroll if enabled
            if (config.auto_scroll && containerRef.current) {
              containerRef.current.scrollTop = 0;
            }
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
  }, [isPaused, config.level, config.service, config.auto_scroll, maxLogs]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLevelClass = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'text-error';
      case 'WARN':
      case 'WARNING':
        return 'text-warning';
      case 'INFO':
        return 'text-accent';
      case 'DEBUG':
        return 'text-text-secondary';
      default:
        return 'text-text-primary';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            wsStatus === 'connected' ? 'bg-success' :
            wsStatus === 'connecting' ? 'bg-warning animate-pulse' :
            'bg-error'
          }`} />
          <span className="text-text-secondary">{logs.length} logs</span>
        </div>
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`px-2 py-0.5 rounded text-xs ${
            isPaused ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
          }`}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {/* Log stream */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto font-mono text-xs space-y-0.5"
      >
        {logs.length === 0 ? (
          <div className="p-4 text-center text-text-secondary">
            Waiting for logs...
          </div>
        ) : (
          logs.map((log, index) => {
            const id = typeof log._id === 'object' ? log._id.$oid : log._id;
            return (
              <div
                key={`${id}-${index}`}
                className="flex items-start gap-2 py-0.5 hover:bg-bg-tertiary rounded px-1"
              >
                <span className="text-text-secondary whitespace-nowrap">
                  {formatTime(log.timestamp)}
                </span>
                <span className={`font-semibold ${getLevelClass(log.level)}`}>
                  {log.level.substring(0, 4)}
                </span>
                <span className="text-accent whitespace-nowrap truncate max-w-[80px]">
                  {log.service}
                </span>
                <span className="flex-1 truncate text-text-primary">
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
