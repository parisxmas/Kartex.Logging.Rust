const API_BASE = '/api';

export interface User {
  username: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface LogEntry {
  _id: { $oid: string } | string;
  timestamp: string;
  level: string;
  service: string;
  message: string;
  source_ip: string;
  metadata?: Record<string, unknown>;
  trace_id?: string;
  span_id?: string;
}

export interface LogsResponse {
  logs: LogEntry[];
  count: number;
}

export interface Stats {
  total_count: number;
  counts_by_level: Record<string, number>;
  counts_by_service: Record<string, number>;
}

export interface RealtimeMetrics {
  logs_per_second: number;
  error_rate: number;
  errors_per_second: number;
  logs_last_minute: number;
}

export interface AlertRule {
  _id?: { $oid: string } | string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  action: AlertAction;
  last_triggered?: string;
  trigger_count?: number;
}

export interface AlertCondition {
  type: 'error_rate' | 'errors_per_second' | 'logs_per_second' | 'level_count';
  threshold: number;
  level?: string;
}

export interface AlertAction {
  type: 'webhook' | 'log';
  url?: string;
}

export interface TraceSummary {
  trace_id: string;
  root_span_name: string;
  service: string;
  duration_ms: number;
  span_count: number;
  error_count: number;
  status: string;
  start_time: string;
}

export interface TracesResponse {
  traces: TraceSummary[];
  count: number;
}

export interface Span {
  span_id: string;
  trace_id: string;
  parent_span_id?: string;
  name: string;
  service: string;
  kind: string;
  start_time_unix_nano: number;
  end_time_unix_nano: number;
  duration_ms: number;
  status?: { code: string; message?: string };
  attributes?: Record<string, unknown>;
  events?: Array<{ timestamp: string; name: string }>;
}

export interface TraceDetail {
  trace_id: string;
  spans: Span[];
  logs: LogEntry[];
}

// Dashboard types
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type WidgetType =
  | 'log_count'
  | 'error_rate_chart'
  | 'recent_logs'
  | 'trace_latency_histogram'
  | 'service_health'
  | 'custom_metric'
  | 'live_stream'
  | 'plugin';

export type PluginType = 'javascript' | 'wasm';

export type CustomMetricType =
  | 'logs_per_second'
  | 'errors_per_second'
  | 'error_rate'
  | 'logs_last_minute'
  | 'total_logs';

export interface WidgetConfigLogCount {
  type: 'log_count';
  level?: string;
  service?: string;
  time_range: number;
}

export interface WidgetConfigErrorRateChart {
  type: 'error_rate_chart';
  time_range: number;
  bucket_size: number;
  service?: string;
}

export interface WidgetConfigRecentLogs {
  type: 'recent_logs';
  limit: number;
  level?: string;
  service?: string;
}

export interface WidgetConfigTraceLatencyHistogram {
  type: 'trace_latency_histogram';
  time_range: number;
  service?: string;
  buckets: number;
}

export interface WidgetConfigServiceHealth {
  type: 'service_health';
  time_window: number;
  error_threshold: number;
}

export interface WidgetConfigCustomMetric {
  type: 'custom_metric';
  metric_type: CustomMetricType;
}

export interface WidgetConfigLiveStream {
  type: 'live_stream';
  max_logs: number;
  level?: string;
  service?: string;
  auto_scroll: boolean;
}

export interface WidgetConfigPlugin {
  type: 'plugin';
  url: string;
  plugin_type: PluginType;
  plugin_config?: Record<string, unknown>;
  realtime?: boolean;
  level?: string;
  service?: string;
}

export type WidgetConfig =
  | WidgetConfigLogCount
  | WidgetConfigErrorRateChart
  | WidgetConfigRecentLogs
  | WidgetConfigTraceLatencyHistogram
  | WidgetConfigServiceHealth
  | WidgetConfigCustomMetric
  | WidgetConfigLiveStream
  | WidgetConfigPlugin;

export interface Widget {
  id: string;
  widget_type: WidgetType;
  title: string;
  config: WidgetConfig;
  refresh_interval: number;
}

export interface Dashboard {
  _id?: { $oid: string } | string;
  user_id: string;
  name: string;
  is_default: boolean;
  layout: LayoutItem[];
  widgets: Widget[];
  created_at: string;
  updated_at: string;
}

export interface DashboardsResponse {
  dashboards: Dashboard[];
  count: number;
}

export interface CreateDashboardRequest {
  name: string;
  is_default?: boolean;
  layout?: LayoutItem[];
  widgets?: Widget[];
}

export interface UpdateDashboardRequest {
  name?: string;
  is_default?: boolean;
  layout?: LayoutItem[];
  widgets?: Widget[];
}

export interface WidgetDataQuery {
  widget_id: string;
  widget_type: WidgetType;
  config: WidgetConfig;
}

export interface WidgetDataItem {
  widget_id: string;
  data: unknown;
  error?: string;
}

export interface WidgetDataResponse {
  data: WidgetDataItem[];
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    // Handle empty responses (204 No Content or empty body)
    const contentLength = response.headers.get('content-length');
    if (response.status === 204 || contentLength === '0') {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text);
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async getLogs(params: {
    level?: string;
    service?: string;
    search?: string;
    regex?: boolean;
    regex_field?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
    skip?: number;
  } = {}): Promise<LogsResponse> {
    const searchParams = new URLSearchParams();
    if (params.level) searchParams.append('level', params.level);
    if (params.service) searchParams.append('service', params.service);
    if (params.search) searchParams.append('search', params.search);
    if (params.regex) searchParams.append('regex', 'true');
    if (params.regex_field) searchParams.append('regex_field', params.regex_field);
    if (params.start_time) searchParams.append('start_time', params.start_time);
    if (params.end_time) searchParams.append('end_time', params.end_time);
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.skip) searchParams.append('skip', params.skip.toString());

