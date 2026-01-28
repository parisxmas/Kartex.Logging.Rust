// ===== State Management =====
const state = {
    logs: [],
    currentPage: 1,
    pageSize: 50,
    filters: {
        level: '',
        service: '',
        search: '',
        timeRange: '24h'
    },
    autoRefresh: false,
    autoRefreshInterval: null,
    apiKey: localStorage.getItem('apiKey') || 'your-api-key-here',
    // WebSocket and Live Stream
    ws: null,
    wsReconnectTimeout: null,
    liveLogs: [],
    maxLiveLogs: 200,
    livePaused: false,
    // Alerts
    alerts: [],
    editingAlertId: null,
    // Traces
    traces: [],
    traceFilters: {
        service: '',
        timeRange: '24h',
        status: ''
    },
    liveSpans: [],
    maxLiveSpans: 100
};

// ===== API Functions =====
async function fetchLogs() {
    try {
        const params = new URLSearchParams();

        if (state.filters.level) params.append('level', state.filters.level);
        if (state.filters.service) params.append('service', state.filters.service);
        if (state.filters.search) params.append('search', state.filters.search);

        // Time range calculation
        if (state.filters.timeRange) {
            const now = new Date();
            let startTime;

            switch (state.filters.timeRange) {
                case '1h':
                    startTime = new Date(now - 60 * 60 * 1000);
                    break;
                case '24h':
                    startTime = new Date(now - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startTime = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    break;
            }

            if (startTime) {
                params.append('start_time', startTime.toISOString());
            }
        }

        params.append('limit', state.pageSize);
        params.append('skip', (state.currentPage - 1) * state.pageSize);

        const response = await fetch(`/api/logs?${params}`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        state.logs = data.logs;
        renderLogs();
        updatePagination(data.count);

    } catch (error) {
        console.error('Failed to fetch logs:', error);
        showError('Failed to load logs. Check your API key and connection.');
    }
}

async function fetchStats() {
    try {
        const response = await fetch('/api/stats', {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const stats = await response.json();
        renderStats(stats);
        updateQuickStats(stats);

    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

async function fetchLogById(id) {
    try {
        const response = await fetch(`/api/logs/${id}`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();

    } catch (error) {
        console.error('Failed to fetch log:', error);
        return null;
    }
}

// ===== Render Functions =====
function renderLogs() {
    const container = document.getElementById('logs-body');

    if (state.logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No logs found matching your criteria</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.logs.map(log => `
        <div class="log-row" data-id="${log._id?.$oid || log._id}">
            <div class="log-col log-col-time">${formatTimestamp(log.timestamp)}</div>
            <div class="log-col log-col-level">
                <span class="level-badge level-${log.level}">${log.level}</span>
            </div>
            <div class="log-col log-col-service">${escapeHtml(log.service)}</div>
            <div class="log-col log-col-message">${escapeHtml(log.message)}</div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.log-row').forEach(row => {
        row.addEventListener('click', () => showLogDetail(row.dataset.id));
    });
}

function renderStats(stats) {
    // Render level chart
    const levelChart = document.getElementById('level-chart');
    const maxLevelCount = Math.max(...Object.values(stats.counts_by_level || {}), 1);

    const levelColors = {
        'TRACE': 'var(--level-trace)',
        'DEBUG': 'var(--level-debug)',
        'INFO': 'var(--level-info)',
        'WARN': 'var(--level-warn)',
        'ERROR': 'var(--level-error)',
        'FATAL': 'var(--level-fatal)'
    };

    levelChart.innerHTML = Object.entries(stats.counts_by_level || {})
        .sort((a, b) => b[1] - a[1])
        .map(([level, count]) => `
            <div class="chart-bar">
                <span class="chart-label">${level}</span>
                <div class="chart-bar-container">
                    <div class="chart-bar-fill" style="width: ${(count / maxLevelCount) * 100}%; background: ${levelColors[level] || 'var(--accent-primary)'}"></div>
                </div>
                <span class="chart-value">${formatNumber(count)}</span>
            </div>
        `).join('');

    // Render service chart
    const serviceChart = document.getElementById('service-chart');
    const maxServiceCount = Math.max(...Object.values(stats.counts_by_service || {}), 1);

    serviceChart.innerHTML = Object.entries(stats.counts_by_service || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([service, count]) => `
            <div class="chart-bar">
                <span class="chart-label" title="${service}">${truncate(service, 12)}</span>
                <div class="chart-bar-container">
                    <div class="chart-bar-fill" style="width: ${(count / maxServiceCount) * 100}%; background: var(--accent-gradient)"></div>
                </div>
                <span class="chart-value">${formatNumber(count)}</span>
            </div>
        `).join('');
}

function updateQuickStats(stats) {
    document.getElementById('total-logs').textContent = formatNumber(stats.total_count);

    const errorCount = (stats.counts_by_level?.ERROR || 0) + (stats.counts_by_level?.FATAL || 0);
    document.getElementById('error-count').textContent = formatNumber(errorCount);
}

function updatePagination(count) {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('current-page');

    pageInfo.textContent = state.currentPage;
    prevBtn.disabled = state.currentPage <= 1;
    nextBtn.disabled = count < state.pageSize;
}

async function showLogDetail(id) {
    const modal = document.getElementById('log-modal');
    const modalBody = document.getElementById('modal-body');

    const log = await fetchLogById(id);

    if (!log) {
        modalBody.innerHTML = '<p class="empty-state">Failed to load log details</p>';
    } else {
        modalBody.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">ID</span>
                <span class="detail-value mono">${log._id?.$oid || log._id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Timestamp</span>
                <span class="detail-value mono">${formatTimestamp(log.timestamp, true)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Level</span>
                <span class="detail-value">
                    <span class="level-badge level-${log.level}">${log.level}</span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Service</span>
                <span class="detail-value">${escapeHtml(log.service)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Source IP</span>
                <span class="detail-value mono">${escapeHtml(log.source_ip)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Message</span>
                <span class="detail-value">${escapeHtml(log.message)}</span>
            </div>
            ${Object.keys(log.metadata || {}).length > 0 ? `
                <div class="detail-row">
                    <span class="detail-label">Metadata</span>
                    <div class="detail-value">
                        <div class="metadata-container">${JSON.stringify(log.metadata, null, 2)}</div>
                    </div>
                </div>
            ` : ''}
        `;
    }

    modal.classList.remove('hidden');
}

function showError(message) {
    const container = document.getElementById('logs-body');
    container.innerHTML = `
        <div class="empty-state">
            <p>⚠️ ${escapeHtml(message)}</p>
        </div>
    `;
}

// ===== Utility Functions =====
function formatTimestamp(timestamp, full = false) {
    const date = new Date(timestamp);
    if (full) {
        return date.toLocaleString();
    }
    return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function truncate(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Event Handlers =====
function initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            const view = item.dataset.view;
            document.getElementById('logs-view').classList.toggle('hidden', view !== 'logs');
            document.getElementById('traces-view')?.classList.toggle('hidden', view !== 'traces');
            document.getElementById('live-view').classList.toggle('hidden', view !== 'live');
            document.getElementById('stats-view').classList.toggle('hidden', view !== 'stats');
            document.getElementById('alerts-view').classList.toggle('hidden', view !== 'alerts');
            document.getElementById('settings-view').classList.toggle('hidden', view !== 'settings');
            document.getElementById('pagination').classList.toggle('hidden', view !== 'logs');
            document.getElementById('filters-container')?.classList.toggle('hidden', view === 'live' || view === 'alerts' || view === 'settings' || view === 'traces');

            if (view === 'stats') {
                fetchStats();
            } else if (view === 'alerts') {
                fetchAlerts();
            } else if (view === 'traces') {
                fetchTraces();
            }
        });
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        fetchLogs();
        fetchStats();
    });

    // Auto-refresh toggle
    const autoRefreshBtn = document.getElementById('auto-refresh-btn');
    const refreshIntervalSelect = document.getElementById('refresh-interval');

    function startAutoRefresh() {
        const interval = parseInt(refreshIntervalSelect.value, 10);
        console.log('Auto-refresh started with interval:', interval, 'ms');
        // Clear any existing interval
        if (state.autoRefreshInterval) {
            clearInterval(state.autoRefreshInterval);
        }
        // Fetch immediately, then set interval
        fetchLogs();
        fetchStats();
        state.autoRefreshInterval = setInterval(() => {
            console.log('Auto-refresh tick');
            fetchLogs();
            fetchStats();
        }, interval);
    }

    autoRefreshBtn.addEventListener('click', () => {
        state.autoRefresh = !state.autoRefresh;

        if (state.autoRefresh) {
            autoRefreshBtn.innerHTML = '<span class="btn-icon">⏸️</span> Stop';
            autoRefreshBtn.classList.add('btn-active');
            startAutoRefresh();
        } else {
            autoRefreshBtn.innerHTML = '<span class="btn-icon">▶️</span> Auto';
            autoRefreshBtn.classList.remove('btn-active');
            clearInterval(state.autoRefreshInterval);
            state.autoRefreshInterval = null;
        }
    });

    // Update interval while auto-refresh is running
    refreshIntervalSelect.addEventListener('change', () => {
        if (state.autoRefresh) {
            startAutoRefresh();
        }
    });

    // Filters
    document.getElementById('level-filter').addEventListener('change', (e) => {
        state.filters.level = e.target.value;
        state.currentPage = 1;
        fetchLogs();
    });

    document.getElementById('service-filter').addEventListener('change', (e) => {
        state.filters.service = e.target.value;
        state.currentPage = 1;
        fetchLogs();
    });

    let searchTimeout;
    document.getElementById('search-filter').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.filters.search = e.target.value;
            state.currentPage = 1;
            fetchLogs();
        }, 300);
    });

    document.getElementById('time-filter').addEventListener('change', (e) => {
        state.filters.timeRange = e.target.value;
        state.currentPage = 1;
        fetchLogs();
    });

    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            fetchLogs();
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        state.currentPage++;
        fetchLogs();
    });

    // Modal
    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('log-modal').classList.add('hidden');
    });

    document.querySelector('.modal-backdrop').addEventListener('click', () => {
        document.getElementById('log-modal').classList.add('hidden');
    });

    // Settings
    const apiKeyInput = document.getElementById('api-key');
    apiKeyInput.value = state.apiKey;

    document.getElementById('save-settings').addEventListener('click', () => {
        state.apiKey = apiKeyInput.value;
        localStorage.setItem('apiKey', state.apiKey);
        alert('Settings saved!');
        fetchLogs();
        fetchStats();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('log-modal').classList.add('hidden');
        }
        if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            fetchLogs();
            fetchStats();
        }
    });
}

