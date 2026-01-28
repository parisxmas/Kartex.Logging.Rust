import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, Widget, WidgetDataQuery, WidgetDataItem } from '../api/client';

interface UseWidgetDataResult {
  data: Record<string, unknown>;
  loading: Record<string, boolean>;
  errors: Record<string, string | undefined>;
  refresh: (widgetIds?: string[]) => void;
  refreshAll: () => void;
}

export function useWidgetData(widgets: Widget[]): UseWidgetDataResult {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const intervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const fetchWidgetData = useCallback(async (widgetsToFetch: Widget[]) => {
    if (widgetsToFetch.length === 0) return;

    // Set loading state for widgets being fetched
    setLoading(prev => {
      const next = { ...prev };
      widgetsToFetch.forEach(w => { next[w.id] = true; });
      return next;
    });

    const queries: WidgetDataQuery[] = widgetsToFetch.map(w => ({
      widget_id: w.id,
      widget_type: w.widget_type,
      config: w.config,
    }));

    try {
      const response = await apiClient.getWidgetData(queries);

      // Update data and clear errors for successfully fetched widgets
      setData(prev => {
        const next = { ...prev };
        response.data.forEach((item: WidgetDataItem) => {
          if (!item.error) {
            next[item.widget_id] = item.data;
          }
        });
        return next;
      });

      setErrors(prev => {
        const next = { ...prev };
        response.data.forEach((item: WidgetDataItem) => {
          next[item.widget_id] = item.error;
        });
        return next;
      });
    } catch (err) {
      // Set error for all widgets being fetched
      setErrors(prev => {
        const next = { ...prev };
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch data';
        widgetsToFetch.forEach(w => { next[w.id] = errorMsg; });
        return next;
      });
    } finally {
      // Clear loading state
      setLoading(prev => {
        const next = { ...prev };
        widgetsToFetch.forEach(w => { next[w.id] = false; });
        return next;
      });
    }
  }, []);

  const refresh = useCallback((widgetIds?: string[]) => {
    const widgetsToRefresh = widgetIds
      ? widgets.filter(w => widgetIds.includes(w.id))
      : widgets;
    fetchWidgetData(widgetsToRefresh);
  }, [widgets, fetchWidgetData]);

  const refreshAll = useCallback(() => {
    fetchWidgetData(widgets);
  }, [widgets, fetchWidgetData]);

  // Initial fetch and setup refresh intervals
  useEffect(() => {
    // Fetch all widget data initially
    fetchWidgetData(widgets);

    // Clear any existing intervals
    Object.values(intervalsRef.current).forEach(clearInterval);
    intervalsRef.current = {};

    // Setup refresh intervals for widgets that need auto-refresh
    widgets.forEach(widget => {
      if (widget.refresh_interval > 0) {
        intervalsRef.current[widget.id] = setInterval(() => {
          fetchWidgetData([widget]);
        }, widget.refresh_interval * 1000);
      }
    });

    // Cleanup intervals on unmount
    return () => {
      Object.values(intervalsRef.current).forEach(clearInterval);
    };
  }, [widgets, fetchWidgetData]);

  return { data, loading, errors, refresh, refreshAll };
}
