import { useState } from 'react';
import { Widget, WidgetType, WidgetConfig, PluginType } from '../../api/client';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (widget: Widget) => void;
}

interface WidgetTypeOption {
  type: WidgetType;
  name: string;
  description: string;
  icon: string;
  defaultConfig: WidgetConfig;
  defaultWidth: number;
  defaultHeight: number;
}

const widgetTypes: WidgetTypeOption[] = [
  {
    type: 'log_count',
    name: 'Log Count',
    description: 'Display total or filtered log count',
    icon: '#',
    defaultConfig: { type: 'log_count', time_range: 86400 },
    defaultWidth: 3,
    defaultHeight: 2,
  },
  {
    type: 'error_rate_chart',
    name: 'Error Rate Chart',
    description: 'Line chart showing error rate over time',
    icon: '~',
    defaultConfig: { type: 'error_rate_chart', time_range: 86400, bucket_size: 3600 },
    defaultWidth: 6,
    defaultHeight: 4,
  },
  {
    type: 'recent_logs',
    name: 'Recent Logs',
    description: 'Scrollable list of latest logs',
    icon: '=',
    defaultConfig: { type: 'recent_logs', limit: 10 },
    defaultWidth: 6,
    defaultHeight: 4,
  },
  {
    type: 'trace_latency_histogram',
    name: 'Trace Latency',
    description: 'Distribution of trace durations',
    icon: '|',
    defaultConfig: { type: 'trace_latency_histogram', time_range: 86400, buckets: 10 },
    defaultWidth: 6,
    defaultHeight: 4,
  },
  {
    type: 'service_health',
    name: 'Service Health',
    description: 'Status indicators per service',
    icon: '+',
    defaultConfig: { type: 'service_health', time_window: 300, error_threshold: 0.05 },
    defaultWidth: 6,
    defaultHeight: 3,
  },
  {
    type: 'custom_metric',
    name: 'Custom Metric',
    description: 'Single metric from realtime metrics',
    icon: '@',
    defaultConfig: { type: 'custom_metric', metric_type: 'logs_per_second' },
    defaultWidth: 3,
    defaultHeight: 2,
  },
  {
    type: 'live_stream',
    name: 'Live Stream',
    description: 'Real-time log stream via WebSocket',
    icon: '>',
    defaultConfig: { type: 'live_stream', max_logs: 50, auto_scroll: true },
    defaultWidth: 6,
    defaultHeight: 5,
  },
  {
    type: 'plugin',
    name: 'Plugin',
    description: 'Load external JS/WASM plugin from URL',
    icon: '{}',
    defaultConfig: { type: 'plugin', url: '', plugin_type: 'javascript' as PluginType, realtime: false },
    defaultWidth: 6,
    defaultHeight: 4,
  },
];

export default function AddWidgetModal({ isOpen, onClose, onAdd }: AddWidgetModalProps) {
  const [selectedType, setSelectedType] = useState<WidgetTypeOption | null>(null);
  const [title, setTitle] = useState('');
  const [pluginUrl, setPluginUrl] = useState('');
  const [pluginType, setPluginType] = useState<PluginType>('javascript');
  const [pluginRealtime, setPluginRealtime] = useState(false);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!selectedType) return;

    // For plugin type, validate URL and create custom config
    if (selectedType.type === 'plugin') {
      if (!pluginUrl.trim()) {
        return; // Don't add without URL
      }
    }

    let config: WidgetConfig = selectedType.defaultConfig;

    // Override config for plugin type
    if (selectedType.type === 'plugin') {
      config = {
        type: 'plugin',
        url: pluginUrl.trim(),
        plugin_type: pluginType,
        realtime: pluginRealtime,
      };
    }

    const widget: Widget = {
      id: `widget-${Date.now()}`,
      widget_type: selectedType.type,
      title: title || selectedType.name,
      config,
      refresh_interval: selectedType.type === 'plugin' ? 0 : 30, // Plugins manage their own refresh
    };

    onAdd(widget);
    setSelectedType(null);
    setTitle('');
    setPluginUrl('');
    setPluginType('javascript');
    setPluginRealtime(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Add Widget</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {!selectedType ? (
            <div className="grid grid-cols-2 gap-3">
              {widgetTypes.map((wt) => (
                <button
                  key={wt.type}
                  onClick={() => setSelectedType(wt)}
                  className="p-4 text-left bg-bg-tertiary hover:bg-border/50 border border-border rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-8 h-8 flex items-center justify-center bg-accent/20 text-accent rounded font-mono text-lg">
                      {wt.icon}
                    </span>
                    <span className="font-medium">{wt.name}</span>
                  </div>
                  <p className="text-xs text-text-secondary">{wt.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Widget Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={selectedType.name}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span className="w-6 h-6 flex items-center justify-center bg-accent/20 text-accent rounded font-mono">
                  {selectedType.icon}
                </span>
                <span>{selectedType.name}</span>
              </div>
              <p className="text-sm text-text-secondary">
                {selectedType.description}. You can configure additional options after adding.
              </p>

              {/* Plugin-specific fields */}
              {selectedType.type === 'plugin' && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div>
                    <label className="block text-sm font-medium mb-1">Plugin URL *</label>
                    <input
                      type="url"
                      value={pluginUrl}
                      onChange={(e) => setPluginUrl(e.target.value)}
                      placeholder="https://example.com/plugin.js"
                      className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent font-mono text-sm"
                    />
                    <p className="text-xs text-text-tertiary mt-1">URL to the JavaScript or WASM plugin file</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Plugin Type</label>
                    <select
                      value={pluginType}
                      onChange={(e) => setPluginType(e.target.value as PluginType)}
                      className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="wasm">WebAssembly (WASM)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="plugin-realtime"
                      checked={pluginRealtime}
                      onChange={(e) => setPluginRealtime(e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-bg-tertiary text-accent focus:ring-accent"
                    />
                    <label htmlFor="plugin-realtime" className="text-sm">
                      Enable real-time log streaming
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          {selectedType && (
            <button
              onClick={() => setSelectedType(null)}
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-bg-tertiary hover:bg-border rounded transition-colors"
          >
            Cancel
          </button>
          {selectedType && (
            <button
              onClick={handleAdd}
              disabled={selectedType.type === 'plugin' && !pluginUrl.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Widget
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
