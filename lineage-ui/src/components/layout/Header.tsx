import { useState } from 'react';
import { Menu, Search, Home, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../../stores/useUIStore';
import { openLineageApi } from '../../api/client';
import { Tooltip } from '../common/Tooltip';

export function Header() {
  const { toggleSidebar, searchQuery, setSearchQuery } = useUIStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isReloading, setIsReloading] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleReloadGraph = async () => {
    setIsReloading(true);
    try {
      await openLineageApi.reloadGraph();
      // Invalidate all TanStack Query caches so next navigation fetches fresh data
      queryClient.invalidateQueries();
    } catch (err) {
      console.error('Failed to reload graph:', err);
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4">
      <button
        onClick={() => navigate('/')}
        className="p-2 rounded hover:bg-slate-100"
        aria-label="Go to home page"
      >
        <Home className="w-5 h-5 text-slate-600" />
      </button>
      <button
        onClick={toggleSidebar}
        className="p-2 rounded hover:bg-slate-100"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>

      <form onSubmit={handleSearch} className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search databases, tables, columns..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </form>

      <h1 className="text-lg font-semibold text-slate-800">Data Lineage</h1>

      <Tooltip content="Reload lineage data from database" position="bottom">
        <button
          onClick={handleReloadGraph}
          disabled={isReloading}
          className="p-2 rounded hover:bg-slate-100 disabled:opacity-50 transition-colors"
          aria-label="Reload lineage data from database"
          data-testid="reload-graph-btn"
        >
          <RefreshCw className={`w-5 h-5 text-slate-600 ${isReloading ? 'animate-spin' : ''}`} />
        </button>
      </Tooltip>
    </header>
  );
}