// ===== Live View Listeners =====
function initLiveViewListeners() {
    const pauseBtn = document.getElementById('pause-live');
    const clearBtn = document.getElementById('clear-live');
    const indicator = document.getElementById('live-indicator');

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            state.livePaused = !state.livePaused;
            pauseBtn.textContent = state.livePaused ? 'Resume' : 'Pause';
            indicator.classList.toggle('paused', state.livePaused);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.liveLogs = [];
            renderLiveLogs();
        });
    }
}

// ===== Alert Listeners =====
function initAlertListeners() {
    const addAlertBtn = document.getElementById('add-alert-btn');
    const alertModal = document.getElementById('alert-modal');
    const alertModalClose = document.getElementById('alert-modal-close');
    const cancelAlertBtn = document.getElementById('cancel-alert');
    const alertForm = document.getElementById('alert-form');
    const conditionTypeSelect = document.getElementById('alert-condition-type');
    const actionTypeSelect = document.getElementById('alert-action-type');

    if (addAlertBtn) {
        addAlertBtn.addEventListener('click', () => showAlertModal());
    }

    if (alertModalClose) {
        alertModalClose.addEventListener('click', () => alertModal.classList.add('hidden'));
    }

    if (cancelAlertBtn) {
        cancelAlertBtn.addEventListener('click', () => alertModal.classList.add('hidden'));
    }

    if (alertModal) {
        alertModal.querySelector('.modal-backdrop').addEventListener('click', () => {
            alertModal.classList.add('hidden');
        });
    }

    if (alertForm) {
        alertForm.addEventListener('submit', saveAlert);
    }

    if (conditionTypeSelect) {
        conditionTypeSelect.addEventListener('change', (e) => {
            const levelGroup = document.getElementById('level-select-group');
            levelGroup.style.display = e.target.value === 'level_count' ? 'block' : 'none';
        });
    }

    if (actionTypeSelect) {
        actionTypeSelect.addEventListener('change', (e) => {
            const webhookGroup = document.getElementById('webhook-url-group');
            webhookGroup.style.display = e.target.value === 'webhook' ? 'block' : 'none';
        });
    }
}

