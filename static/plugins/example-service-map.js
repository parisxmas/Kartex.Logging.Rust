/**
 * Kartex Logging Dashboard Plugin: Service Map
 *
 * Displays a visual map of services and their log activity.
 */

(function() {
  let api = null;
  let services = {};

  exports.init = async function(hostApi) {
    api = hostApi;
    api.log('Service Map plugin initialized');
    await refresh();
  };

  exports.onLog = function(log) {
    const service = log.service || 'unknown';
    if (!services[service]) {
      services[service] = { total: 0, errors: 0, lastSeen: null };
    }
    services[service].total++;
    if (log.level === 'ERROR' || log.level === 'FATAL') {
      services[service].errors++;
    }
    services[service].lastSeen = new Date();
    render();
  };

  exports.onTick = async function() {
    await refresh();
  };

  exports.destroy = function() {
    api.log('Service Map plugin destroyed');
  };

  async function refresh() {
    try {
      // Get logs to build service map
      const logs = await api.getLogs({ limit: 200 });

      services = {};
      logs.forEach(log => {
        const service = log.service || 'unknown';
        if (!services[service]) {
          services[service] = { total: 0, errors: 0, lastSeen: null };
        }
        services[service].total++;
        if (log.level === 'ERROR' || log.level === 'FATAL') {
          services[service].errors++;
        }
        const ts = new Date(log.timestamp);
        if (!services[service].lastSeen || ts > services[service].lastSeen) {
          services[service].lastSeen = ts;
        }
      });

      render();
    } catch (err) {
      api.log('Error refreshing: ' + err.message);
    }
  }

  function render() {
    const theme = api.getTheme();
    const isDark = theme === 'dark';

    const textColor = isDark ? '#e0e0e0' : '#333';
    const mutedColor = isDark ? '#888' : '#666';
    const borderColor = isDark ? '#333' : '#e0e0e0';
    const greenColor = '#22c55e';
    const yellowColor = '#eab308';
    const redColor = '#ef4444';

    const serviceList = Object.entries(services)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8);

    const html = `
      <div style="font-family: system-ui, sans-serif; color: ${textColor}; height: 100%; overflow: auto;">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">
          ${serviceList.map(([name, data]) => {
            const errorRate = data.total > 0 ? data.errors / data.total : 0;
            let statusColor = greenColor;
            if (errorRate > 0.1) statusColor = redColor;
            else if (errorRate > 0.05) statusColor = yellowColor;

            const timeSince = data.lastSeen
              ? formatTimeSince(data.lastSeen)
              : 'never';

            return `
              <div style="padding: 10px; border: 1px solid ${borderColor}; border-radius: 6px; background: ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'};">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></span>
                  <span style="font-weight: 500; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(name)}">
                    ${escapeHtml(name)}
                  </span>
                </div>
                <div style="font-size: 10px; color: ${mutedColor};">
                  <div>${data.total} logs</div>
                  <div style="color: ${data.errors > 0 ? redColor : mutedColor};">${data.errors} errors</div>
                  <div>${timeSince}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${serviceList.length === 0 ? `
          <div style="text-align: center; color: ${mutedColor}; font-size: 12px; padding: 20px;">
            No services found
          </div>
        ` : ''}
      </div>
    `;

    api.render(html);
  }

  function formatTimeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return seconds + 's ago';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
