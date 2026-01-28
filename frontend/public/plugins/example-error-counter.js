/**
 * Kartex Logging Dashboard Plugin Example
 *
 * This plugin displays a real-time error counter with a visual indicator.
 *
 * Plugin Contract:
 * - exports.init(api): Called when plugin loads. Receives the host API.
 * - exports.onLog(log): Called when a new log arrives (if realtime enabled).
 * - exports.onTick(): Called every 10 seconds for periodic updates.
 * - exports.destroy(): Called when plugin is unloaded.
 *
 * Host API:
 * - api.getLogs({ level?, service?, limit? }): Fetch logs from server
 * - api.getMetrics(): Get real-time metrics
 * - api.getConfig(): Get plugin configuration from widget settings
 * - api.getTheme(): Get current theme ('light' or 'dark')
 * - api.render(html): Render HTML content in the widget
 * - api.log(message): Log message to console
 */

(function() {
  let api = null;
  let errorCount = 0;
  let recentErrors = [];
  const MAX_RECENT = 5;

  // Initialize plugin
  exports.init = async function(hostApi) {
    api = hostApi;
    api.log('Error Counter plugin initialized');

    // Get initial data
    await refresh();
  };

  // Handle real-time log events
  exports.onLog = function(log) {
    if (log.level === 'ERROR' || log.level === 'FATAL') {
      errorCount++;
      recentErrors.unshift({
        time: new Date(log.timestamp).toLocaleTimeString(),
        message: log.message.substring(0, 50) + (log.message.length > 50 ? '...' : ''),
        service: log.service
      });

      // Keep only recent errors
      if (recentErrors.length > MAX_RECENT) {
        recentErrors.pop();
      }

      render();
    }
  };

  // Periodic update
  exports.onTick = async function() {
    await refresh();
  };

  // Cleanup
  exports.destroy = function() {
    api.log('Error Counter plugin destroyed');
  };

  // Fetch fresh data and render
  async function refresh() {
    try {
      const metrics = await api.getMetrics();
      errorCount = Math.round(metrics.errors_per_second * 60); // Approximate errors per minute

      // Get recent error logs
      const response = await api.getLogs({ level: 'ERROR', limit: MAX_RECENT });
      recentErrors = response.map(log => ({
        time: new Date(log.timestamp).toLocaleTimeString(),
        message: log.message.substring(0, 50) + (log.message.length > 50 ? '...' : ''),
        service: log.service
      }));

      render();
    } catch (err) {
      api.log('Error refreshing: ' + err.message);
    }
  }

  // Render the widget UI
  function render() {
    const theme = api.getTheme();
    const isDark = theme === 'dark';

    const bgColor = isDark ? '#1a1a2e' : '#fff';
    const textColor = isDark ? '#e0e0e0' : '#333';
    const mutedColor = isDark ? '#888' : '#666';
    const errorColor = '#ef4444';
    const borderColor = isDark ? '#333' : '#e0e0e0';

    const html = `
      <div style="font-family: system-ui, sans-serif; color: ${textColor}; height: 100%;">
        <div style="text-align: center; margin-bottom: 12px;">
          <div style="font-size: 32px; font-weight: bold; color: ${errorColor};">
            ${errorCount}
          </div>
          <div style="font-size: 12px; color: ${mutedColor};">
            Errors / min
          </div>
        </div>

        ${recentErrors.length > 0 ? `
          <div style="font-size: 11px; border-top: 1px solid ${borderColor}; padding-top: 8px;">
            <div style="color: ${mutedColor}; margin-bottom: 4px;">Recent Errors:</div>
            ${recentErrors.map(e => `
              <div style="padding: 4px 0; border-bottom: 1px solid ${borderColor};">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: ${mutedColor};">${e.time}</span>
                  <span style="color: ${errorColor}; font-size: 10px;">${e.service}</span>
                </div>
                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(e.message)}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align: center; color: ${mutedColor}; font-size: 12px; padding-top: 12px;">
            No recent errors
          </div>
        `}
      </div>
    `;

    api.render(html);
  }

  // Helper to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