// ===== WebSocket Functions =====
function connectWebSocket() {
    const wsStatus = document.getElementById('ws-status');
    wsStatus.textContent = '●';
    wsStatus.className = 'stat-value connecting';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
        state.ws = new WebSocket(wsUrl);

        state.ws.onopen = () => {
            console.log('WebSocket connected');
            wsStatus.textContent = '●';
            wsStatus.className = 'stat-value connected';
            if (state.wsReconnectTimeout) {
                clearTimeout(state.wsReconnectTimeout);
                state.wsReconnectTimeout = null;
            }
        };

        state.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleWsMessage(msg);
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };

        state.ws.onclose = () => {
            console.log('WebSocket disconnected');
            wsStatus.textContent = '●';
            wsStatus.className = 'stat-value disconnected';
            // Reconnect after 3 seconds
            state.wsReconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        state.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            wsStatus.textContent = '●';
            wsStatus.className = 'stat-value disconnected';
        };
    } catch (e) {
        console.error('Failed to connect WebSocket:', e);
        wsStatus.textContent = '●';
        wsStatus.className = 'stat-value disconnected';
        state.wsReconnectTimeout = setTimeout(connectWebSocket, 3000);
    }
}

function handleWsMessage(msg) {
    switch (msg.type) {
        case 'log':
            if (!state.livePaused) {
                addLiveLog(msg.data);
            }
            break;
        case 'span':
            if (!state.livePaused) {
                addLiveSpan(msg.data);
            }
            break;
        case 'metrics':
            updateRealtimeMetrics(msg.data);
            break;
        case 'connected':
            console.log('WebSocket:', msg.message);
            break;
        case 'error':
            console.warn('WebSocket error:', msg.message);
            break;
    }
}

