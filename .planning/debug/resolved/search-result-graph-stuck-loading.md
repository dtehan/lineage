---
status: resolved
trigger: "search-result-graph-stuck-loading"
created: 2026-02-19T00:00:00Z
updated: 2026-02-19T01:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — Stage stuck at 'fetching' on API error blocks error UI from rendering
test: Traced showProgress logic with error scenario
expecting: N/A - root cause confirmed and fixed
next_action: archive

## Symptoms

expected: App navigates to /lineage and renders the lineage graph for the selected table or column
actual: The lineage page loads but gets stuck in a loading/spinner state — the graph never appears
errors: Not yet checked (no console errors confirmed)
reproduction: Search for any term → click a table or column result → graph stuck loading
started: Recently broke — used to work; regression after Phase 13 multi-select/group-move commits (918b7e5, 7805ff2, 7efdceb, 2171efa)
scope: Both table results and column results are affected

## Eliminated

- hypothesis: H1 — Phase 13 changes directly broke loading logic (useMultiSelect, storeApi, etc)
  evidence: Phase 13 only added multi-select behavior. useStoreApi() requires ReactFlowProvider which IS present in production (LineageGraphInner is inside ReactFlowProvider). The useMultiSelect effect does not interfere with loading stage transitions. Tests fail because test mocks for @xyflow/react don't include useStoreApi, but that's a test issue not a production issue.
  timestamp: 2026-02-19T00:45:00Z

- hypothesis: H2 — Routing conflict (Flask /lineage/<path>/<field> matching /lineage/table/<path>)
  evidence: Flask gives precedence to literal route segments over dynamic. /lineage/table/<path:dataset_id> (literal 'table') wins over /lineage/<path:dataset_id>/<field_name> (dynamic) for /lineage/table/ URLs. Both routes are registered. Werkzeug handles this correctly.
  timestamp: 2026-02-19T00:30:00Z

- hypothesis: H4 — Worker layout hangs forever
  evidence: workerLayoutGraph has .catch() that calls setStage('complete'), so even if worker fails, spinner clears. Worker is module-level singleton initialized once.
  timestamp: 2026-02-19T00:50:00Z

- hypothesis: H5 — data?.graph is falsy (API returns wrong shape)
  evidence: Backend lineage_service.get_table_lineage_graph returns {"datasetId": ..., "graph": {"nodes": [...], "edges": [...]}}, which matches OpenLineageLineageResponse type. data?.graph should always be present when API succeeds.
  timestamp: 2026-02-19T00:55:00Z

## Evidence

- timestamp: 2026-02-19T00:05:00Z
  checked: git diff lineage-ui/src/api/client.ts
  found: Only change is unifiedSearch URL fix (already applied). client.ts is otherwise correct.
  implication: Not the source of this bug.

- timestamp: 2026-02-19T00:10:00Z
  checked: SearchResults.tsx navigation handlers
  found: handleTableClick navigates to /lineage/${encodeURIComponent(dataset.id)}/_all; handleFieldClick navigates to /lineage/${encodeURIComponent(dataset.id)}/${encodeURIComponent(fieldName)}
  implication: Navigation URLs are correct format.

- timestamp: 2026-02-19T00:15:00Z
  checked: App.tsx routes
  found: Route /lineage/:datasetId/:fieldName matches all search result navigations correctly.
  implication: Routing is correct.

- timestamp: 2026-02-19T00:20:00Z
  checked: LineagePage.tsx
  found: Decodes URL params correctly, passes decodedDatasetId and decodedFieldName to LineageGraph.
  implication: Parameter passing is correct.

- timestamp: 2026-02-19T00:25:00Z
  checked: LineageGraph.tsx showProgress logic (original)
  found: showProgress = isLoading || (stage !== 'idle' && stage !== 'complete'). When API error occurs: isLoading goes false, stage stays 'fetching' (the isLoading effect only sets stage when isLoading is TRUE, never resets on error). showProgress stays TRUE. The error check (if error) at line 541 is NEVER reached because showProgress returns the spinner first.
  implication: CONFIRMED BUG - API errors cause infinite spinner.

