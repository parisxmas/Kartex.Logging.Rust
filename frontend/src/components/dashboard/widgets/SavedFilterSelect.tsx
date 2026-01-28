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

  const loadSavedQueries = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const queries = JSON.parse(stored);
        console.log('SavedFilterSelect: Loaded queries', queries);
        setSavedQueries(queries);
      }
    } catch (e) {
      console.error('Failed to load saved queries:', e);
    }
  };

  useEffect(() => {
    loadSavedQueries();

    // Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setSavedQueries(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Failed to parse storage change:', err);
        }
      }
    };

    // Listen for custom event from same tab
    const handleCustomEvent = () => {
      loadSavedQueries();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('kartex-queries-updated', handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('kartex-queries-updated', handleCustomEvent);
    };
  }, []);

  const handleChange = (value: string) => {
    setSelectedFilter(value);

    if (!value) {
      onFilterChange(null);
      return;
    }

    const query = savedQueries.find(q => q.name === value);
    if (!query) {
      console.log('SavedFilterSelect: Query not found:', value);
      onFilterChange(null);
      return;
    }

    console.log('SavedFilterSelect: Found query', query);

    // Extract level, service, and message from conditions
    const filter: FilterSelection = {};

    for (const condition of query.conditions) {
      console.log('SavedFilterSelect: Processing condition', condition);
      // For level - accept any operator (equals, contains, etc.)
      if (condition.field === 'level' && condition.value) {
        filter.level = condition.value;
      }
      // For service - accept any operator
      if (condition.field === 'service' && condition.value) {
        filter.service = condition.value;
      }
      // For message - use as search text
      if (condition.field === 'message' && condition.value) {
        filter.search = condition.value;
      }
    }

    console.log('SavedFilterSelect: Final filter', filter);
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