function addLiveLog(log) {
    state.liveLogs.unshift(log);

    const container = document.getElementById('live-logs-body');
    if (!container) return;

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Create new log entry element
    const entry = document.createElement('div');
    entry.className = 'live-log-entry';
    entry.innerHTML = `
        <span class="time">${formatTime(log.timestamp)}</span>
        <span class="level level-${log.level}">${log.level}</span>
        <span class="service">${escapeHtml(log.service)}</span>
        <span class="message">${escapeHtml(log.message)}</span>
    `;

    // Prepend to container
    container.insertBefore(entry, container.firstChild);

    // Remove old entries if exceeding max
    while (state.liveLogs.length > state.maxLiveLogs) {
        state.liveLogs.pop();
        if (container.lastChild) {
            container.removeChild(container.lastChild);
        }
    }
}

function renderLiveLogs() {
    const container = document.getElementById('live-logs-body');
    if (!container) return;

    if (state.liveLogs.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Waiting for live logs...</p></div>';
        return;
    }

    // Full re-render only when needed (e.g., after clear)
    container.innerHTML = state.liveLogs.map(log => `
        <div class="live-log-entry">
            <span class="time">${formatTime(log.timestamp)}</span>
            <span class="level level-${log.level}">${log.level}</span>
            <span class="service">${escapeHtml(log.service)}</span>
            <span class="message">${escapeHtml(log.message)}</span>
        </div>
    `).join('');
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
}