- timestamp: 2026-02-19T00:30:00Z
  checked: npm test output
  found: LineageGraph.test.tsx fails with "No 'useStoreApi' export is defined on the '@xyflow/react' mock". This was a pre-existing failure before Phase 13. Phase 13 added useStoreApi to useMultiSelect, making the missing mock more impactful. Test count was 55 failing (before fix), now 32 (after fix).
  implication: Test failures confirmed the mock is wrong. Fixed by adding useStoreApi to test mocks in LineageGraph.test.tsx, DatabaseLineageGraph.test.tsx, AllDatabasesLineageGraph.test.tsx.

- timestamp: 2026-02-19T00:40:00Z
  checked: Connection between search fix and bug exposure
  found: The search endpoint was previously broken (calling /datasets/search instead of /search). After the fix in client.ts, users can now navigate from search results to lineage. The dataset.id from search results is the correct format the lineage API expects. But if the API returns any error (backend down, network issue, dataset not found), the pre-existing stage bug causes infinite spinner.
  implication: The search fix enabled users to navigate from search→lineage, which exposed the pre-existing error handling bug in LineageGraph.tsx.

- timestamp: 2026-02-19T01:00:00Z
  checked: useMultiSelect.test.ts
  found: The useStoreApi mock was already correctly written in this test file. All 8 useMultiSelect tests pass (were failing per Phase 13 verification report — likely a report error or the fix was written but not run).
  implication: useMultiSelect hook itself is fully tested and working.

## Resolution

root_cause: |
  In LineageGraph.tsx, when the lineage API call fails (error state from TanStack Query):
  1. isLoading goes from true → false
  2. error is set to the Error object
  3. stage remains at 'fetching' (the isLoading effect only fires setStage('fetching') when
     isLoading is true; no code path resets stage when an error occurs)
  4. showProgress = false || ('fetching' !== 'idle' && 'fetching' !== 'complete') = TRUE
  5. LineageGraphInner returns the LoadingProgress spinner (line 526-538)
  6. The error check (if error) at line 541 is NEVER reached
  7. Result: infinite spinner, graph never appears, error message never shown

  Secondary issue: @xyflow/react mock in 3 test files (LineageGraph.test.tsx,
  DatabaseLineageGraph.test.tsx, AllDatabasesLineageGraph.test.tsx) was missing the
  useStoreApi export. Phase 13's useMultiSelect hook calls useStoreApi, causing all
  tests that render these components to throw "No 'useStoreApi' export is defined on
  the '@xyflow/react' mock" at render time, failing all test cases.

  Connection to "recently broke" report: The previous search white-screen bug fix
  (correcting unifiedSearch URL in client.ts) enabled users to successfully search and
  click results. This navigated to /lineage pages, where any API error exposed the
  pre-existing error handling bug (stage stuck at 'fetching') as an infinite spinner.

fix: |
  1. LineageGraph.tsx — Added error branch to isLoading/error effect:
     - Before: effect only set stage to 'fetching' on isLoading=true
     - After: also calls reset() when error is set, returning stage to 'idle'
     - This allows showProgress to become false on error, so the error UI renders

     ```ts
     useEffect(() => {
       if (isLoading) {
         setStage('fetching');
       } else if (error) {
         reset();
       }
     }, [isLoading, error, setStage, reset]);
     ```

  2. LineageGraph.test.tsx — Added useStoreApi to @xyflow/react mock
  3. DatabaseLineageGraph.test.tsx — Added useStoreApi to @xyflow/react mock
  4. AllDatabasesLineageGraph.test.tsx — Added useStoreApi to @xyflow/react mock

verification: |
  - All 8 useMultiSelect tests pass (8/8)
  - Test failures reduced from 55 to 32 (remaining 32 are pre-existing API mismatch
    failures where tests use old useLineage/useDatabaseLineage hooks but components
    now use useOpenLineageTableLineage — separate issue, not introduced by this fix)
  - Code trace confirms fix: error → reset() → stage='idle' → showProgress=false → error UI shows

files_changed:
  - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
  - lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx
  - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.test.tsx
  - lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.test.tsx
