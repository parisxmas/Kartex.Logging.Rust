import { useState, useEffect } from 'react';

interface SavedQuery {
  name: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: string;
  }>;
  timePreset: string;
  customStartTime: string;
  customEndTime: string;
  createdAt: string;
}

export interface FilterSelection {
  level?: string;
  service?: string;
  search?: string;
}

interface SavedFilterSelectProps {
  onFilterChange: (filter: FilterSelection | null) => void;
  compact?: boolean;
}

const STORAGE_KEY = 'kartex_saved_queries';

export default function SavedFilterSelect({ onFilterChange, compact = false }: SavedFilterSelectProps) {
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedQueries(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load saved queries:', e);
    }

    // Listen for storage changes from other tabs/components
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setSavedQueries(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Failed to parse storage change:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleChange = (value: string) => {
    setSelectedFilter(value);

    if (!value) {
      onFilterChange(null);
      return;
    }

    const query = savedQueries.find(q => q.name === value);
    if (!query) {
      onFilterChange(null);
      return;
    }

    // Extract level and service from conditions
    const filter: FilterSelection = {};

    for (const condition of query.conditions) {
      if (condition.field === 'level' && condition.operator === 'equals' && condition.value) {
        filter.level = condition.value;
      }
      if (condition.field === 'service' && condition.operator === 'equals' && condition.value) {
        filter.service = condition.value;
      }
      if (condition.field === 'message' && condition.value) {
        filter.search = condition.value;
      }
    }

    onFilterChange(filter);
  };

  if (savedQueries.length === 0) {
    return null;
  }

  return (
    <select
      value={selectedFilter}
      onChange={(e) => handleChange(e.target.value)}
      className={`bg-bg-tertiary border border-border rounded focus:outline-none focus:border-accent ${
        compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
      }`}
      title="Apply saved filter"
    >
      <option value="">No filter</option>
      {savedQueries.map((query) => (
        <option key={query.name} value={query.name}>
          {query.name}
        </option>
      ))}
    </select>
  );
}
