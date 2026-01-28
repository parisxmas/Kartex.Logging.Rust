import { WidgetConfig } from '../../../api/client';

interface ServiceStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  error_rate: number;
  total_logs: number;
  error_count: number;
}

interface ServiceHealthData {
  services: ServiceStatus[];
}

interface ServiceHealthWidgetProps {
  data: unknown;
  config: WidgetConfig;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'bg-success';
    case 'degraded':
      return 'bg-warning';
    case 'unhealthy':
      return 'bg-error';
    default:
      return 'bg-gray-500';
  }
}

function getStatusBgColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'bg-success/10 border-success/30';
    case 'degraded':
      return 'bg-warning/10 border-warning/30';
    case 'unhealthy':
      return 'bg-error/10 border-error/30';
    default:
      return 'bg-gray-500/10 border-gray-500/30';
  }
}

export default function ServiceHealthWidget({ data }: ServiceHealthWidgetProps) {
  const healthData = data as ServiceHealthData | undefined;
  const services = healthData?.services ?? [];

  if (services.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        No services found
      </div>
    );
  }

  // Sort services: unhealthy first, then degraded, then healthy
  const sortedServices = [...services].sort((a, b) => {
    const order: Record<string, number> = { unhealthy: 0, degraded: 1, healthy: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-2 gap-2">
        {sortedServices.map((service) => (
          <div
            key={service.service}
            className={`p-2 rounded border ${getStatusBgColor(service.status)}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${getStatusColor(service.status)}`} />
              <span className="text-sm font-medium truncate" title={service.service}>
                {service.service}
              </span>
            </div>
            <div className="text-xs text-text-secondary">
              <span className="font-mono">
                {(service.error_rate * 100).toFixed(1)}%
              </span>
              {' error rate'}
            </div>
            <div className="text-xs text-text-secondary">
              {service.error_count}/{service.total_logs} errors
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
