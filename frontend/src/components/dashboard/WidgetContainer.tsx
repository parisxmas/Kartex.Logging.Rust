import { ReactNode } from 'react';
import { Widget } from '../../api/client';
import LogCountWidget from './widgets/LogCountWidget';
import ErrorRateWidget from './widgets/ErrorRateWidget';
import RecentLogsWidget from './widgets/RecentLogsWidget';
import TraceLatencyWidget from './widgets/TraceLatencyWidget';
import ServiceHealthWidget from './widgets/ServiceHealthWidget';
import CustomMetricWidget from './widgets/CustomMetricWidget';

interface WidgetContainerProps {
  widget: Widget;
  data: unknown;
  isLoading: boolean;
  error?: string;
  isEditMode: boolean;
  onRefresh: () => void;
  onConfigure: () => void;
  onRemove: () => void;
}

export default function WidgetContainer({
  widget,
  data,
  isLoading,
  error,
  isEditMode,
  onRefresh,
  onConfigure,
  onRemove,
}: WidgetContainerProps) {
  const renderWidget = (): ReactNode => {
    if (error) {
      return (
        <div className="flex items-center justify-center h-full text-error text-sm">
          <span>{error}</span>
        </div>
      );
    }

    if (isLoading && !data) {
      return (
        <div className="flex items-center justify-center h-full text-text-secondary">
          <div className="animate-pulse">Loading...</div>
        </div>
      );
    }

    switch (widget.widget_type) {
      case 'log_count':
        return <LogCountWidget data={data} config={widget.config} />;
      case 'error_rate_chart':
        return <ErrorRateWidget data={data} config={widget.config} />;
      case 'recent_logs':
        return <RecentLogsWidget data={data} config={widget.config} />;
      case 'trace_latency_histogram':
        return <TraceLatencyWidget data={data} config={widget.config} />;
      case 'service_health':
        return <ServiceHealthWidget data={data} config={widget.config} />;
      case 'custom_metric':
        return <CustomMetricWidget data={data} config={widget.config} />;
      default:
        return <div className="text-text-secondary">Unknown widget type</div>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-tertiary">
        <div className="flex items-center gap-2">
          {isEditMode && (
            <span className="drag-handle cursor-move text-text-secondary hover:text-text-primary">
              ⋮⋮
            </span>
          )}
          <h3 className="text-sm font-medium truncate">{widget.title}</h3>
          {isLoading && data !== undefined && (
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {isEditMode && (
            <>
              <button
                onClick={onConfigure}
                className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                title="Configure"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={onRemove}
                className="p-1 text-text-secondary hover:text-error transition-colors"
                title="Remove"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 overflow-hidden">
        {renderWidget()}
      </div>
    </div>
  );
}