function updateRealtimeMetrics(metrics) {
    // Sidebar metrics
    document.getElementById('logs-per-sec').textContent = metrics.logs_per_second.toFixed(2);
    document.getElementById('error-rate').textContent = (metrics.error_rate * 100).toFixed(1) + '%';

    // Live view metrics
    const liveLogsSec = document.getElementById('live-logs-sec');
    const liveErrorRate = document.getElementById('live-error-rate');
    const liveErrorsSec = document.getElementById('live-errors-sec');
    const liveTotalMinute = document.getElementById('live-total-minute');

    if (liveLogsSec) liveLogsSec.textContent = metrics.logs_per_second.toFixed(2);
    if (liveErrorRate) liveErrorRate.textContent = (metrics.error_rate * 100).toFixed(1) + '%';
    if (liveErrorsSec) liveErrorsSec.textContent = metrics.errors_per_second.toFixed(2);
    if (liveTotalMinute) liveTotalMinute.textContent = metrics.logs_last_minute;
}

// ===== Alerts Functions =====
async function fetchAlerts() {
    try {
        const response = await fetch('/api/alerts', {
            headers: { 'Authorization': `Bearer ${state.apiKey}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.alerts = await response.json();
        renderAlerts();
    } catch (error) {
        console.error('Failed to fetch alerts:', error);
    }
}

function renderAlerts() {
    const container = document.getElementById('alerts-list');
    if (!container) return;

    if (state.alerts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No alerts configured. Create your first alert rule.</p></div>';
        return;
    }

    container.innerHTML = state.alerts.map(alert => {
        const conditionText = formatCondition(alert.condition);
        const actionText = alert.action.type === 'webhook' ? `Webhook: ${alert.action.url}` : 'Log to console';
        const lastTriggered = alert.last_triggered ? new Date(alert.last_triggered).toLocaleString() : 'Never';

        return `
            <div class="alert-card ${alert.enabled ? '' : 'disabled'}" data-id="${alert._id?.$oid || alert._id}">
                <div class="alert-info">
                    <div class="alert-name">${escapeHtml(alert.name)}</div>
                    <div class="alert-condition">${conditionText} → ${actionText}</div>
                    <div class="alert-stats">Triggered: ${alert.trigger_count || 0} times | Last: ${lastTriggered}</div>
                </div>
                <div class="alert-actions">
                    <button class="btn btn-secondary btn-sm edit-alert-btn">Edit</button>
                    <button class="btn btn-danger btn-sm delete-alert-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners
    container.querySelectorAll('.edit-alert-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.alert-card');
            const id = card.dataset.id;
            editAlert(id);
        });
    });

    container.querySelectorAll('.delete-alert-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.alert-card');
            const id = card.dataset.id;
            deleteAlert(id);
        });
    });
}

function formatCondition(condition) {
    switch (condition.type) {
        case 'error_rate':
            return `Error rate > ${(condition.threshold * 100).toFixed(1)}%`;
        case 'errors_per_second':
            return `Errors/sec > ${condition.threshold}`;
        case 'logs_per_second':
            return `Logs/sec > ${condition.threshold}`;
        case 'level_count':
            return `${condition.level} count > ${condition.threshold}`;
        default:
            return 'Unknown condition';
    }
}

