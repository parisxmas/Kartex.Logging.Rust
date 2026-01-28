import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, Dashboard as DashboardType, Widget, LayoutItem } from '../api/client';
import { useWidgetData } from '../hooks/useWidgetData';
import DashboardGrid from '../components/dashboard/DashboardGrid';
import AddWidgetModal from '../components/dashboard/AddWidgetModal';
import WidgetConfigModal from '../components/dashboard/WidgetConfigModal';

export default function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardType | null>(null);
  const [dashboards, setDashboards] = useState<DashboardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [configureWidgetId, setConfigureWidgetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Get widget data
  const { data: widgetData, loading: widgetLoading, errors: widgetErrors, refresh, refreshAll } = useWidgetData(
    dashboard?.widgets ?? []
  );

  // Fetch dashboards
  const fetchDashboards = useCallback(async () => {
    try {
      const response = await apiClient.getDashboards();
      setDashboards(response.dashboards);
      return response.dashboards;
    } catch (err) {
      console.error('Failed to fetch dashboards:', err);
      return [];
    }
  }, []);

  // Fetch default dashboard
  const fetchDefaultDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const defaultDashboard = await apiClient.getDefaultDashboard();
      setDashboard(defaultDashboard);
      await fetchDashboards();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [fetchDashboards]);

  // Load dashboard on mount
  useEffect(() => {
    fetchDefaultDashboard();
  }, [fetchDefaultDashboard]);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 32); // Account for padding
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Save dashboard changes
  const saveDashboard = useCallback(async (updates: Partial<DashboardType>) => {
    if (!dashboard?._id) return;

    const id = typeof dashboard._id === 'string' ? dashboard._id : dashboard._id?.$oid;
    if (!id) return;

    setIsSaving(true);

    try {
      await apiClient.updateDashboard(id, {
        name: updates.name ?? dashboard.name,
        is_default: updates.is_default ?? dashboard.is_default,
        layout: updates.layout ?? dashboard.layout,
        widgets: updates.widgets ?? dashboard.widgets,
      });

      setDashboard((prev) => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      console.error('Failed to save dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [dashboard]);

  // Handle layout change
  const handleLayoutChange = useCallback((newLayout: LayoutItem[]) => {
    if (!dashboard) return;
    setDashboard((prev) => prev ? { ...prev, layout: newLayout } : null);
  }, [dashboard]);

  // Save layout when exiting edit mode
  const handleExitEditMode = useCallback(async () => {
    if (dashboard) {
      await saveDashboard({ layout: dashboard.layout, widgets: dashboard.widgets });
    }
    setIsEditMode(false);
  }, [dashboard, saveDashboard]);

  // Handle widget refresh
  const handleRefreshWidget = useCallback((widgetId: string) => {
    refresh([widgetId]);
  }, [refresh]);

  // Handle widget configuration
  const handleConfigureWidget = useCallback((widgetId: string) => {
    setConfigureWidgetId(widgetId);
  }, []);

  // Handle widget removal
  const handleRemoveWidget = useCallback((widgetId: string) => {
    if (!dashboard) return;

    setDashboard((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        layout: prev.layout.filter((item) => item.i !== widgetId),
        widgets: prev.widgets.filter((w) => w.id !== widgetId),
      };
    });
  }, [dashboard]);

  // Handle add widget
  const handleAddWidget = useCallback((widget: Widget) => {
    if (!dashboard) return;

    // Find a position for the new widget
    const maxY = dashboard.layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

    const newLayout: LayoutItem = {
      i: widget.id,
      x: 0,
      y: maxY,
      w: getDefaultWidth(widget.widget_type),
      h: getDefaultHeight(widget.widget_type),
      minW: 2,
      minH: 2,
    };

    setDashboard((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        layout: [...prev.layout, newLayout],
        widgets: [...prev.widgets, widget],
      };
    });
  }, [dashboard]);

  // Handle save widget config
  const handleSaveWidgetConfig = useCallback((updatedWidget: Widget) => {
    if (!dashboard) return;

    setDashboard((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        widgets: prev.widgets.map((w) => (w.id === updatedWidget.id ? updatedWidget : w)),
      };
    });
  }, [dashboard]);

  // Switch dashboard
  const handleSwitchDashboard = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const newDashboard = await apiClient.getDashboard(id);
      setDashboard(newDashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new dashboard
  const handleCreateDashboard = useCallback(async () => {
    const name = prompt('Enter dashboard name:');
    if (!name) return;

    try {
      const result = await apiClient.createDashboard({ name, layout: [], widgets: [] });
      const newDashboard = await apiClient.getDashboard(result.id);
      setDashboard(newDashboard);
      await fetchDashboards();
      setIsEditMode(true);
    } catch (err) {
      console.error('Failed to create dashboard:', err);
    }
  }, [fetchDashboards]);

  const widgetToConfig = dashboard?.widgets.find((w) => w.id === configureWidgetId) ?? null;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-text-secondary">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-error/10 border border-error/30 text-error rounded-lg p-4">
          {error}
        </div>
        <button
          onClick={fetchDefaultDashboard}
          className="mt-4 px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{dashboard?.name ?? 'Dashboard'}</h1>
          {dashboards.length > 1 && (
            <select
              value={dashboard?._id ? (typeof dashboard._id === 'string' ? dashboard._id : dashboard._id.$oid) : ''}
              onChange={(e) => handleSwitchDashboard(e.target.value)}
              className="px-3 py-1 bg-bg-secondary border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {dashboards.map((d) => {
                const id = typeof d._id === 'string' ? d._id : d._id?.$oid || '';
                return (
                  <option key={id} value={id}>
                    {d.name} {d.is_default ? '(Default)' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="px-3 py-2 bg-bg-secondary hover:bg-bg-tertiary border border-border rounded transition-colors flex items-center gap-2"
            title="Refresh all widgets"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          {isEditMode ? (
            <>
              <button
                onClick={() => setShowAddWidget(true)}
                className="px-3 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Widget
              </button>
              <button
                onClick={handleExitEditMode}
                disabled={isSaving}
                className="px-3 py-2 bg-success hover:bg-success/80 text-white rounded transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <span className="animate-pulse">Saving...</span>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Done
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditMode(true)}
                className="px-3 py-2 bg-bg-secondary hover:bg-bg-tertiary border border-border rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={handleCreateDashboard}
                className="px-3 py-2 bg-bg-secondary hover:bg-bg-tertiary border border-border rounded transition-colors"
                title="Create new dashboard"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dashboard Grid */}
      {dashboard && dashboard.widgets.length > 0 ? (
        <DashboardGrid
          layout={dashboard.layout}
          widgets={dashboard.widgets}
          widgetData={widgetData}
          widgetLoading={widgetLoading}
          widgetErrors={widgetErrors}
          isEditMode={isEditMode}
          onLayoutChange={handleLayoutChange}
          onRefreshWidget={handleRefreshWidget}
          onConfigureWidget={handleConfigureWidget}
          onRemoveWidget={handleRemoveWidget}
          width={containerWidth}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-bg-secondary rounded-lg border border-border">
          <div className="text-text-secondary mb-4">No widgets added yet</div>
          <button
            onClick={() => {
              setIsEditMode(true);
              setShowAddWidget(true);
            }}
            className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
          >
            Add Your First Widget
          </button>
        </div>
      )}

      {/* Modals */}
      <AddWidgetModal
        isOpen={showAddWidget}
        onClose={() => setShowAddWidget(false)}
        onAdd={handleAddWidget}
      />

      <WidgetConfigModal
        widget={widgetToConfig}
        isOpen={configureWidgetId !== null}
        onClose={() => setConfigureWidgetId(null)}
        onSave={handleSaveWidgetConfig}
      />
    </div>
  );
}

function getDefaultWidth(widgetType: string): number {
  switch (widgetType) {
    case 'log_count':
    case 'custom_metric':
      return 3;
    case 'error_rate_chart':
    case 'recent_logs':
    case 'trace_latency_histogram':
    case 'service_health':
    case 'live_stream':
      return 6;
    default:
      return 4;
  }
}

function getDefaultHeight(widgetType: string): number {
  switch (widgetType) {
    case 'log_count':
    case 'custom_metric':
      return 2;
    case 'service_health':
      return 3;
    case 'error_rate_chart':
    case 'recent_logs':
    case 'trace_latency_histogram':
      return 4;
    case 'live_stream':
      return 5;
    default:
      return 3;
  }
}
