import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Search, X } from 'lucide-react';
import type { TableNodeData } from '../../../utils/graph/layoutEngine';
import type { ColumnDefinition } from './TableNode/ColumnRow';

export interface SearchResult {
  columnId: string;
  columnName: string;
  tableName: string;
  databaseName: string;
  dataType: string;
  matchScore: number;
}

export interface LineageGraphSearchProps {
  nodes: TableNodeData[];
  onSelect: (columnId: string) => void;
  maxResults?: number;
  placeholder?: string;
}

/**
 * Calculates match score for search ranking
 */
function calculateMatchScore(query: string, target: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  // Exact match
  if (lowerTarget === lowerQuery) {
    return 1.0;
  }

  // Starts with
  if (lowerTarget.startsWith(lowerQuery)) {
    return 0.8;
  }

  // Contains
  if (lowerTarget.includes(lowerQuery)) {
    return 0.5;
  }

  return 0;
}

/**
 * Extracts searchable columns from table nodes
 */
function extractSearchableColumns(nodes: TableNodeData[]): SearchResult[] {
  const columns: SearchResult[] = [];

  nodes.forEach((node) => {
    node.columns.forEach((column: ColumnDefinition) => {
      columns.push({
        columnId: column.id,
        columnName: column.name,
        tableName: node.tableName,
        databaseName: node.databaseName,
        dataType: column.dataType,
        matchScore: 0,
      });
    });
  });

  return columns;
}

/**
 * Searches and sorts results
 */
function searchColumns(
  query: string,
  columns: SearchResult[],
  maxResults: number
): SearchResult[] {
  if (!query || query.length < 2) {
    return [];
  }

  return columns
    .map((column) => {
      // Calculate match scores for different fields
      const columnScore = calculateMatchScore(query, column.columnName);
      const tableScore = calculateMatchScore(query, column.tableName) * 0.7;
      const fullNameScore =
        calculateMatchScore(
          query,
          `${column.databaseName}.${column.tableName}.${column.columnName}`
        ) * 0.9;

      const matchScore = Math.max(columnScore, tableScore, fullNameScore);

      return {
        ...column,
        matchScore,
      };
    })
    .filter((result) => result.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults);
}

export const LineageGraphSearch = memo(function LineageGraphSearch({
  nodes,
  onSelect,
  maxResults = 10,
  placeholder = 'Search columns...',
}: LineageGraphSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Extract searchable columns from nodes
  const searchableColumns = React.useMemo(
    () => extractSearchableColumns(nodes),
    [nodes]
  );

  // Search results
  const results = React.useMemo(
    () => searchColumns(query, searchableColumns, maxResults),
    [query, searchableColumns, maxResults]
  );

  // Open dropdown when there are results
  useEffect(() => {
    setIsOpen(results.length > 0);
    setSelectedIndex(0);
  }, [results.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const items = listRef.current.querySelectorAll('li');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex].columnId);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setQuery('');
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex]
  );

  // Handle selection
  const handleSelect = useCallback(
    (columnId: string) => {
      onSelect(columnId);
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [onSelect]
  );

  // Handle input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  // Handle clear
  const handleClear = useCallback(() => {
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  }, []);

  // Handle blur
  const handleBlur = useCallback(() => {
    // Delay closing to allow click on results
    setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, []);

  return (
    <div className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Search columns"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="search-results"
          role="combobox"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
            aria-label="Clear search"
          >
            <X className="w-3 h-3 text-slate-400" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <ul
          ref={listRef}
          id="search-results"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-auto"
        >
          {results.map((result, index) => (
            <li
              key={result.columnId}
              role="option"
              aria-selected={index === selectedIndex}
              className={`
                px-3 py-2 cursor-pointer flex items-center justify-between
                ${index === selectedIndex ? 'bg-blue-50' : 'hover:bg-slate-50'}
              `}
              onClick={() => handleSelect(result.columnId)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-slate-800 truncate">
                    {result.columnName}
                  </span>
                  <span className="text-xs text-slate-500 truncate">
                    {result.databaseName}.{result.tableName}
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                {result.dataType}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* No results message */}
      {isOpen && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-500">
          No columns found matching &quot;{query}&quot;
        </div>
      )}
    </div>
  );
});
