import { useState, useEffect } from 'react';

export interface QueryCondition {
  id: string;
  field: 'level' | 'service' | 'message' | 'exception' | 'trace_id';
  operator: 'equals' | 'contains' | 'regex' | 'not_equals' | 'not_contains';
  value: string;
}

export interface QueryBuilderFilters {
  level?: string;
  service?: string;
  search?: string;
  regex?: boolean;
  regex_field?: string;
  start_time?: string;
  end_time?: string;
}

interface QueryBuilderProps {
  onFiltersChange: (filters: QueryBuilderFilters) => void;
}

const FIELDS = [
  { value: 'level', label: 'Level' },
  { value: 'service', label: 'Service' },
  { value: 'message', label: 'Message' },
  { value: 'exception', label: 'Exception' },
  { value: 'trace_id', label: 'Trace ID' },
];

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'regex', label: 'matches regex' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'not_contains', label: 'not contains' },
];

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

const TIME_PRESETS = [
  { value: '', label: 'Custom' },
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last 1 hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

let conditionIdCounter = 0;

export default function QueryBuilder({ onFiltersChange }: QueryBuilderProps) {
  const [conditions, setConditions] = useState<QueryCondition[]>([]);
  const [timePreset, setTimePreset] = useState('24h');
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');

  // Generate filters from conditions
  useEffect(() => {
    const filters: QueryBuilderFilters = {};

    // Handle time range
    if (timePreset) {
      const now = new Date();
      let startTime: Date | null = null;

      switch (timePreset) {
        case '15m':
          startTime = new Date(now.getTime() - 15 * 60 * 1000);
          break;
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '6h':
          startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      if (startTime) {
        filters.start_time = startTime.toISOString();
      }
    } else {
      if (customStartTime) {
        filters.start_time = new Date(customStartTime).toISOString();
      }
      if (customEndTime) {
        filters.end_time = new Date(customEndTime).toISOString();
      }
    }

    // Process conditions
    for (const condition of conditions) {
      if (!condition.value) continue;

      switch (condition.field) {
        case 'level':
          if (condition.operator === 'equals') {
            filters.level = condition.value;
          }
          break;
        case 'service':
          if (condition.operator === 'equals') {
            filters.service = condition.value;
          } else if (condition.operator === 'contains' || condition.operator === 'regex') {
            filters.search = condition.value;
            filters.regex = condition.operator === 'regex';
            filters.regex_field = 'service';
          }
          break;
        case 'message':
          if (condition.operator === 'contains') {
            filters.search = condition.value;
            filters.regex = false;
          } else if (condition.operator === 'regex') {
            filters.search = condition.value;
            filters.regex = true;
            filters.regex_field = 'message';
          }
          break;
        case 'exception':
          if (condition.operator === 'contains' || condition.operator === 'regex') {
            filters.search = condition.value;
            filters.regex = condition.operator === 'regex';
            filters.regex_field = 'exception';
          }
          break;
        case 'trace_id':
          // For trace_id, we'd need backend support - for now use service field
          filters.search = condition.value;
          break;
      }
    }

    onFiltersChange(filters);
  }, [conditions, timePreset, customStartTime, customEndTime, onFiltersChange]);

  const addCondition = () => {
    const newCondition: QueryCondition = {
      id: `condition-${++conditionIdCounter}`,
      field: 'message',
      operator: 'contains',
      value: '',
    };
    setConditions([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<QueryCondition>) => {
    setConditions(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const clearAll = () => {
    setConditions([]);
    setTimePreset('24h');
    setCustomStartTime('');
    setCustomEndTime('');
  };

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-text-primary">Query Builder</h3>
        <div className="flex gap-2">
          <button
            onClick={clearAll}
            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Time Range */}
      <div className="mb-4 p-3 bg-bg-tertiary rounded-lg">
        <label className="block text-sm text-text-secondary mb-2">Time Range</label>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={timePreset}
            onChange={(e) => setTimePreset(e.target.value)}
            className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent"
          >
            {TIME_PRESETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {!timePreset && (
            <>
              <input
                type="datetime-local"
                value={customStartTime}
                onChange={(e) => setCustomStartTime(e.target.value)}
                className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent"
                placeholder="Start time"
              />
              <span className="text-text-secondary">to</span>
              <input
                type="datetime-local"
                value={customEndTime}
                onChange={(e) => setCustomEndTime(e.target.value)}
                className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent"
                placeholder="End time"
              />
            </>
          )}
        </div>
      </div>

      {/* Conditions */}
      <div className="space-y-2 mb-4">
        {conditions.map((condition, index) => (
          <div
            key={condition.id}
            className="flex flex-wrap items-center gap-2 p-3 bg-bg-tertiary rounded-lg"
          >
            {index > 0 && (
              <span className="text-xs text-accent font-medium px-2">AND</span>
            )}

            {/* Field */}
            <select
              value={condition.field}
              onChange={(e) =>
                updateCondition(condition.id, {
                  field: e.target.value as QueryCondition['field'],
                  value: '', // Reset value when field changes
                })
              }
              className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent"
            >
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Operator */}
            <select
              value={condition.operator}
              onChange={(e) =>
                updateCondition(condition.id, {
                  operator: e.target.value as QueryCondition['operator'],
                })
              }
              className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent"
            >
              {OPERATORS.filter((op) => {
                // Filter operators based on field
                if (condition.field === 'level') {
                  return op.value === 'equals' || op.value === 'not_equals';
                }
                return true;
              }).map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value */}
            {condition.field === 'level' ? (
              <select
                value={condition.value}
                onChange={(e) =>
                  updateCondition(condition.id, { value: e.target.value })
                }
                className="flex-1 min-w-[120px] px-3 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Select level...</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={condition.value}
                onChange={(e) =>
                  updateCondition(condition.id, { value: e.target.value })
                }
                placeholder={
                  condition.operator === 'regex'
                    ? 'Enter regex pattern...'
                    : 'Enter value...'
                }
                className="flex-1 min-w-[200px] px-3 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent font-mono"
              />
            )}

            {/* Remove button */}
            <button
              onClick={() => removeCondition(condition.id)}
              className="p-1.5 text-text-secondary hover:text-error transition-colors"
              title="Remove condition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add Condition Button */}
      <button
        onClick={addCondition}
        className="flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-accent/10 rounded transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Condition
      </button>

      {/* Regex Help */}
      {conditions.some((c) => c.operator === 'regex') && (
        <div className="mt-4 p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm">
          <div className="font-medium text-accent mb-1">Regex Tips</div>
          <ul className="text-text-secondary space-y-1">
            <li><code className="text-accent">.*</code> - Match any characters</li>
            <li><code className="text-accent">^error</code> - Starts with "error"</li>
            <li><code className="text-accent">timeout$</code> - Ends with "timeout"</li>
            <li><code className="text-accent">[0-9]+</code> - One or more digits</li>
            <li><code className="text-accent">error|warning</code> - Match "error" or "warning"</li>
          </ul>
        </div>
      )}
    </div>
  );
}