function showAlertModal(alert = null) {
    const modal = document.getElementById('alert-modal');
    const title = document.getElementById('alert-modal-title');
    const form = document.getElementById('alert-form');

    // Reset form
    form.reset();
    document.getElementById('alert-id').value = '';
    document.getElementById('level-select-group').style.display = 'none';
    document.getElementById('webhook-url-group').style.display = 'none';

    if (alert) {
        title.textContent = 'Edit Alert';
        document.getElementById('alert-id').value = alert._id?.$oid || alert._id;
        document.getElementById('alert-name').value = alert.name;
        document.getElementById('alert-condition-type').value = alert.condition.type;
        document.getElementById('alert-enabled').checked = alert.enabled;

        if (alert.condition.type === 'level_count') {
            document.getElementById('level-select-group').style.display = 'block';
            document.getElementById('alert-level').value = alert.condition.level;
            document.getElementById('alert-threshold').value = alert.condition.threshold;
        } else if (alert.condition.type === 'error_rate') {
            document.getElementById('alert-threshold').value = alert.condition.threshold * 100;
        } else {
            document.getElementById('alert-threshold').value = alert.condition.threshold;
        }

        if (alert.action.type === 'webhook') {
            document.getElementById('alert-action-type').value = 'webhook';
            document.getElementById('webhook-url-group').style.display = 'block';
            document.getElementById('alert-webhook-url').value = alert.action.url;
        }
    } else {
        title.textContent = 'Create Alert';
    }

    modal.classList.remove('hidden');
}

function editAlert(id) {
    const alert = state.alerts.find(a => (a._id?.$oid || a._id) === id);
    if (alert) {
        showAlertModal(alert);
    }
}

async function deleteAlert(id) {
    if (!confirm('Are you sure you want to delete this alert?')) return;

    try {
        const response = await fetch(`/api/alerts/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.apiKey}` }
        });
        if (response.ok) {
            fetchAlerts();
        } else {
            alert('Failed to delete alert');
        }
    } catch (error) {
        console.error('Failed to delete alert:', error);
        alert('Failed to delete alert');
    }
}

async function saveAlert(e) {
    e.preventDefault();

    const id = document.getElementById('alert-id').value;
    const name = document.getElementById('alert-name').value;
    const conditionType = document.getElementById('alert-condition-type').value;
    const actionType = document.getElementById('alert-action-type').value;
    const enabled = document.getElementById('alert-enabled').checked;
    let threshold = parseFloat(document.getElementById('alert-threshold').value);

    // Build condition
    let condition;
    if (conditionType === 'level_count') {
        condition = {
            type: conditionType,
            level: document.getElementById('alert-level').value,
            threshold: parseInt(threshold)
        };
    } else if (conditionType === 'error_rate') {
        condition = {
            type: conditionType,
            threshold: threshold / 100  // Convert percentage to decimal
        };
    } else {
        condition = {
            type: conditionType,
            threshold: threshold
        };
    }

    // Build action
    let action;
    if (actionType === 'webhook') {
        action = {
            type: 'webhook',
            url: document.getElementById('alert-webhook-url').value
        };
    } else {
        action = { type: 'log' };
    }

    const alertData = {
        name,
        enabled,
        condition,
        action
    };

    try {
        const url = id ? `/api/alerts/${id}` : '/api/alerts';
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(alertData)
        });

        if (response.ok) {
            document.getElementById('alert-modal').classList.add('hidden');
            fetchAlerts();
        } else {
            const error = await response.json();
            alert('Failed to save alert: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Failed to save alert:', error);
        alert('Failed to save alert');
    }
}

