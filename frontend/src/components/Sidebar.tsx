import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient, RealtimeMetrics } from '../api/client';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { path: '/logs', label: 'Logs', icon: '📋' },
  { path: '/traces', label: 'Traces', icon: '🔗' },
  { path: '/live', label: 'Live Stream', icon: '📡' },
  { path: '/stats', label: 'Statistics', icon: '📊' },
  { path: '/alerts', label: 'Alerts', icon: '🔔' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await apiClient.getMetrics();
        setMetrics(data);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    setWsStatus('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setWsStatus('connected');
    ws.onclose = () => setWsStatus('disconnected');
    ws.onerror = () => setWsStatus('disconnected');

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metrics') {
          setMetrics(msg.data);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <aside className="w-64 bg-bg-secondary border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold text-accent">Kartex Logging</h1>
        <p className="text-xs text-text-secondary mt-1">Centralized Log Management</p>
      </div>

      {/* Quick Stats */}
      <div className="p-4 border-b border-border">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-text-secondary">Logs/sec</span>
            <div className="font-mono text-accent">
              {metrics?.logs_per_second.toFixed(2) || '0.00'}
            </div>
          </div>
          <div>
            <span className="text-text-secondary">Error Rate</span>
            <div className="font-mono text-error">
              {metrics ? (metrics.error_rate * 100).toFixed(1) : '0.0'}%
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-2 mt-2">
            <span className="text-text-secondary">WebSocket</span>
            <span className={`ws-indicator ws-${wsStatus}`}></span>
            <span className="text-xs capitalize">{wsStatus}</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{user?.username}</div>
            <div className="text-xs text-text-secondary capitalize">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            className="px-3 py-1 text-sm bg-bg-tertiary hover:bg-border rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
