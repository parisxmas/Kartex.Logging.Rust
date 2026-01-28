import { WidgetConfig } from '../../../api/client';

interface LogCountData {
  count: number;
}

interface LogCountWidgetProps {
  data: unknown;
  config: WidgetConfig;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export default function LogCountWidget({ data, config }: LogCountWidgetProps) {
  const countData = data as LogCountData | undefined;
  const count = countData?.count ?? 0;

  // Determine color based on config
  const isErrorCount = config.type === 'log_count' && config.level?.toUpperCase() === 'ERROR';
  const colorClass = isErrorCount ? 'text-error' : 'text-accent';

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className={`text-4xl font-bold ${colorClass}`}>
        {formatNumber(count)}
      </div>
      <div className="text-sm text-text-secondary mt-1">
        {config.type === 'log_count' && (
          <>
            {config.level && <span className="capitalize">{config.level.toLowerCase()} </span>}
            logs
            {config.time_range > 0 && (
              <span className="text-xs ml-1">
                ({formatTimeRange(config.time_range)})
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatTimeRange(seconds: number): string {
  if (seconds >= 86400) {
    return `${Math.round(seconds / 86400)}d`;
  }
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)}h`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)}m`;
  }
  return `${seconds}s`;
}
