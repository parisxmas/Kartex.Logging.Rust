import { useState, useEffect } from 'react';
import { apiClient, Stats } from '../api/client';

export default function Statistics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch statistics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const levelColors: Record<string, string> = {
    TRACE: 'bg-level-trace',
    DEBUG: 'bg-level-debug',
    INFO: 'bg-level-info',
    WARN: 'bg-level-warn',
    ERROR: 'bg-level-error',
    FATAL: 'bg-level-fatal',
  };

  if (isLoading && !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-secondary">Loading statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-error">{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const maxLevelCount = Math.max(...Object.values(stats.counts_by_level), 1);
  const maxServiceCount = Math.max(...Object.values(stats.counts_by_service), 1);

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Statistics</h1>
        <button
          onClick={fetchStats}
          className="px-3 py-1.5 bg-bg-tertiary hover:bg-border rounded transition-colors text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="p-4 sm:p-6 bg-bg-secondary rounded-lg border border-border">
          <div className="text-text-secondary text-sm mb-2">Total Logs</div>
          <div className="text-2xl sm:text-3xl font-bold text-accent">
            {formatNumber(stats.total_count)}
          </div>
        </div>
        <div className="p-4 sm:p-6 bg-bg-secondary rounded-lg border border-border">
          <div className="text-text-secondary text-sm mb-2">Error Count</div>
          <div className="text-2xl sm:text-3xl font-bold text-error">
            {formatNumber(
              (stats.counts_by_level['ERROR'] || 0) + (stats.counts_by_level['FATAL'] || 0)
            )}
          </div>
        </div>
        <div className="p-4 sm:p-6 bg-bg-secondary rounded-lg border border-border sm:col-span-2 lg:col-span-1">
          <div className="text-text-secondary text-sm mb-2">Services</div>
          <div className="text-2xl sm:text-3xl font-bold">
            {Object.keys(stats.counts_by_service).length}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Logs by Level */}
        <div className="p-4 sm:p-6 bg-bg-secondary rounded-lg border border-border">
          <h2 className="text-base sm:text-lg font-semibold mb-4">Logs by Level</h2>
          <div className="space-y-3">
            {Object.entries(stats.counts_by_level)
              .sort((a, b) => b[1] - a[1])
              .map(([level, count]) => (
                <div key={level} className="flex items-center gap-2 sm:gap-3">
                  <span className="w-12 sm:w-16 text-xs sm:text-sm font-medium">{level}</span>
                  <div className="flex-1 h-5 sm:h-6 bg-bg-tertiary rounded overflow-hidden">
                    <div
                      className={`h-full ${levelColors[level] || 'bg-accent'} opacity-80`}
                      style={{ width: `${(count / maxLevelCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 sm:w-16 text-right text-xs sm:text-sm font-mono">
                    {formatNumber(count)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Logs by Service */}
        <div className="p-4 sm:p-6 bg-bg-secondary rounded-lg border border-border">
          <h2 className="text-base sm:text-lg font-semibold mb-4">Top Services</h2>
          <div className="space-y-3">
            {Object.entries(stats.counts_by_service)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([service, count]) => (
                <div key={service} className="flex items-center gap-2 sm:gap-3">
                  <span className="w-16 sm:w-24 text-xs sm:text-sm font-medium truncate" title={service}>
                    {service}
                  </span>
                  <div className="flex-1 h-5 sm:h-6 bg-bg-tertiary rounded overflow-hidden">
                    <div
                      className="h-full bg-accent opacity-80"
                      style={{ width: `${(count / maxServiceCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 sm:w-16 text-right text-xs sm:text-sm font-mono">
                    {formatNumber(count)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