// ===== Trace Functions =====
async function fetchTraces() {
    try {
        const params = new URLSearchParams();

        if (state.traceFilters.service) params.append('service', state.traceFilters.service);
        if (state.traceFilters.status) params.append('status', state.traceFilters.status);

        // Time range calculation
        if (state.traceFilters.timeRange) {
            const now = new Date();
            let startTime;

            switch (state.traceFilters.timeRange) {
                case '1h':
                    startTime = new Date(now - 60 * 60 * 1000);
                    break;
                case '24h':
                    startTime = new Date(now - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    break;
            }

            if (startTime) {
                params.append('start_time', startTime.toISOString());
            }
        }

        params.append('limit', 50);

        const response = await fetch(`/api/traces?${params}`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        state.traces = data.traces;
        renderTraces();

    } catch (error) {
        console.error('Failed to fetch traces:', error);
    }
}

function renderTraces() {
    const container = document.getElementById('traces-body');
    if (!container) return;

    if (state.traces.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No traces found matching your criteria</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.traces.map(trace => `
        <div class="trace-row" data-trace-id="${trace.trace_id}">
            <div class="trace-col trace-col-name">
                <span class="trace-name">${escapeHtml(trace.root_span_name)}</span>
                <span class="trace-id mono">${trace.trace_id.substring(0, 16)}...</span>
            </div>
            <div class="trace-col trace-col-service">${escapeHtml(trace.service)}</div>
            <div class="trace-col trace-col-duration">${formatDuration(trace.duration_ms)}</div>
            <div class="trace-col trace-col-spans">
                ${trace.span_count} spans
                ${trace.error_count > 0 ? `<span class="error-badge">${trace.error_count} errors</span>` : ''}
            </div>
            <div class="trace-col trace-col-status">
                <span class="status-badge status-${trace.status}">${trace.status}</span>
            </div>
            <div class="trace-col trace-col-time">${formatTimestamp(trace.start_time)}</div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.trace-row').forEach(row => {
        row.addEventListener('click', () => showTraceDetail(row.dataset.traceId));
    });
}

function formatDuration(ms) {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

async function showTraceDetail(traceId) {
    const modal = document.getElementById('trace-modal');
    const modalBody = document.getElementById('trace-modal-body');

    modalBody.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading trace...</p></div>';
    modal.classList.remove('hidden');

    try {
        const response = await fetch(`/api/traces/${traceId}`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const trace = await response.json();
        renderTraceDetail(trace, modalBody);

    } catch (error) {
        console.error('Failed to fetch trace:', error);
        modalBody.innerHTML = '<p class="empty-state">Failed to load trace details</p>';
    }
}

function renderTraceDetail(trace, container) {
    // Build the waterfall visualization
    const spans = trace.spans;
    const logs = trace.logs || [];

    if (spans.length === 0) {
        container.innerHTML = '<p class="empty-state">No spans found in this trace</p>';
        return;
    }

    // Find the root span and calculate timeline
    const rootSpan = spans.find(s => !s.parent_span_id) || spans[0];
    const traceStart = rootSpan.start_time_unix_nano;
    const traceEnd = Math.max(...spans.map(s => s.end_time_unix_nano));
    const traceDuration = traceEnd - traceStart;

    // Sort spans by start time
    spans.sort((a, b) => a.start_time_unix_nano - b.start_time_unix_nano);

    container.innerHTML = `
        <div class="trace-summary">
            <div class="trace-summary-item">
                <span class="label">Trace ID</span>
                <span class="value mono">${trace.trace_id}</span>
            </div>
            <div class="trace-summary-item">
                <span class="label">Duration</span>
                <span class="value">${formatDuration((traceEnd - traceStart) / 1000000)}</span>
            </div>
            <div class="trace-summary-item">
                <span class="label">Spans</span>
                <span class="value">${spans.length}</span>
            </div>
            <div class="trace-summary-item">
                <span class="label">Service</span>
                <span class="value">${escapeHtml(rootSpan.service)}</span>
            </div>
        </div>

        <div class="trace-tabs">
            <button class="trace-tab active" data-tab="waterfall">Waterfall</button>
            <button class="trace-tab" data-tab="spans">Spans</button>
            ${logs.length > 0 ? '<button class="trace-tab" data-tab="logs">Logs (' + logs.length + ')</button>' : ''}
        </div>

        <div class="trace-tab-content" id="trace-tab-waterfall">
            <div class="waterfall-container">
                ${spans.map(span => {
                    const offset = ((span.start_time_unix_nano - traceStart) / traceDuration) * 100;
                    const width = Math.max(((span.end_time_unix_nano - span.start_time_unix_nano) / traceDuration) * 100, 0.5);
                    const isError = span.status && span.status.code === 'ERROR';

                    return `
                        <div class="waterfall-row" data-span-id="${span.span_id}">
                            <div class="waterfall-label">
                                <span class="span-name">${escapeHtml(span.name)}</span>
                                <span class="span-service">${escapeHtml(span.service)}</span>
                            </div>
                            <div class="waterfall-bar-container">
                                <div class="waterfall-bar ${isError ? 'error' : ''}" style="left: ${offset}%; width: ${width}%;">
                                    <span class="bar-duration">${formatDuration(span.duration_ms)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>

        <div class="trace-tab-content hidden" id="trace-tab-spans">
            <div class="spans-list">
                ${spans.map(span => `
                    <div class="span-detail-card ${span.status && span.status.code === 'ERROR' ? 'error' : ''}">
                        <div class="span-header">
                            <span class="span-name">${escapeHtml(span.name)}</span>
                            <span class="span-duration">${formatDuration(span.duration_ms)}</span>
                        </div>
                        <div class="span-meta">
                            <span><strong>Service:</strong> ${escapeHtml(span.service)}</span>
                            <span><strong>Kind:</strong> ${span.kind}</span>
                            <span><strong>Span ID:</strong> <code>${span.span_id}</code></span>
                            ${span.parent_span_id ? `<span><strong>Parent:</strong> <code>${span.parent_span_id}</code></span>` : ''}
                        </div>
                        ${span.status && span.status.code !== 'UNSET' ? `
                            <div class="span-status ${span.status.code.toLowerCase()}">
                                Status: ${span.status.code} ${span.status.message ? '- ' + escapeHtml(span.status.message) : ''}
                            </div>
                        ` : ''}
                        ${Object.keys(span.attributes || {}).length > 0 ? `
                            <div class="span-attributes">
                                <strong>Attributes:</strong>
                                <pre>${JSON.stringify(span.attributes, null, 2)}</pre>
                            </div>
                        ` : ''}
                        ${span.events && span.events.length > 0 ? `
                            <div class="span-events">
                                <strong>Events:</strong>
                                ${span.events.map(e => `<div class="span-event">${formatTime(e.timestamp)} - ${escapeHtml(e.name)}</div>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        ${logs.length > 0 ? `
            <div class="trace-tab-content hidden" id="trace-tab-logs">
                <div class="trace-logs-list">
                    ${logs.map(log => `
                        <div class="trace-log-entry">
                            <span class="time">${formatTime(log.timestamp)}</span>
                            <span class="level level-${log.level}">${log.level}</span>
                            <span class="message">${escapeHtml(log.message)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;

    // Add tab click handlers
    container.querySelectorAll('.trace-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.trace-tab').forEach(t => t.classList.remove('active'));
            container.querySelectorAll('.trace-tab-content').forEach(c => c.classList.add('hidden'));
            tab.classList.add('active');
            const targetId = `trace-tab-${tab.dataset.tab}`;
            document.getElementById(targetId)?.classList.remove('hidden');
        });
    });
}

function initTraceListeners() {
    const serviceFilter = document.getElementById('trace-service-filter');
    const timeFilter = document.getElementById('trace-time-filter');
    const statusFilter = document.getElementById('trace-status-filter');
    const traceModalClose = document.getElementById('trace-modal-close');
    const traceModal = document.getElementById('trace-modal');

    if (serviceFilter) {
        serviceFilter.addEventListener('change', (e) => {
            state.traceFilters.service = e.target.value;
            fetchTraces();
        });
    }

    if (timeFilter) {
        timeFilter.addEventListener('change', (e) => {
            state.traceFilters.timeRange = e.target.value;
            fetchTraces();
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            state.traceFilters.status = e.target.value;
            fetchTraces();
        });
    }

    if (traceModalClose) {
        traceModalClose.addEventListener('click', () => {
            traceModal.classList.add('hidden');
        });
    }

    if (traceModal) {
        traceModal.querySelector('.modal-backdrop').addEventListener('click', () => {
            traceModal.classList.add('hidden');
        });
    }
}

function addLiveSpan(span) {
    state.liveSpans.unshift(span);
    while (state.liveSpans.length > state.maxLiveSpans) {
        state.liveSpans.pop();
    }
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    initLiveViewListeners();
    initAlertListeners();
    initTraceListeners();
    fetchLogs();
    fetchStats();
    connectWebSocket();
});
