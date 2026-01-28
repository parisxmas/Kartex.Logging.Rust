import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Traces from './pages/Traces';
import LiveStream from './pages/LiveStream';
import Statistics from './pages/Statistics';
import Alerts from './pages/Alerts';
import Channels from './pages/Channels';
import Settings from './pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="logs" element={<Logs />} />
        <Route path="traces" element={<Traces />} />
        <Route path="live" element={<LiveStream />} />
        <Route path="stats" element={<Statistics />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="channels" element={<Channels />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
