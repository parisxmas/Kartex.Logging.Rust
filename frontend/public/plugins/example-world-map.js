/**
 * Kartex Logging Dashboard Plugin: World Map
 *
 * Displays a world map with log activity indicators based on source IPs.
 * Shows real-time log events as animated dots on the map.
 */

(function() {
  let api = null;
  let logEvents = [];
  const MAX_EVENTS = 50;

  // Simple hash function to generate consistent positions from IPs/services
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  // Convert IP/service to map coordinates (simulated geolocation)
  function getCoordinates(ip, service) {
    const hash1 = hashCode(ip || 'unknown');
    const hash2 = hashCode(service || 'default');

    // Generate pseudo-random but consistent coordinates
    // Map to reasonable lat/long ranges that look good on the map
    const regions = [
      { x: 150, y: 80, name: 'NA East' },    // US East
      { x: 100, y: 90, name: 'NA West' },    // US West
      { x: 310, y: 75, name: 'Europe' },     // Europe
      { x: 420, y: 120, name: 'Asia' },      // Asia
      { x: 470, y: 85, name: 'Japan' },      // Japan
      { x: 280, y: 160, name: 'Africa' },    // Africa
      { x: 480, y: 180, name: 'Australia' }, // Australia
      { x: 200, y: 150, name: 'SA' },        // South America
    ];

    // Pick region based on hash
    const regionIndex = Math.abs(hash1 + hash2) % regions.length;
    const region = regions[regionIndex];

    // Add some variation within the region
    const offsetX = (Math.abs(hash1) % 40) - 20;
    const offsetY = (Math.abs(hash2) % 30) - 15;

    return {
      x: region.x + offsetX,
      y: region.y + offsetY,
      region: region.name
    };
  }

  // Get color based on log level
  function getLevelColor(level) {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return '#ef4444';
      case 'WARN':
        return '#eab308';
      case 'INFO':
        return '#3b82f6';
      case 'DEBUG':
        return '#8b5cf6';
      default:
        return '#22c55e';
    }
  }

  exports.init = async function(hostApi) {
    api = hostApi;
    api.log('World Map plugin initialized');
    await refresh();
  };

  exports.onLog = function(log) {
    const coords = getCoordinates(log.source_ip, log.service);
    logEvents.unshift({
      id: Date.now() + Math.random(),
      x: coords.x,
      y: coords.y,
      level: log.level,
      service: log.service,
      ip: log.source_ip,
      region: coords.region,
      timestamp: new Date(),
      isNew: true
    });

    // Keep only recent events
    if (logEvents.length > MAX_EVENTS) {
      logEvents.pop();
    }

    render();

    // Mark as not new after animation
    setTimeout(() => {
      const event = logEvents.find(e => e.isNew);
      if (event) event.isNew = false;
    }, 1000);
  };

  exports.onTick = async function() {
    await refresh();
  };

  exports.destroy = function() {
    api.log('World Map plugin destroyed');
  };

  async function refresh() {
    try {
      const logs = await api.getLogs({ limit: 30 });

      logEvents = logs.map((log, i) => {
        const coords = getCoordinates(log.source_ip, log.service);
        return {
          id: i,
          x: coords.x,
          y: coords.y,
          level: log.level,
          service: log.service,
          ip: log.source_ip,
          region: coords.region,
          timestamp: new Date(log.timestamp),
          isNew: false
        };
      });

      render();
    } catch (err) {
      api.log('Error refreshing: ' + err.message);
    }
  }

  function render() {
    const theme = api.getTheme();
    const isDark = theme === 'dark';

    const bgColor = isDark ? '#0f172a' : '#f8fafc';
    const mapColor = isDark ? '#1e3a5f' : '#cbd5e1';
    const mapStroke = isDark ? '#334155' : '#94a3b8';
    const textColor = isDark ? '#e2e8f0' : '#334155';
    const mutedColor = isDark ? '#64748b' : '#64748b';

    // Count by region
    const regionCounts = {};
    logEvents.forEach(e => {
      regionCounts[e.region] = (regionCounts[e.region] || 0) + 1;
    });

    // Count by level
    const levelCounts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 };
    logEvents.forEach(e => {
      if (levelCounts[e.level] !== undefined) {
        levelCounts[e.level]++;
      }
    });

    const html = `
      <style>
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(2); opacity: 0.5; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        .map-dot { transition: all 0.3s ease; }
        .map-dot:hover { transform: scale(1.5); }
        .pulse-ring { animation: pulse 1.5s ease-out forwards; }
        .new-dot { animation: fadeIn 0.3s ease-out; }
      </style>

      <div style="font-family: system-ui, sans-serif; color: ${textColor}; height: 100%; display: flex; flex-direction: column;">
        <!-- Map Container -->
        <div style="flex: 1; position: relative; min-height: 0; overflow: hidden;">
          <svg viewBox="0 0 600 300" style="width: 100%; height: 100%;" preserveAspectRatio="xMidYMid meet">
            <!-- Background -->
            <rect width="600" height="300" fill="${bgColor}"/>

            <!-- Simplified World Map Path -->
            <g fill="${mapColor}" stroke="${mapStroke}" stroke-width="0.5">
              <!-- North America -->
              <path d="M40,50 L60,40 L100,35 L140,40 L160,55 L170,80 L165,100 L150,115 L130,120 L100,130 L80,125 L60,100 L45,80 Z"/>
              <!-- Central America -->
              <path d="M100,130 L115,135 L120,150 L115,165 L100,170 L90,155 L95,140 Z"/>
              <!-- South America -->
              <path d="M115,165 L140,170 L160,190 L170,220 L160,260 L140,275 L120,270 L100,250 L95,220 L100,190 L110,175 Z"/>
              <!-- Europe -->
              <path d="M270,45 L290,40 L320,42 L350,50 L360,65 L355,85 L340,95 L310,100 L280,95 L265,80 L268,60 Z"/>
              <!-- Africa -->
              <path d="M280,100 L310,105 L340,110 L355,130 L360,160 L350,200 L320,220 L280,215 L260,190 L255,150 L265,120 Z"/>
              <!-- Asia -->
              <path d="M360,50 L400,40 L450,45 L500,55 L530,70 L540,100 L530,130 L500,140 L450,135 L400,120 L370,100 L365,70 Z"/>
              <!-- Southeast Asia -->
              <path d="M450,140 L480,145 L510,160 L500,180 L470,175 L450,160 Z"/>
              <!-- Australia -->
              <path d="M480,200 L520,195 L550,210 L555,240 L540,260 L500,265 L475,250 L470,225 Z"/>
              <!-- Japan -->
              <path d="M520,70 L530,65 L540,70 L538,85 L528,90 L520,85 Z"/>
            </g>

            <!-- Grid lines -->
            <g stroke="${mapStroke}" stroke-width="0.2" stroke-dasharray="4,4" opacity="0.3">
              <line x1="0" y1="150" x2="600" y2="150"/>
              <line x1="300" y1="0" x2="300" y2="300"/>
            </g>

            <!-- Log event dots -->
            ${logEvents.map(event => `
              <g class="map-dot ${event.isNew ? 'new-dot' : ''}" transform="translate(${event.x}, ${event.y})">
                ${event.isNew ? `<circle class="pulse-ring" r="6" fill="none" stroke="${getLevelColor(event.level)}" stroke-width="2"/>` : ''}
                <circle r="5" fill="${getLevelColor(event.level)}" opacity="0.8">
                  <title>${event.service} (${event.ip})&#10;${event.level} - ${event.region}</title>
                </circle>
                <circle r="2" fill="white" opacity="0.6"/>
              </g>
            `).join('')}
          </svg>
        </div>

        <!-- Legend -->
        <div style="display: flex; gap: 12px; padding: 8px; font-size: 10px; border-top: 1px solid ${mapStroke}; flex-wrap: wrap; justify-content: center;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
            <span>ERROR (${levelCounts.ERROR})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #eab308;"></span>
            <span>WARN (${levelCounts.WARN})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;"></span>
            <span>INFO (${levelCounts.INFO})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #8b5cf6;"></span>
            <span>DEBUG (${levelCounts.DEBUG})</span>
          </div>
        </div>
      </div>
    `;

    api.render(html);
  }
})();
