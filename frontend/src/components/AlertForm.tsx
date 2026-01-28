import { useState, useEffect } from 'react';
import { AlertRule, AlertCondition, AlertAction } from '../api/client';

interface NotificationChannel {
  _id: { $oid: string } | string;
  name: string;
  channel_type: string;
  enabled: boolean;
}

interface AlertFormProps {
  alert: AlertRule | null;
  onSave: (alert: Omit<AlertRule, '_id' | 'last_triggered' | 'trigger_count'>) => Promise<void>;
  onCancel: () => void;
}

const CONDITION_TYPES: Array<{ value: AlertCondition['type']; label: string }> = [
  { value: 'error_rate', label: 'Error Rate (%)' },
  { value: 'errors_per_second', label: 'Errors per Second' },
  { value: 'logs_per_second', label: 'Logs per Second' },
  { value: 'level_count', label: 'Level Count' },
];

const LEVELS = ['ERROR', 'FATAL', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

const ACTION_TYPES: Array<{ value: AlertAction['type']; label: string }> = [
  { value: 'log', label: 'Log to Console' },
  { value: 'webhook', label: 'Webhook' },
];

export default function AlertForm({ alert, onSave, onCancel }: AlertFormProps) {
  const [name, setName] = useState(alert?.name || '');
  const [enabled, setEnabled] = useState(alert?.enabled ?? true);
  const [conditionType, setConditionType] = useState<AlertCondition['type']>(
    alert?.condition.type || 'error_rate'
  );
  const [threshold, setThreshold] = useState(() => {
    if (!alert) return '';
    if (alert.condition.type === 'error_rate') {
      return (alert.condition.threshold * 100).toString();
    }
    return alert.condition.threshold.toString();
  });
  const [level, setLevel] = useState(alert?.condition.level || 'ERROR');
  const [actionType, setActionType] = useState<AlertAction['type']>(
    alert?.action.type || 'log'
  );
  const [webhookUrl, setWebhookUrl] = useState(alert?.action.url || '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Notification channels
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(alert?.notification_channels || []);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const response = await fetch('/api/channels', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
          const data = await response.json();
          setChannels(data.channels.filter((c: NotificationChannel) => c.enabled));
        }
      } catch (err) {
        console.error('Failed to fetch channels:', err);
      }
    };
    fetchChannels();
  }, []);

  const getChannelId = (channel: NotificationChannel): string => {
    return typeof channel._id === 'object' ? channel._id.$oid : channel._id;
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'slack': return '💬';
      case 'discord': return '🎮';
      case 'pagerduty': return '📟';
      case 'email': return '📧';
      case 'webhook': return '🔗';
      default: return '📢';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!threshold || isNaN(parseFloat(threshold))) {
      setError('Valid threshold is required');
      return;
    }

    if (actionType === 'webhook' && !webhookUrl.trim()) {
      setError('Webhook URL is required');
      return;
    }

    let parsedThreshold = parseFloat(threshold);
    if (conditionType === 'error_rate') {
      parsedThreshold = parsedThreshold / 100;
    }

    const alertData: Omit<AlertRule, '_id' | 'last_triggered' | 'trigger_count'> = {
      name: name.trim(),
      enabled,
      condition: {
        type: conditionType as AlertRule['condition']['type'],
        threshold: parsedThreshold,
        ...(conditionType === 'level_count' ? { level } : {}),
      },
      action: {
        type: actionType as AlertRule['action']['type'],
        ...(actionType === 'webhook' ? { url: webhookUrl.trim() } : {}),
      },
      notification_channels: selectedChannels,
    };

    setIsSaving(true);
    try {
      await onSave(alertData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alert');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-secondary rounded-lg border border-border w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{alert ? 'Edit Alert' : 'Create Alert'}</h2>
          <button onClick={onCancel} className="p-1 hover:bg-bg-tertiary rounded">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
              placeholder="Alert name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Condition Type</label>
            <select
              value={conditionType}
              onChange={(e) => setConditionType(e.target.value as AlertCondition['type'])}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
            >
              {CONDITION_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {conditionType === 'level_count' && (
            <div>
              <label className="block text-sm font-medium mb-1">Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Threshold {conditionType === 'error_rate' ? '(%)' : ''}
            </label>
            <input
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
              placeholder={conditionType === 'error_rate' ? '5.0' : '10'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Action Type</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as AlertAction['type'])}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
            >
              {ACTION_TYPES.map((at) => (
                <option key={at.value} value={at.value}>
                  {at.label}
                </option>
              ))}
            </select>
          </div>

          {actionType === 'webhook' && (
            <div>
              <label className="block text-sm font-medium mb-1">Webhook URL</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                placeholder="https://hooks.example.com/alert"
              />
            </div>
          )}

          {/* Notification Channels */}
          {channels.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Notification Channels
                <span className="text-text-secondary font-normal ml-1">(optional)</span>
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-bg-tertiary rounded border border-border">
                {channels.map((channel) => {
                  const id = getChannelId(channel);
                  return (
                    <label
                      key={id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-bg-secondary p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(id)}
                        onChange={() => toggleChannel(id)}
                        className="rounded"
                      />
                      <span>{getChannelIcon(channel.channel_type)}</span>
                      <span className="flex-1">{channel.name}</span>
                      <span className="text-xs text-text-secondary capitalize">
                        {channel.channel_type}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Select channels to receive notifications when this alert triggers
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="enabled" className="text-sm">
              Enabled
            </label>
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error/30 rounded text-error text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-bg-tertiary hover:bg-border rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-bg-primary rounded transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
