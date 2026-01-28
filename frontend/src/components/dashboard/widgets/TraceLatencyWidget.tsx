import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { WidgetConfig } from '../../../api/client';

interface HistogramBucket {
  range: string;
  min: number;
  max: number;
  count: number;
}

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  total: number;
}

interface TraceLatencyData {
  histogram: HistogramBucket[];
  stats: LatencyStats;
}

interface TraceLatencyWidgetProps {
  data: unknown;
  config: WidgetConfig;
}

export default function TraceLatencyWidget({ data }: TraceLatencyWidgetProps) {
  const latencyData = data as TraceLatencyData | undefined;
  const histogram = latencyData?.histogram ?? [];
  const stats = latencyData?.stats;

  if (histogram.length === 0 || !stats) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        No trace data available
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
        <div className="bg-bg-tertiary rounded p-1.5 text-center">
          <div className="text-text-secondary">p50</div>
          <div className="font-mono text-accent">{stats.p50.toFixed(0)}ms</div>
        </div>
        <div className="bg-bg-tertiary rounded p-1.5 text-center">
          <div className="text-text-secondary">p95</div>
          <div className="font-mono text-warning">{stats.p95.toFixed(0)}ms</div>
        </div>
        <div className="bg-bg-tertiary rounded p-1.5 text-center">
          <div className="text-text-secondary">p99</div>
          <div className="font-mono text-error">{stats.p99.toFixed(0)}ms</div>
        </div>
      </div>

      {/* Histogram chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histogram} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="range"
              tick={{ fill: '#9ca3af', fontSize: 9 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value) => [String(value), 'Traces']}
            />
            <Bar
              dataKey="count"
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Total count */}
      <div className="text-xs text-text-secondary text-center mt-1">
        {stats.total} traces | avg: {stats.avg.toFixed(0)}ms
      </div>
    </div>
  );
}
