import { useState, useEffect } from 'react';
import { Widget, WidgetConfig, CustomMetricType } from '../../api/client';

interface WidgetConfigModalProps {
  widget: Widget | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (widget: Widget) => void;
}

const timeRangeOptions = [
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 86400, label: '24 hours' },
  { value: 604800, label: '7 days' },
  { value: 2592000, label: '30 days' },
];

const bucketSizeOptions = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 86400, label: '1 day' },
];

const logLevelOptions = [
  { value: '', label: 'All Levels' },
  { value: 'TRACE', label: 'Trace' },
  { value: 'DEBUG', label: 'Debug' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARN', label: 'Warning' },
  { value: 'ERROR', label: 'Error' },
  { value: 'FATAL', label: 'Fatal' },
];

const metricTypeOptions: { value: CustomMetricType; label: string }[] = [
  { value: 'logs_per_second', label: 'Logs per Second' },
  { value: 'errors_per_second', label: 'Errors per Second' },
  { value: 'error_rate', label: 'Error Rate' },
  { value: 'logs_last_minute', label: 'Logs (Last Minute)' },
  { value: 'total_logs', label: 'Total Logs' },
];

export default function WidgetConfigModal({
  widget,
  isOpen,
  onClose,
  onSave,
}: WidgetConfigModalProps) {
  const [title, setTitle] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [config, setConfig] = useState<WidgetConfig | null>(null);

  useEffect(() => {
    if (widget) {
      setTitle(widget.title);
      setRefreshInterval(widget.refresh_interval);
      setConfig({ ...widget.config });
    }
  }, [widget]);

  if (!isOpen || !widget || !config) return null;

  const handleSave = () => {
    onSave({
      ...widget,
      title,
      refresh_interval: refreshInterval,
      config,
    });
    onClose();
  };

  const renderConfigFields = () => {
    switch (config.type) {
      case 'log_count':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Log Level</label>
              <select
                value={config.level || ''}
                onChange={(e) => setConfig({ ...config, level: e.target.value || undefined })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {logLevelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Service (optional)</label>
              <input
                type="text"
                value={config.service || ''}
                onChange={(e) => setConfig({ ...config, service: e.target.value || undefined })}
                placeholder="All services"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time Range</label>
              <select
                value={config.time_range}
                onChange={(e) => setConfig({ ...config, time_range: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {timeRangeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </>
        );

      case 'error_rate_chart':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Time Range</label>
              <select
                value={config.time_range}
                onChange={(e) => setConfig({ ...config, time_range: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {timeRangeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bucket Size</label>
              <select
                value={config.bucket_size}
                onChange={(e) => setConfig({ ...config, bucket_size: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {bucketSizeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Service (optional)</label>
              <input
                type="text"
                value={config.service || ''}
                onChange={(e) => setConfig({ ...config, service: e.target.value || undefined })}
                placeholder="All services"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </>
        );

      case 'recent_logs':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Number of Logs</label>
              <input
                type="number"
                min="1"
                max="50"
                value={config.limit}
                onChange={(e) => setConfig({ ...config, limit: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Log Level</label>
              <select
                value={config.level || ''}
                onChange={(e) => setConfig({ ...config, level: e.target.value || undefined })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {logLevelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Service (optional)</label>
              <input
                type="text"
                value={config.service || ''}
                onChange={(e) => setConfig({ ...config, service: e.target.value || undefined })}
                placeholder="All services"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </>
        );

      case 'trace_latency_histogram':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Time Range</label>
              <select
                value={config.time_range}
                onChange={(e) => setConfig({ ...config, time_range: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {timeRangeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Number of Buckets</label>
              <input
                type="number"
                min="5"
                max="20"
                value={config.buckets}
                onChange={(e) => setConfig({ ...config, buckets: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Service (optional)</label>
              <input
                type="text"
                value={config.service || ''}
                onChange={(e) => setConfig({ ...config, service: e.target.value || undefined })}
                placeholder="All services"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </>
        );

      case 'service_health':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Time Window</label>
              <select
                value={config.time_window}
                onChange={(e) => setConfig({ ...config, time_window: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {timeRangeOptions.slice(0, 4).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Error Threshold (%)</label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={config.error_threshold * 100}
                onChange={(e) => setConfig({ ...config, error_threshold: Number(e.target.value) / 100 })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="text-xs text-text-secondary mt-1">
                Services with error rate above this threshold will be marked as unhealthy
              </p>
            </div>
          </>
        );

      case 'custom_metric':
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Metric Type</label>
            <select
              value={config.metric_type}
              onChange={(e) => setConfig({ ...config, metric_type: e.target.value as CustomMetricType })}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {metricTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Configure Widget</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Widget Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Auto-Refresh Interval</label>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="0">Disabled</option>
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
            </select>
          </div>

          <hr className="border-border" />

          {renderConfigFields()}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-bg-tertiary hover:bg-border rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
