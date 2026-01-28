import { useState, useEffect, useRef } from 'react';
import { LogEntry, RealtimeMetrics } from '../api/client';

interface WsMessage {
  type: 'log' | 'span' | 'metrics' | 'connected' | 'error';
  data?: LogEntry | RealtimeMetrics;
  message?: string;
}

export default function LiveStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxLogs = 200;

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

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Live Stream</h1>
          <div className="flex items-center gap-2">
            <span className={`ws-indicator ws-${wsStatus}`}></span>
            <span className="text-sm text-text-secondary capitalize">{wsStatus}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 rounded transition-colors ${
              isPaused ? 'bg-success text-bg-primary' : 'bg-warning text-bg-primary'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Live Metrics */}
      {metrics && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-sm">Logs/sec</div>
            <div className="text-2xl font-mono text-accent">
              {metrics.logs_per_second.toFixed(2)}
            </div>
          </div>
          <div className="p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-sm">Error Rate</div>
            <div className="text-2xl font-mono text-error">
              {(metrics.error_rate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-sm">Errors/sec</div>
            <div className="text-2xl font-mono text-error">
              {metrics.errors_per_second.toFixed(2)}
            </div>
          </div>
          <div className="p-4 bg-bg-secondary rounded-lg border border-border">
            <div className="text-text-secondary text-sm">Last Minute</div>
            <div className="text-2xl font-mono">{metrics.logs_last_minute}</div>
          </div>
        </div>
      )}

      {/* Live Logs */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-bg-secondary rounded-lg border border-border p-2 font-mono text-sm"
      >
        {logs.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            Waiting for live logs...
          </div>
        ) : (
          logs.map((log, index) => {
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
                <span className="text-accent whitespace-nowrap">{log.service}</span>
                <span className="flex-1 truncate">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
