import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiClient, RealtimeMetrics } from '../api/client';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { path: '/logs', label: 'Logs', icon: '📋' },
  { path: '/traces', label: 'Traces', icon: '🔗' },
  { path: '/live', label: 'Live Stream', icon: '📡' },
  { path: '/stats', label: 'Statistics', icon: '📊' },
  { path: '/alerts', label: 'Alerts', icon: '🔔' },
  { path: '/channels', label: 'Channels', icon: '📢' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    onClose();
  }, [location.pathname]);

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
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-bg-secondary border-r border-border flex flex-col
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      {/* Logo */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-accent">Kartex Logging</h1>
          <p className="text-xs text-text-secondary mt-1">Centralized Log Management</p>
        </div>
        {/* Close button for mobile */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors md:hidden"
          aria-label="Close menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
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

      {/* Theme Toggle */}
      <div className="px-4 py-2 border-t border-border">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-tertiary hover:bg-border transition-colors"
        >
          <span className="text-sm text-text-secondary">Theme</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">{theme === 'dark' ? '🌙' : '☀️'}</span>
            <span className="text-sm capitalize">{theme}</span>
          </div>
        </button>
      </div>

      {/* User Info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-2">
            <div className="font-medium truncate">{user?.username}</div>
            <div className="text-xs text-text-secondary capitalize">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            className="px-3 py-1 text-sm bg-bg-tertiary hover:bg-border rounded transition-colors flex-shrink-0"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
