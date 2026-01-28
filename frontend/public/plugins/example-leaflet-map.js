/**
 * Kartex Logging Dashboard Plugin: Leaflet World Map
 *
 * Displays a real world map using Leaflet.js + OpenStreetMap
 * Shows log activity as markers based on source IPs.
 */

(function() {
  let api = null;
  let map = null;
  let markersLayer = null;
  let logEvents = [];
  let isInitialized = false;
  const MAX_EVENTS = 100;

  // Simple hash function for consistent positioning
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  // Simulate geolocation from IP/service (in production, use a real GeoIP service)
  function getCoordinates(ip, service) {
    const hash1 = hashCode(ip || 'unknown');
    const hash2 = hashCode(service || 'default');

    // Major city coordinates for realistic distribution
    const cities = [
      // North America
      { lat: 40.7128, lng: -74.0060, name: 'New York' },
      { lat: 37.7749, lng: -122.4194, name: 'San Francisco' },
      { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' },
      { lat: 41.8781, lng: -87.6298, name: 'Chicago' },
      { lat: 43.6532, lng: -79.3832, name: 'Toronto' },
      { lat: 19.4326, lng: -99.1332, name: 'Mexico City' },
      { lat: 45.5017, lng: -73.5673, name: 'Montreal' },
      { lat: 47.6062, lng: -122.3321, name: 'Seattle' },

      // Europe
      { lat: 51.5074, lng: -0.1278, name: 'London' },
      { lat: 48.8566, lng: 2.3522, name: 'Paris' },
      { lat: 52.5200, lng: 13.4050, name: 'Berlin' },
      { lat: 55.7558, lng: 37.6173, name: 'Moscow' },
      { lat: 52.3676, lng: 4.9041, name: 'Amsterdam' },
      { lat: 59.3293, lng: 18.0686, name: 'Stockholm' },
      { lat: 40.4168, lng: -3.7038, name: 'Madrid' },
      { lat: 41.9028, lng: 12.4964, name: 'Rome' },
      { lat: 47.3769, lng: 8.5417, name: 'Zurich' },
      { lat: 48.2082, lng: 16.3738, name: 'Vienna' },

      // Asia Pacific
      { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
      { lat: 31.2304, lng: 121.4737, name: 'Shanghai' },
      { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
      { lat: 28.6139, lng: 77.2090, name: 'New Delhi' },
      { lat: 25.2048, lng: 55.2708, name: 'Dubai' },
      { lat: 22.3193, lng: 114.1694, name: 'Hong Kong' },
      { lat: 37.5665, lng: 126.9780, name: 'Seoul' },
      { lat: 13.7563, lng: 100.5018, name: 'Bangkok' },
      { lat: 19.0760, lng: 72.8777, name: 'Mumbai' },
      { lat: -6.2088, lng: 106.8456, name: 'Jakarta' },

      // Oceania
      { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
      { lat: -37.8136, lng: 144.9631, name: 'Melbourne' },
      { lat: -36.8509, lng: 174.7645, name: 'Auckland' },

      // South America
      { lat: -23.5505, lng: -46.6333, name: 'São Paulo' },
      { lat: -34.6037, lng: -58.3816, name: 'Buenos Aires' },
      { lat: -12.0464, lng: -77.0428, name: 'Lima' },
      { lat: 4.7110, lng: -74.0721, name: 'Bogota' },
      { lat: -33.4489, lng: -70.6693, name: 'Santiago' },

      // Africa
      { lat: -26.2041, lng: 28.0473, name: 'Johannesburg' },
      { lat: 6.5244, lng: 3.3792, name: 'Lagos' },
      { lat: 30.0444, lng: 31.2357, name: 'Cairo' },
      { lat: -1.2921, lng: 36.8219, name: 'Nairobi' },
      { lat: -33.9249, lng: 18.4241, name: 'Cape Town' },
    ];

    const cityIndex = Math.abs(hash1 + hash2) % cities.length;
    const city = cities[cityIndex];

    // Add small random offset for variety
    const latOffset = ((Math.abs(hash1) % 100) - 50) / 100;
    const lngOffset = ((Math.abs(hash2) % 100) - 50) / 100;

    return {
      lat: city.lat + latOffset,
      lng: city.lng + lngOffset,
      city: city.name
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

  // Load external scripts dynamically
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function loadCSS(url) {
    return new Promise((resolve) => {
      if (document.querySelector(`link[href="${url}"]`)) {
        resolve();
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  exports.init = async function(hostApi) {
    api = hostApi;
    api.log('Leaflet Map plugin initializing...');

    // Render initial container
    renderContainer();

    // Load Leaflet CSS and JS
    try {
      await loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      api.log('Leaflet loaded successfully');

      // Wait for DOM to be ready
      setTimeout(() => {
        initMap();
        refresh();
      }, 100);
    } catch (err) {
      api.log('Failed to load Leaflet: ' + err.message);
    }
  };

  exports.onLog = function(log) {
    if (!map || !markersLayer) return;

    // Use ClientIp from metadata if available, otherwise fall back to source_ip
    const ip = (log.metadata && log.metadata.ClientIp) || log.source_ip;
    const coords = getCoordinates(ip, log.service);
    const event = {
      id: Date.now() + Math.random(),
      lat: coords.lat,
      lng: coords.lng,
      level: log.level,
      service: log.service,
      ip: ip,
      city: coords.city,
      message: log.message,
      timestamp: new Date()
    };

    logEvents.unshift(event);
    if (logEvents.length > MAX_EVENTS) {
      logEvents.pop();
    }

    addMarker(event, true);
    updateStats();
  };

  exports.onTick = async function() {
    await refresh();
  };

  exports.destroy = function() {
    if (map) {
      map.remove();
      map = null;
    }
    api.log('Leaflet Map plugin destroyed');
  };

  function renderContainer() {
    const theme = api.getTheme();
    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1e293b' : '#f1f5f9';
    const textColor = isDark ? '#e2e8f0' : '#334155';
    const borderColor = isDark ? '#334155' : '#cbd5e1';

    const html = `
      <style>
        .leaflet-map-container { height: 100%; display: flex; flex-direction: column; font-family: system-ui, sans-serif; }
        .leaflet-map-wrapper { flex: 1; min-height: 0; position: relative; }
        #plugin-map { height: 100%; width: 100%; border-radius: 4px; }
        .map-stats { display: flex; gap: 12px; padding: 6px 8px; font-size: 10px; border-top: 1px solid ${borderColor}; flex-wrap: wrap; justify-content: center; background: ${bgColor}; color: ${textColor}; }
        .stat-item { display: flex; align-items: center; gap: 4px; }
        .stat-dot { width: 8px; height: 8px; border-radius: 50%; }
        .leaflet-popup-content { font-size: 12px; }
        .pulse-icon { background: transparent !important; border: none !important; }
        @keyframes mapPulse {
          0% { width: 20px; height: 20px; opacity: 1; }
          100% { width: 80px; height: 80px; opacity: 0; }
        }
        @keyframes mapGlow {
          0% { transform: translate(-50%, -50%) scale(1); box-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
          50% { transform: translate(-50%, -50%) scale(1.3); box-shadow: 0 0 30px currentColor, 0 0 60px currentColor; }
          100% { transform: translate(-50%, -50%) scale(1); box-shadow: 0 0 10px currentColor; }
        }
      </style>
      <div class="leaflet-map-container">
        <div class="leaflet-map-wrapper">
          <div id="plugin-map"></div>
        </div>
        <div class="map-stats" id="map-stats">
          <div class="stat-item"><span class="stat-dot" style="background: #ef4444;"></span><span id="stat-error">ERROR: 0</span></div>
          <div class="stat-item"><span class="stat-dot" style="background: #eab308;"></span><span id="stat-warn">WARN: 0</span></div>
          <div class="stat-item"><span class="stat-dot" style="background: #3b82f6;"></span><span id="stat-info">INFO: 0</span></div>
          <div class="stat-item"><span class="stat-dot" style="background: #8b5cf6;"></span><span id="stat-debug">DEBUG: 0</span></div>
        </div>
      </div>
    `;

    api.render(html);
  }

  function initMap() {
    const mapContainer = document.getElementById('plugin-map');
    if (!mapContainer || !window.L) {
      api.log('Map container or Leaflet not ready');
      return;
    }

    if (map) {
      map.remove();
    }

    const theme = api.getTheme();
    const isDark = theme === 'dark';

    // Initialize Leaflet map
    map = L.map('plugin-map', {
      center: [20, 0],
      zoom: 2,
      minZoom: 1,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true
    });

    // Use different tile layers for dark/light theme
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const attribution = isDark
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    L.tileLayer(tileUrl, {
      attribution: attribution,
      maxZoom: 19
    }).addTo(map);

    // Create markers layer
    markersLayer = L.layerGroup().addTo(map);

    isInitialized = true;
    api.log('Map initialized');
  }

  function addMarker(event, isNew = false) {
    if (!map || !markersLayer || !window.L) return;

    const color = getLevelColor(event.level);

    // For new markers, add a pulse animation ring first
    if (isNew) {
      // Create expanding ring effect - larger and more visible
      const pulseIcon = L.divIcon({
        className: 'pulse-icon',
        html: `<div style="
          position: relative;
          width: 80px;
          height: 80px;
        ">
          <!-- Outer expanding ring 1 -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            border: 3px solid ${color};
            border-radius: 50%;
            animation: mapPulse 1.5s ease-out forwards;
            opacity: 0.8;
          "></div>
          <!-- Outer expanding ring 2 (delayed) -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            border: 2px solid ${color};
            border-radius: 50%;
            animation: mapPulse 1.5s ease-out 0.3s forwards;
            opacity: 0.6;
          "></div>
          <!-- Center dot -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 16px;
            height: 16px;
            background: ${color};
            border-radius: 50%;
            box-shadow: 0 0 20px ${color}, 0 0 40px ${color}, 0 0 60px ${color};
            animation: mapGlow 1.5s ease-out forwards;
          "></div>
        </div>`,
        iconSize: [80, 80],
        iconAnchor: [40, 40]
      });

      const pulseMarker = L.marker([event.lat, event.lng], { icon: pulseIcon });
      markersLayer.addLayer(pulseMarker);

      // Remove pulse marker after animation and add permanent marker
      setTimeout(() => {
        markersLayer.removeLayer(pulseMarker);
        addPermanentMarker(event, color);
      }, 1500);
    } else {
      addPermanentMarker(event, color);
    }
  }

  function addPermanentMarker(event, color) {
    // Create custom circle marker
    const marker = L.circleMarker([event.lat, event.lng], {
      radius: 6,
      fillColor: color,
      color: '#fff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    });

    // Add popup with log info
    const popupContent = `
      <div style="min-width: 150px;">
        <strong>${event.service}</strong><br/>
        <span style="color: ${color}; font-weight: bold;">${event.level}</span><br/>
        <small>${event.city} (${event.ip})</small><br/>
        <small style="color: #666;">${event.message ? event.message.substring(0, 100) + '...' : ''}</small>
      </div>
    `;
    marker.bindPopup(popupContent);

    markersLayer.addLayer(marker);

    // Limit total markers
    const layers = markersLayer.getLayers();
    if (layers.length > MAX_EVENTS) {
      markersLayer.removeLayer(layers[0]);
    }
  }

  function updateStats() {
    const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    logEvents.forEach(e => {
      if (counts[e.level] !== undefined) {
        counts[e.level]++;
      }
    });

    const errorEl = document.getElementById('stat-error');
    const warnEl = document.getElementById('stat-warn');
    const infoEl = document.getElementById('stat-info');
    const debugEl = document.getElementById('stat-debug');

    if (errorEl) errorEl.textContent = `ERROR: ${counts.ERROR}`;
    if (warnEl) warnEl.textContent = `WARN: ${counts.WARN}`;
    if (infoEl) infoEl.textContent = `INFO: ${counts.INFO}`;
    if (debugEl) debugEl.textContent = `DEBUG: ${counts.DEBUG}`;
  }

  async function refresh() {
    try {
      const logs = await api.getLogs({ limit: 50 });

      logEvents = logs.map((log, i) => {
        // Use ClientIp from metadata if available, otherwise fall back to source_ip
        const ip = (log.metadata && log.metadata.ClientIp) || log.source_ip;
        const coords = getCoordinates(ip, log.service);
        return {
          id: i,
          lat: coords.lat,
          lng: coords.lng,
          level: log.level,
          service: log.service,
          ip: ip,
          city: coords.city,
          message: log.message,
          timestamp: new Date(log.timestamp)
        };
      });

      if (markersLayer) {
        markersLayer.clearLayers();
        logEvents.forEach(event => addMarker(event, false));
      }

      updateStats();
    } catch (err) {
      api.log('Error refreshing: ' + err.message);
    }
  }
})();
