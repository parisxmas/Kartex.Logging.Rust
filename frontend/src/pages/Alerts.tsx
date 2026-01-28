import { useState, useEffect } from 'react';
import { apiClient, AlertRule } from '../api/client';
import AlertForm from '../components/AlertForm';

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null);

  const fetchAlerts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getAlerts();
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this alert?')) return;

    try {
      await apiClient.deleteAlert(id);
      fetchAlerts();
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  const handleSave = async (alert: Omit<AlertRule, '_id' | 'last_triggered' | 'trigger_count'>) => {
    try {
      if (editingAlert) {
        const id = typeof editingAlert._id === 'object' ? editingAlert._id.$oid : editingAlert._id;
        await apiClient.updateAlert(id!, alert);
      } else {
        await apiClient.createAlert(alert);
      }
      setShowForm(false);
      setEditingAlert(null);
      fetchAlerts();
    } catch (err) {
      throw err;
    }
  };

  const formatCondition = (alert: AlertRule) => {
    switch (alert.condition.type) {
      case 'error_rate':
        return `Error rate > ${(alert.condition.threshold * 100).toFixed(1)}%`;
      case 'errors_per_second':
        return `Errors/sec > ${alert.condition.threshold}`;
      case 'logs_per_second':
        return `Logs/sec > ${alert.condition.threshold}`;
      case 'level_count':
        return `${alert.condition.level} count > ${alert.condition.threshold}`;
      default:
        return 'Unknown condition';
    }
  };

  const formatAction = (alert: AlertRule) => {
    return alert.action.type === 'webhook' ? `Webhook: ${alert.action.url}` : 'Log to console';
  };

  const getId = (alert: AlertRule) => {
    return typeof alert._id === 'object' ? alert._id.$oid : alert._id;
  };

  if (isLoading && alerts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-secondary">Loading alerts...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <button
          onClick={() => {
            setEditingAlert(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-bg-primary rounded transition-colors"
        >
          Create Alert
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 mb-4 bg-error/10 border border-error/30 rounded text-error">
          {error}
        </div>
      )}

      {/* Alerts List */}
      <div className="flex-1 overflow-auto">
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-text-secondary bg-bg-secondary rounded-lg border border-border">
            No alerts configured. Create your first alert rule.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={getId(alert)}
                className={`p-4 bg-bg-secondary rounded-lg border border-border ${
                  !alert.enabled ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{alert.name}</h3>
                      {!alert.enabled && (
                        <span className="px-2 py-0.5 text-xs bg-bg-tertiary rounded">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-text-secondary mt-1">
                      {formatCondition(alert)} → {formatAction(alert)}
                    </div>
                    <div className="text-xs text-text-secondary mt-2">
                      Triggered: {alert.trigger_count || 0} times | Last:{' '}
                      {alert.last_triggered
                        ? new Date(alert.last_triggered).toLocaleString()
                        : 'Never'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingAlert(alert);
                        setShowForm(true);
                      }}
                      className="px-3 py-1 text-sm bg-bg-tertiary hover:bg-border rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(getId(alert)!)}
                      className="px-3 py-1 text-sm bg-error/20 hover:bg-error/30 text-error rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alert Form Modal */}
      {showForm && (
        <AlertForm
          alert={editingAlert}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingAlert(null);
          }}
        />
      )}
    </div>
  );
}