    return this.request<LogsResponse>(`/logs?${searchParams}`);
  }

  async getLogById(id: string): Promise<LogEntry> {
    return this.request<LogEntry>(`/logs/${id}`);
  }

  async getStats(): Promise<Stats> {
    return this.request<Stats>('/stats');
  }

  async getMetrics(): Promise<RealtimeMetrics> {
    return this.request<RealtimeMetrics>('/metrics');
  }

  async getAlerts(): Promise<AlertRule[]> {
    return this.request<AlertRule[]>('/alerts');
  }

  async getAlert(id: string): Promise<AlertRule> {
    return this.request<AlertRule>(`/alerts/${id}`);
  }

  async createAlert(alert: Omit<AlertRule, '_id' | 'last_triggered' | 'trigger_count'>): Promise<AlertRule> {
    return this.request<AlertRule>('/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    });
  }

  async updateAlert(id: string, alert: Omit<AlertRule, '_id' | 'last_triggered' | 'trigger_count'>): Promise<AlertRule> {
    return this.request<AlertRule>(`/alerts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(alert),
    });
  }

  async deleteAlert(id: string): Promise<void> {
    await this.request<void>(`/alerts/${id}`, { method: 'DELETE' });
  }

  async getTraces(params: {
    service?: string;
    status?: string;
    start_time?: string;
    limit?: number;
  } = {}): Promise<TracesResponse> {
    const searchParams = new URLSearchParams();
    if (params.service) searchParams.append('service', params.service);
    if (params.status) searchParams.append('status', params.status);
    if (params.start_time) searchParams.append('start_time', params.start_time);
    if (params.limit) searchParams.append('limit', params.limit.toString());

    return this.request<TracesResponse>(`/traces?${searchParams}`);
  }

  async getTraceById(traceId: string): Promise<TraceDetail> {
    return this.request<TraceDetail>(`/traces/${traceId}`);
  }

  async getTraceForLog(logId: string): Promise<TraceDetail> {
    return this.request<TraceDetail>(`/logs/${logId}/trace`);
  }

  // Dashboard methods
  async getDashboards(): Promise<DashboardsResponse> {
    return this.request<DashboardsResponse>('/dashboards');
  }

  async getDashboard(id: string): Promise<Dashboard> {
    return this.request<Dashboard>(`/dashboards/${id}`);
  }

  async getDefaultDashboard(): Promise<Dashboard> {
    return this.request<Dashboard>('/dashboards/default');
  }

  async createDashboard(dashboard: CreateDashboardRequest): Promise<{ id: string }> {
    return this.request<{ id: string }>('/dashboards', {
      method: 'POST',
      body: JSON.stringify(dashboard),
    });
  }

  async updateDashboard(id: string, updates: UpdateDashboardRequest): Promise<void> {
    await this.request<void>(`/dashboards/${id}/update`, {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }

  async deleteDashboard(id: string): Promise<void> {
    await this.request<void>(`/dashboards/${id}/delete`, { method: 'POST' });
  }

  async getWidgetData(widgets: WidgetDataQuery[]): Promise<WidgetDataResponse> {
    return this.request<WidgetDataResponse>('/widgets/data', {
      method: 'POST',
      body: JSON.stringify({ widgets }),
    });
  }
}

export const apiClient = new ApiClient();
