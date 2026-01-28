import { useState, useEffect } from 'react';

interface NotificationChannel {
  _id: { $oid: string } | string;
  name: string;
  channel_type: 'slack' | 'discord' | 'pagerduty' | 'email' | 'webhook';
  config: ChannelConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

type ChannelConfig =
  | { type: 'slack'; webhook_url: string; channel?: string; username?: string; icon_emoji?: string }
  | { type: 'discord'; webhook_url: string; username?: string; avatar_url?: string }
  | { type: 'pagerduty'; routing_key: string; severity?: string }
  | { type: 'email'; smtp_host: string; smtp_port: number; smtp_username?: string; smtp_password?: string; from_address: string; to_addresses: string[]; use_tls: boolean }
  | { type: 'webhook'; url: string; method?: string; headers?: Record<string, string> };

const CHANNEL_TYPES = [
  { value: 'slack', label: 'Slack', icon: '💬' },
  { value: 'discord', label: 'Discord', icon: '🎮' },
  { value: 'pagerduty', label: 'PagerDuty', icon: '📟' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'webhook', label: 'Webhook', icon: '🔗' },
];

export default function Channels() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('slack');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formConfig, setFormConfig] = useState<Record<string, any>>({});

  const fetchChannels = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/channels', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch channels');
      const data = await response.json();
      setChannels(data.channels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch channels');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const getChannelId = (channel: NotificationChannel): string => {
    return typeof channel._id === 'object' ? channel._id.$oid : channel._id;
  };

  const openCreateModal = () => {
    setEditingChannel(null);
    setFormName('');
    setFormType('slack');
    setFormEnabled(true);
    setFormConfig({ webhook_url: '' });
    setShowModal(true);
  };

  const openEditModal = (channel: NotificationChannel) => {
    setEditingChannel(channel);
    setFormName(channel.name);
    setFormType(channel.channel_type);
    setFormEnabled(channel.enabled);
    setFormConfig({ ...channel.config });
    setShowModal(true);
  };

  const handleTypeChange = (type: string) => {
    setFormType(type);
    // Reset config based on type
    switch (type) {
      case 'slack':
        setFormConfig({ type: 'slack', webhook_url: '', channel: '', username: '', icon_emoji: '' });
        break;
      case 'discord':
        setFormConfig({ type: 'discord', webhook_url: '', username: '', avatar_url: '' });
        break;
      case 'pagerduty':
        setFormConfig({ type: 'pagerduty', routing_key: '', severity: 'warning' });
        break;
      case 'email':
        setFormConfig({ type: 'email', smtp_host: '', smtp_port: 587, from_address: '', to_addresses: [], use_tls: true });
        break;
      case 'webhook':
        setFormConfig({ type: 'webhook', url: '', method: 'POST' });
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formName,
        channel_type: formType,
        config: { ...formConfig, type: formType },
        enabled: formEnabled,
      };

      if (editingChannel) {
        const id = getChannelId(editingChannel);
        const response = await fetch(`/api/channels/${id}/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update channel');
      } else {
        const response = await fetch('/api/channels', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create channel');
      }

      setShowModal(false);
      fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel');
    }
  };

  const handleDelete = async (channel: NotificationChannel) => {
    if (!confirm(`Delete channel "${channel.name}"?`)) return;

    try {
      const id = getChannelId(channel);
      const response = await fetch(`/api/channels/${id}/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to delete channel');
      fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    }
  };

  const handleTest = async (channel: NotificationChannel) => {
    const id = getChannelId(channel);
    setTestingId(id);
    setTestResult(null);

    try {
      const response = await fetch(`/api/channels/${id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ message: 'Test notification from Kartex Logging Server' }),
      });

      if (response.ok) {
        setTestResult({ id, success: true, message: 'Test notification sent successfully!' });
      } else {
        const data = await response.json();
        setTestResult({ id, success: false, message: data.error || 'Failed to send test' });
      }
    } catch (err) {
      setTestResult({ id, success: false, message: err instanceof Error ? err.message : 'Failed to send test' });
    } finally {
      setTestingId(null);
    }
  };

  const toggleEnabled = async (channel: NotificationChannel) => {
    try {
      const id = getChannelId(channel);
      const response = await fetch(`/api/channels/${id}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enabled: !channel.enabled }),
      });
      if (!response.ok) throw new Error('Failed to update channel');
      fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    }
  };

  const renderConfigFields = () => {
    switch (formType) {
      case 'slack':
        return (
          <>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Webhook URL *</label>
              <input
                type="url"
                value={formConfig.webhook_url || ''}
                onChange={(e) => setFormConfig({ ...formConfig, webhook_url: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Channel</label>
                <input
                  type="text"
                  value={formConfig.channel || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, channel: e.target.value })}
                  placeholder="#alerts"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Username</label>
                <input
                  type="text"
                  value={formConfig.username || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, username: e.target.value })}
                  placeholder="Kartex Alerts"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </>
        );

      case 'discord':
        return (
          <>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Webhook URL *</label>
              <input
                type="url"
                value={formConfig.webhook_url || ''}
                onChange={(e) => setFormConfig({ ...formConfig, webhook_url: e.target.value })}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Username</label>
                <input
                  type="text"
                  value={formConfig.username || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, username: e.target.value })}
                  placeholder="Kartex Alerts"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Avatar URL</label>
                <input
                  type="url"
                  value={formConfig.avatar_url || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, avatar_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </>
        );

      case 'pagerduty':
        return (
          <>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Routing Key *</label>
              <input
                type="text"
                value={formConfig.routing_key || ''}
                onChange={(e) => setFormConfig({ ...formConfig, routing_key: e.target.value })}
                placeholder="Your PagerDuty integration key"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Default Severity</label>
              <select
                value={formConfig.severity || 'warning'}
                onChange={(e) => setFormConfig({ ...formConfig, severity: e.target.value })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
              >
                <option value="critical">Critical</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
          </>
        );

      case 'email':
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1">SMTP Host *</label>
                <input
                  type="text"
                  value={formConfig.smtp_host || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">SMTP Port *</label>
                <input
                  type="number"
                  value={formConfig.smtp_port || 587}
                  onChange={(e) => setFormConfig({ ...formConfig, smtp_port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Username</label>
                <input
                  type="text"
                  value={formConfig.smtp_username || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, smtp_username: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Password</label>
                <input
                  type="password"
                  value={formConfig.smtp_password || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, smtp_password: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">From Address *</label>
              <input
                type="email"
                value={formConfig.from_address || ''}
                onChange={(e) => setFormConfig({ ...formConfig, from_address: e.target.value })}
                placeholder="alerts@example.com"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">To Addresses * (comma separated)</label>
              <input
                type="text"
                value={(formConfig.to_addresses || []).join(', ')}
                onChange={(e) => setFormConfig({ ...formConfig, to_addresses: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                placeholder="admin@example.com, ops@example.com"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use_tls"
                checked={formConfig.use_tls !== false}
                onChange={(e) => setFormConfig({ ...formConfig, use_tls: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="use_tls" className="text-sm">Use TLS</label>
            </div>
          </>
        );

      case 'webhook':
        return (
          <>
            <div>
              <label className="block text-sm text-text-secondary mb-1">URL *</label>
              <input
                type="url"
                value={formConfig.url || ''}
                onChange={(e) => setFormConfig({ ...formConfig, url: e.target.value })}
                placeholder="https://example.com/webhook"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Method</label>
              <select
                value={formConfig.method || 'POST'}
                onChange={(e) => setFormConfig({ ...formConfig, method: e.target.value })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="GET">GET</option>
              </select>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const getChannelIcon = (type: string) => {
    return CHANNEL_TYPES.find(t => t.value === type)?.icon || '📢';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Loading channels...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Notification Channels</h1>
          <p className="text-text-secondary text-sm mt-1">
            Configure where alert notifications are sent
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Channel
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error/20 border border-error rounded text-error">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Channels List */}
      {channels.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">📢</div>
            <h2 className="text-lg font-medium mb-2">No notification channels</h2>
            <p className="text-text-secondary mb-4">
              Add a channel to start receiving alert notifications
            </p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
            >
              Add Your First Channel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => {
            const id = getChannelId(channel);
            return (
              <div
                key={id}
                className={`p-4 bg-bg-secondary rounded-lg border transition-colors ${
                  channel.enabled ? 'border-border' : 'border-border opacity-60'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getChannelIcon(channel.channel_type)}</span>
                    <div>
                      <h3 className="font-medium">{channel.name}</h3>
                      <span className="text-xs text-text-secondary capitalize">
                        {channel.channel_type}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleEnabled(channel)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      channel.enabled
                        ? 'bg-success/20 text-success'
                        : 'bg-bg-tertiary text-text-secondary'
                    }`}
                  >
                    {channel.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                <div className="text-xs text-text-secondary mb-3 truncate">
                  {channel.channel_type === 'slack' && (channel.config as any).webhook_url}
                  {channel.channel_type === 'discord' && (channel.config as any).webhook_url}
                  {channel.channel_type === 'pagerduty' && `Key: ${(channel.config as any).routing_key?.substring(0, 10)}...`}
                  {channel.channel_type === 'email' && (channel.config as any).to_addresses?.join(', ')}
                  {channel.channel_type === 'webhook' && (channel.config as any).url}
                </div>

                {testResult?.id === id && (
                  <div className={`mb-3 p-2 rounded text-xs ${
                    testResult.success ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
                  }`}>
                    {testResult.message}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleTest(channel)}
                    disabled={testingId === id || !channel.enabled}
                    className="flex-1 px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded text-sm transition-colors disabled:opacity-50"
                  >
                    {testingId === id ? 'Sending...' : 'Test'}
                  </button>
                  <button
                    onClick={() => openEditModal(channel)}
                    className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded text-sm transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(channel)}
                    className="px-3 py-1.5 bg-bg-tertiary hover:bg-error/20 hover:text-error rounded text-sm transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-secondary rounded-lg border border-border w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-bg-secondary">
              <h2 className="text-lg font-bold">
                {editingChannel ? 'Edit Channel' : 'Add Channel'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-bg-tertiary rounded"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="My Slack Channel"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">Type *</label>
                <div className="grid grid-cols-5 gap-2">
                  {CHANNEL_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleTypeChange(type.value)}
                      className={`p-3 rounded border text-center transition-colors ${
                        formType === type.value
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <div className="text-xl mb-1">{type.icon}</div>
                      <div className="text-xs">{type.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {renderConfigFields()}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="enabled" className="text-sm">Enabled</label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-bg-tertiary hover:bg-border rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
                >
                  {editingChannel ? 'Save Changes' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
