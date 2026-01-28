import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { WidgetConfig } from '../../../api/client';

interface ErrorRateDataPoint {
  timestamp: number;
  total: number;
  errors: number;
  error_rate: number;
}

interface ErrorRateData {
  data: ErrorRateDataPoint[];
}

interface ErrorRateWidgetProps {
  data: unknown;
  config: WidgetConfig;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function ErrorRateWidget({ data }: ErrorRateWidgetProps) {
  const chartData = data as ErrorRateData | undefined;
  const points = chartData?.data ?? [];

  if (points.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        No data available
      </div>
    );
  }

  // Format data for recharts
  const formattedData = points.map(point => ({
    time: formatTime(point.timestamp),
    timestamp: point.timestamp,
    errorRate: Math.round(point.error_rate * 10000) / 100, // Convert to percentage with 2 decimals
    errors: point.errors,
    total: point.total,
  }));

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formattedData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="errorRateGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            tickFormatter={(value) => `${value}%`}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(value, name) => {
              if (name === 'errorRate' && typeof value === 'number') {
                return [`${value.toFixed(2)}%`, 'Error Rate'];
              }
              return [String(value), name];
            }}
          />
          <Area
            type="monotone"
            dataKey="errorRate"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#errorRateGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#ef4444' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
