import { WidgetConfig, CustomMetricType } from '../../../api/client';

interface CustomMetricData {
  metric_type: CustomMetricType;
  value: number;
}

interface CustomMetricWidgetProps {
  data: unknown;
  config: WidgetConfig;
}

function formatMetricValue(value: number, metricType: CustomMetricType): string {
  switch (metricType) {
    case 'error_rate':
      return `${(value * 100).toFixed(1)}%`;
    case 'logs_per_second':
    case 'errors_per_second':
      return value.toFixed(2);
    case 'logs_last_minute':
    case 'total_logs':
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
      }
      if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
      }
      return Math.round(value).toString();
    default:
      return value.toFixed(2);
  }
}

function getMetricLabel(metricType: CustomMetricType): string {
  switch (metricType) {
    case 'logs_per_second':
      return 'Logs/sec';
    case 'errors_per_second':
      return 'Errors/sec';
    case 'error_rate':
      return 'Error Rate';
    case 'logs_last_minute':
      return 'Logs (1m)';
    case 'total_logs':
      return 'Total Logs';
    default:
      return metricType;
  }
}

function getMetricColor(metricType: CustomMetricType): string {
  switch (metricType) {
    case 'errors_per_second':
    case 'error_rate':
      return 'text-error';
    default:
      return 'text-accent';
  }
}

export default function CustomMetricWidget({ data, config }: CustomMetricWidgetProps) {
  const metricData = data as CustomMetricData | undefined;
  const value = metricData?.value ?? 0;

  if (config.type !== 'custom_metric') {
    return null;
  }

  const metricType = config.metric_type;

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className={`text-3xl font-bold ${getMetricColor(metricType)}`}>
        {formatMetricValue(value, metricType)}
      </div>
      <div className="text-sm text-text-secondary mt-1">
        {getMetricLabel(metricType)}
      </div>
    </div>
  );
}
