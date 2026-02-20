---
status: resolved
trigger: "White screen bug when navigating to localhost:3000/search?q=demo"
created: 2026-02-19T00:00:00Z
updated: 2026-02-19T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED - unifiedSearch in client.ts calls the wrong backend endpoint
test: Compared URL in client.ts across git history
expecting: N/A - root cause confirmed
next_action: Document fix

## Symptoms

expected: Search results page rendered at /search?q=demo
actual: Completely blank white screen
errors: TypeError: Cannot read properties of undefined (reading 'length') - on data.databases.length
reproduction: Navigate to localhost:3000/search?q=demo
started: Regression introduced in commit 6496af1 (feat(01-05): implement Impact Analysis frontend UI)

## Eliminated

- hypothesis: TypeScript build error causing crash
  evidence: npm run build completes successfully with no errors
  timestamp: 2026-02-19T00:05:00Z

- hypothesis: Phase 13 multi-select changes broke something
  evidence: Phase 13 changes are all in LineageGraph components not used by SearchPage; SearchPage is unchanged
  timestamp: 2026-02-19T00:06:00Z

- hypothesis: Missing route definition
  evidence: App.tsx has <Route path="/search" element={<SearchPage />} /> - route exists
  timestamp: 2026-02-19T00:04:00Z

- hypothesis: useStoreApi called outside ReactFlowProvider
  evidence: Only matters for tests (mock issue), not runtime - both lineage graph components wrap with ReactFlowProvider
  timestamp: 2026-02-19T00:07:00Z

## Evidence

- timestamp: 2026-02-19T00:04:00Z
  checked: App.tsx router config
  found: Route /search maps to SearchPage correctly
  implication: Routing is not the problem

- timestamp: 2026-02-19T00:05:00Z
  checked: npm run build output
  found: Build succeeds cleanly - 1732 modules, no TypeScript errors
  implication: No compile-time error; issue is runtime

- timestamp: 2026-02-19T00:06:00Z
  checked: lineage-ui/src/api/client.ts current HEAD
  found: unifiedSearch() calls '/api/v2/openlineage/datasets/search'
  implication: This is the WRONG endpoint for unified search

- timestamp: 2026-02-19T00:07:00Z
  checked: lineage-api/routes/openlineage.py
  found: TWO separate routes exist:
    - /datasets/search -> search_datasets() -> returns {datasets, query, count}
    - /search -> unified_search() -> returns {databases, datasets, query, totalCount, ...}
  implication: unifiedSearch in client.ts is hitting the wrong route

- timestamp: 2026-02-19T00:08:00Z
  checked: git show 63047c4:lineage-ui/src/api/client.ts
  found: In the working version, unifiedSearch called '/api/v2/openlineage/search' (correct endpoint)
  implication: The URL was changed in commit 6496af1

- timestamp: 2026-02-19T00:08:30Z
  checked: git show 6496af1:lineage-ui/src/api/client.ts
  found: unifiedSearch changed to call '/api/v2/openlineage/datasets/search' (wrong endpoint)
  implication: Commit 6496af1 "feat(01-05): implement Impact Analysis" introduced the regression

- timestamp: 2026-02-19T00:09:00Z
  checked: SearchPage.tsx render condition
  found: data && (data.databases.length > 0 || data.datasets.length > 0)
  implication: When /datasets/search returns {datasets, query, count} (no databases field),
    data.databases is undefined, data.databases.length throws TypeError.
    No ErrorBoundary wraps SearchPage so React renders white screen.

## Resolution

root_cause: |
  In lineage-ui/src/api/client.ts, the unifiedSearch() method was accidentally changed
  to call '/api/v2/openlineage/datasets/search' instead of '/api/v2/openlineage/search'.

  The /datasets/search endpoint returns DatasetSearchResponse {datasets, query, count}
  with NO 'databases' field. But SearchPage expects UnifiedSearchResponse {databases,
  datasets, query, totalCount, ...} from the /search endpoint.

  SearchPage renders: data.databases.length > 0 - this throws TypeError when
  data.databases is undefined (white screen since no ErrorBoundary).

  Regression introduced in commit 6496af1 (feat(01-05): implement Impact Analysis).

fix: |
  In lineage-ui/src/api/client.ts, change the unifiedSearch() URL from:
    '/api/v2/openlineage/datasets/search'
  to:
    '/api/v2/openlineage/search'

verification: Navigate to localhost:3000/search?q=demo and confirm search results appear
files_changed:
  - lineage-ui/src/api/client.ts
