import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearch } from '../api/hooks/useSearch';
import { SearchBar } from '../components/domain/Search/SearchBar';
import { SearchResults } from '../components/domain/Search/SearchResults';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  const { data, isLoading } = useSearch({ query });

  useEffect(() => {
    if (query) {
      setSearchParams({ q: query });
    } else {
      setSearchParams({});
    }
  }, [query, setSearchParams]);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Search Assets</h1>

        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search databases, tables, columns..."
        />

        <div className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : data ? (
            <SearchResults results={data.results} total={data.total} />
          ) : query.length >= 2 ? (
            <div className="text-center py-8 text-slate-500">
              No results found
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              Enter at least 2 characters to search
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
