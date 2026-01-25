import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppShell } from './components/layout/AppShell';
import { ExplorePage } from './features/ExplorePage';
import { LineagePage } from './features/LineagePage';
import { DatabaseLineagePage } from './features/DatabaseLineagePage';
import { AllDatabasesLineagePage } from './features/AllDatabasesLineagePage';
import { ImpactPage } from './features/ImpactPage';
import { SearchPage } from './features/SearchPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<ExplorePage />} />
            <Route path="/lineage/all-databases" element={<AllDatabasesLineagePage />} />
            <Route path="/lineage/database/:databaseName" element={<DatabaseLineagePage />} />
            <Route path="/lineage/:assetId" element={<LineagePage />} />
            <Route path="/impact/:assetId" element={<ImpactPage />} />
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
