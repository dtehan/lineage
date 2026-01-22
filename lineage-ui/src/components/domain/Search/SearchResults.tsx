import { useNavigate } from 'react-router-dom';
import { Database, Table, Columns } from 'lucide-react';
import type { SearchResult } from '../../../types';

interface SearchResultsProps {
  results: SearchResult[];
  total: number;
}

const typeIcons = {
  database: Database,
  table: Table,
  column: Columns,
};

const typeColors = {
  database: 'text-blue-500',
  table: 'text-green-500',
  column: 'text-purple-500',
};

export function SearchResults({ results, total }: SearchResultsProps) {
  const navigate = useNavigate();

  const handleResultClick = (result: SearchResult) => {
    navigate(`/lineage/${encodeURIComponent(result.id)}`);
  };

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No results found
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">{total} results found</p>
      <ul className="space-y-2">
        {results.map((result) => {
          const Icon = typeIcons[result.type];
          return (
            <li key={result.id}>
              <button
                onClick={() => handleResultClick(result)}
                className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-left"
              >
                <Icon className={`w-5 h-5 ${typeColors[result.type]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {result.columnName || result.tableName || result.databaseName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {result.databaseName}
                    {result.tableName && `.${result.tableName}`}
                    {result.columnName && `.${result.columnName}`}
                  </p>
                </div>
                <span className="text-xs text-slate-400 capitalize">
                  {result.type}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
