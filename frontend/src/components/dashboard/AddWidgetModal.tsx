import { useState } from 'react';
import { Widget, WidgetType, WidgetConfig } from '../../api/client';

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
];

export default function AddWidgetModal({ isOpen, onClose, onAdd }: AddWidgetModalProps) {
  const [selectedType, setSelectedType] = useState<WidgetTypeOption | null>(null);
  const [title, setTitle] = useState('');

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!selectedType) return;

    const widget: Widget = {
      id: `widget-${Date.now()}`,
      widget_type: selectedType.type,
      title: title || selectedType.name,
      config: selectedType.defaultConfig,
      refresh_interval: 30,
    };

    onAdd(widget);
    setSelectedType(null);
    setTitle('');
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

        <div className="p-4">
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
              className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
            >
              Add Widget
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
