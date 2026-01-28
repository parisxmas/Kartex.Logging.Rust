import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user, logout } = useAuth();

  return (
    <div className="h-full overflow-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* User Info */}
      <div className="mb-6 p-6 bg-bg-secondary rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">Account Information</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Username</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded">{user?.username}</div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Role</label>
            <div className="px-3 py-2 bg-bg-tertiary rounded capitalize">{user?.role}</div>
          </div>
        </div>
      </div>

      {/* Session */}
      <div className="mb-6 p-6 bg-bg-secondary rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">Session</h2>
        <p className="text-text-secondary mb-4">
          You are currently logged in. Click the button below to sign out.
        </p>
        <button
          onClick={logout}
          className="px-4 py-2 bg-error hover:bg-error/80 text-white rounded transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* System Info */}
      <div className="p-6 bg-bg-secondary rounded-lg border border-border">
        <h2 className="text-lg font-semibold mb-4">System Information</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Application</span>
            <span>Kartex Logging</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Version</span>
            <span>1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">API Endpoint</span>
            <span className="font-mono">/api</span>
          </div>
        </div>
      </div>
    </div>
  );
}
