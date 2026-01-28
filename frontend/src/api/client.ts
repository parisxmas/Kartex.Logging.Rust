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

    return response.json();
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
    start_time?: string;
    limit?: number;
    skip?: number;
  } = {}): Promise<LogsResponse> {
    const searchParams = new URLSearchParams();
    if (params.level) searchParams.append('level', params.level);
    if (params.service) searchParams.append('service', params.service);
    if (params.search) searchParams.append('search', params.search);
    if (params.start_time) searchParams.append('start_time', params.start_time);
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
}

export const apiClient = new ApiClient();
