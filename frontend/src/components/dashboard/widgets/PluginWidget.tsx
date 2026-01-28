import { useEffect, useRef, useState, useCallback } from 'react';
import { WidgetConfigPlugin, LogEntry, apiClient } from '../../../api/client';

interface PluginWidgetProps {
  config: WidgetConfigPlugin;
}

interface PluginHostApi {
  getLogs: (params?: { level?: string; service?: string; limit?: number }) => Promise<LogEntry[]>;
  getMetrics: () => Promise<{
    logs_per_second: number;
    error_rate: number;
    errors_per_second: number;
    logs_last_minute: number;
  }>;
  getConfig: () => Record<string, unknown>;
  getTheme: () => 'light' | 'dark';
  render: (html: string) => void;
  log: (message: string) => void;
}

interface PluginModule {
  init?: (api: PluginHostApi) => void | Promise<void>;
  onLog?: (log: LogEntry) => void;
  onTick?: () => void | Promise<void>;
  destroy?: () => void;
}

export default function PluginWidget({ config }: PluginWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<PluginModule | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tickIntervalRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [output, setOutput] = useState<string>('');

  // Host API for the plugin
  const createHostApi = useCallback((): PluginHostApi => {
    return {
      getLogs: async (params = {}) => {
        const response = await apiClient.getLogs({
          level: params.level || config.level,
          service: params.service || config.service,
          limit: params.limit || 50,
        });
        return response.logs;
      },
      getMetrics: async () => {
        return await apiClient.getMetrics();
      },
      getConfig: () => {
        return config.plugin_config || {};
      },
      getTheme: () => {
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      },
      render: (html: string) => {
        setOutput(html);
      },
      log: (message: string) => {
        console.log(`[Plugin ${config.url}]`, message);
      },
    };
  }, [config]);

  // Load JavaScript plugin
  const loadJavaScriptPlugin = useCallback(async (url: string): Promise<PluginModule> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch plugin: ${response.statusText}`);
    }
    const code = await response.text();

    // Create a sandboxed function that returns the plugin module
    // The plugin code should export: init, onLog, onTick, destroy
    const moduleFactory = new Function('exports', `
      ${code}
      return exports;
    `);

    const exports: PluginModule = {};
    moduleFactory(exports);
    return exports;
  }, []);

  // Load WASM plugin
  const loadWasmPlugin = useCallback(async (url: string): Promise<PluginModule> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM plugin: ${response.statusText}`);
    }
    const wasmBytes = await response.arrayBuffer();

    // Create import object for WASM
    const importObject = {
      env: {
        // Memory for string passing
        memory: new WebAssembly.Memory({ initial: 256 }),
        // Console logging
        console_log: (ptr: number, len: number) => {
          const memory = wasmInstance?.exports.memory as WebAssembly.Memory;
          const bytes = new Uint8Array(memory.buffer, ptr, len);
          const text = new TextDecoder().decode(bytes);
          console.log(`[WASM Plugin]`, text);
        },
      },
    };

    const wasmModule = await WebAssembly.compile(wasmBytes);
    const wasmInstance = await WebAssembly.instantiate(wasmModule, importObject);

    // Wrap WASM exports as PluginModule
    const exports = wasmInstance.exports as Record<string, unknown>;
    return {
      init: exports.init as PluginModule['init'],
      onLog: exports.on_log as PluginModule['onLog'],
      onTick: exports.on_tick as PluginModule['onTick'],
      destroy: exports.destroy as PluginModule['destroy'],
    };
  }, []);

  // Setup WebSocket for real-time logs
  const setupWebSocket = useCallback(() => {
    if (!config.realtime) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // WebSocket messages are wrapped: { type: "log", data: {...} }
        if (message.type !== 'log' || !message.data) {
          return;
        }

        const log: LogEntry = message.data;

        // Filter by level/service if configured
        if (config.level && log.level !== config.level) return;
        if (config.service && log.service !== config.service) return;

        // Push to plugin
        if (pluginRef.current?.onLog) {
          pluginRef.current.onLog(log);
        }
      } catch (err) {
        console.error('Failed to parse log message:', err);
      }
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
    };

    ws.onclose = () => {
      // Reconnect after 5 seconds
      setTimeout(() => {
        if (config.realtime) {
          setupWebSocket();
        }
      }, 5000);
    };
  }, [config.realtime, config.level, config.service]);

  // Load and initialize plugin
  useEffect(() => {
    let mounted = true;

    const loadPlugin = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load plugin based on type
        let plugin: PluginModule;
        if (config.plugin_type === 'wasm') {
          plugin = await loadWasmPlugin(config.url);
        } else {
          plugin = await loadJavaScriptPlugin(config.url);
        }

        if (!mounted) return;

        pluginRef.current = plugin;

        // Initialize plugin with host API
        if (plugin.init) {
          await plugin.init(createHostApi());
        }

        // Setup real-time WebSocket if enabled
        if (config.realtime) {
          setupWebSocket();
        }

        // Setup tick interval (every 10 seconds)
        if (plugin.onTick) {
          tickIntervalRef.current = window.setInterval(async () => {
            if (pluginRef.current?.onTick) {
              await pluginRef.current.onTick();
            }
          }, 10000);

          // Initial tick
          await plugin.onTick();
        }

        setLoading(false);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load plugin');
        setLoading(false);
      }
    };

    loadPlugin();

    return () => {
      mounted = false;

      // Cleanup
      if (pluginRef.current?.destroy) {
        pluginRef.current.destroy();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
    };
  }, [config.url, config.plugin_type, config.realtime, createHostApi, loadJavaScriptPlugin, loadWasmPlugin, setupWebSocket]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
          <span className="text-sm">Loading plugin...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-error text-sm mb-2">Plugin Error</div>
          <div className="text-xs text-text-secondary">{error}</div>
          <div className="text-xs text-text-tertiary mt-2 font-mono truncate max-w-full">
            {config.url}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto plugin-container"
      dangerouslySetInnerHTML={{ __html: output }}
    />
  );
}
