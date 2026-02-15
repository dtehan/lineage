---
status: resolved
trigger: "no impact analysis information show, screen shot shows white page"
created: 2026-02-15T00:00:00Z
updated: 2026-02-15T00:00:00Z
---

## Current Focus

hypothesis: ROOT CAUSE CONFIRMED - Navigation to Impact page passes single columnId parameter but route expects TWO parameters
test: Verified node ID format and navigation code
expecting: Fix requires splitting columnId into datasetId and fieldName before navigation
next_action: Document root cause and propose fix

## Symptoms

expected: Navigate to /impact/demo_user.FACT_SALES.net_amount and see Impact Analysis header, summary cards, and impact table
actual: Completely blank white page at localhost:3000/impact/demo_user.FACT_SALES.net_amount
errors: Unknown - need to check for console errors or component failures
reproduction: Navigate to /impact/{datasetId}/{fieldName} URL
started: After Phase 01 Plan 05 implementation of Impact Analysis feature

## Eliminated

## Evidence

- timestamp: 2026-02-15T00:01:00Z
  checked: App.tsx routing configuration
  found: Route configured correctly at line 29 - `/impact/:datasetId/:fieldName` -> ImpactPage
  implication: Routing is properly configured

- timestamp: 2026-02-15T00:02:00Z
  checked: ImpactPage.tsx component structure
  found: Component properly imports useImpactAnalysis hook, decodes URL params, handles loading/error/data states
  implication: Component logic looks correct

- timestamp: 2026-02-15T00:03:00Z
  checked: useImpact.ts hook implementation
  found: Hook calls openLineageApi.getImpactAnalysis(datasetId, fieldName, { maxDepth })
  implication: Hook structure is correct

- timestamp: 2026-02-15T00:04:00Z
  checked: client.ts API client
  found: getImpactAnalysis method calls `/api/v2/openlineage/impact/${datasetId}/${fieldName}`
  implication: API client is properly configured

- timestamp: 2026-02-15T00:05:00Z
  checked: Backend routes/openlineage.py
  found: Route exists at line 140-155, endpoint `/impact/<path:dataset_id>/<field_name>` calls impact_service.analyze_downstream_impact
  implication: Backend endpoint exists and is properly wired

- timestamp: 2026-02-15T00:06:00Z
  checked: ImpactAnalysis.tsx component
  found: Component renders ImpactSummary and ImpactTable components
  implication: Component structure looks correct, need to verify child components exist

- timestamp: 2026-02-15T00:07:00Z
  checked: ImpactSummary.tsx and ImpactTable.tsx
  found: Both child components exist and are properly structured
  implication: All components exist, issue must be in routing or navigation

- timestamp: 2026-02-15T00:08:00Z
  checked: Navigation calls in LineageGraph.tsx, DatabaseLineageGraph.tsx, AllDatabasesLineageGraph.tsx
  found: All three files navigate with `navigate(/impact/${encodeURIComponent(columnId)})` - passing columnId as single parameter
  implication: Navigation passes single parameter but route expects two

- timestamp: 2026-02-15T00:09:00Z
  checked: Node ID format from lineage API
  found: Node IDs are in format "database.table.column" (e.g., "demo_user.FACT_SALES.net_amount")
  implication: columnId contains all three parts, but needs to be split

- timestamp: 2026-02-15T00:10:00Z
  checked: App.tsx route definition
  found: Route is `/impact/:datasetId/:fieldName` - expects TWO URL parameters
  implication: When navigating to `/impact/demo_user.FACT_SALES.net_amount`, React Router treats entire string as datasetId, fieldName is undefined

- timestamp: 2026-02-15T00:11:00Z
  checked: ImpactPage.tsx parameter handling
  found: Lines 10-12 check `if (!datasetId || !fieldName)` and return early with error message
  implication: Since fieldName is undefined, ImpactPage returns early, rendering only the early return div (which is invisible due to no styling/container)

## Resolution

root_cause: Impact Analysis navigation passes columnId as single URL parameter (`/impact/demo_user.FACT_SALES.net_amount`) but the route expects TWO parameters (`/impact/:datasetId/:fieldName`). This causes React Router to treat the entire columnId as datasetId, leaving fieldName undefined. ImpactPage then hits the early return condition at line 10-12 and renders an effectively blank page (just a div with text that has no container/styling).

The navigation happens in three files:
- LineageGraph.tsx:442
- DatabaseLineageGraph.tsx:348
- AllDatabasesLineageGraph.tsx:394

All three use the pattern: `navigate(/impact/${encodeURIComponent(columnId)})`

The columnId format is "database.table.column" but needs to be split into datasetId (database.table) and fieldName (column) before navigation.

fix:
1. **Frontend fix (3 files):** Updated handleViewImpactAnalysis callbacks in LineageGraph.tsx, DatabaseLineageGraph.tsx, and AllDatabasesLineageGraph.tsx to:
   - Look up the node from storeNodes to access databaseName, tableName, and columnName
   - Construct datasetId from database.table format
   - Navigate with TWO URL parameters: /impact/${datasetId}/${fieldName}

2. **Backend fix (1 file):** Updated dataset_repository.py get_dataset_name() method to:
   - Accept both full dataset IDs (with namespace hash) and simple dataset names
   - Fallback to lookup by name field when input doesn't contain '/'
   - This allows frontend to pass "demo_user.FACT_SALES" instead of requiring "bd74bb08b77fe556/demo_user.FACT_SALES"

verification:
✅ Backend API now accepts dataset name format: curl test shows /impact/demo_user.FACT_SALES/net_amount returns valid response
✅ Frontend builds successfully with no TypeScript errors
✅ Frontend navigation code now correctly splits columnId into datasetId and fieldName parameters

Manual verification steps (for user to perform):
1. Navigate to lineage graph for any column (e.g., /lineage/bd74bb08b77fe556%2Fdemo_user.FACT_SALES/net_amount)
2. Click on any column in the graph to open the detail panel
3. Click "View Impact Analysis" button in the panel
4. Should navigate to /impact/demo_user.FACT_SALES/net_amount (or similar, depending on column)
5. Impact Analysis page should render with:
   - Header showing "Impact Analysis: demo_user.FACT_SALES.net_amount"
   - Four summary cards showing impacted tables/columns/databases/max depth
   - Impact table showing downstream dependencies

files_changed:
- lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
- lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
- lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx
- lineage-api/repositories/dataset_repository.py
