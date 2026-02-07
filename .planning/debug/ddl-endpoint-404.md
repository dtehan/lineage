---
status: diagnosed
trigger: "DDL endpoint returns 404 errors instead of view SQL and table comments"
created: 2026-02-07T00:00:00Z
updated: 2026-02-07T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED - Same root cause as statistics endpoint 404: datasetId format mismatch between frontend node IDs and backend database IDs
test: Traced data flow through DetailPanel effectiveDatasetId computation to DDL API call; confirmed with statistics-endpoint-404 diagnosis
expecting: Node IDs use dataset "name" format (demo_user.TABLE) but DDL endpoint expects full dataset_id (namespace_hash/demo_user.TABLE)
next_action: Root cause documented, ready for fix

## Symptoms

expected: GET /api/v2/openlineage/datasets/{datasetId}/ddl returns JSON with viewSql, tableComment, sourceType
actual: Frontend shows "Failed to load DDL" with 404 error
errors: 404 Not Found on /ddl endpoint
reproduction: Click table node in lineage graph, open detail panel, click DDL tab
started: Phase 20 implementation

## Eliminated

- hypothesis: Flask routing conflict between <path:dataset_id> and <path:dataset_id>/ddl
  evidence: Tested with Flask test_client - Werkzeug correctly routes both patterns with slashes in dataset_id
  timestamp: 2026-02-07

- hypothesis: Chi router cannot handle %2F in URL parameters
  evidence: Tested directly with Chi httptest - {datasetId} correctly captures %2F-encoded values as single path segment
  timestamp: 2026-02-07

- hypothesis: Vite proxy decodes %2F to literal slash
  evidence: Node.js url.parse() preserves %2F encoding; http-proxy uses req.url which preserves encoding
  timestamp: 2026-02-07

- hypothesis: axios encodeURIComponent breaks URL pattern
  evidence: Verified axios request interceptor shows correct URL with %2F preserved in path
  timestamp: 2026-02-07

- hypothesis: DDL route not registered in backend
  evidence: Python server line 1787 has @app.route for /ddl; Go router.go line 61 has r.Get for /ddl; both properly registered
  timestamp: 2026-02-07

## Evidence

- timestamp: 2026-02-07
  checked: DDL route registration in both backends
  found: Python (line 1787): @app.route("/api/v2/openlineage/datasets/<path:dataset_id>/ddl"); Go (line 61): r.Get("/datasets/{datasetId}/ddl", olHandler.GetDatasetDDL)
  implication: Routes are properly registered in both backends

- timestamp: 2026-02-07
  checked: Database schema - OL_DATASET.dataset_id format
  found: dataset_id = "{namespace_hash}/{database}.{table}" (e.g., "a1b2c3d4e5f6a7b8/demo_user.customers")
  implication: The full dataset_id includes a 16-char MD5 namespace prefix with a slash separator

- timestamp: 2026-02-07
  checked: Python API lineage endpoints - node ID construction (line 2320, 2383-2384)
  found: Node IDs constructed as "{dataset_name}.{field_name}" (e.g., "demo_user.customers.customer_id"), using OL_DATASET.name not dataset_id
  implication: Node IDs omit the namespace prefix

- timestamp: 2026-02-07
  checked: DetailPanel.tsx effectiveDatasetId computation (line 97-99)
  found: When datasetId prop is not provided, computes by stripping last dot-segment from selectedColumns[0].id, yielding "demo_user.customers" (dataset name without namespace)
  implication: DDL API calls use dataset name instead of full dataset_id

- timestamp: 2026-02-07
  checked: Python DDL handler (line 1794-1799)
  found: Queries "SELECT source_type FROM OL_DATASET WHERE dataset_id = ?" with the value from URL
  implication: When value is "demo_user.customers" instead of "a1b2c3d4e5f6a7b8/demo_user.customers", query returns no rows -> 404

- timestamp: 2026-02-07
  checked: DatabaseLineageGraph DetailPanel invocation (line 510-517)
  found: Does NOT pass datasetId prop to DetailPanel
  implication: Primary trigger path - forces fallback to node ID-based computation

- timestamp: 2026-02-07
  checked: AllDatabasesLineageGraph DetailPanel invocation (line 656-663)
  found: Also does NOT pass datasetId prop to DetailPanel
  implication: Same bug affects all-databases view

- timestamp: 2026-02-07
  checked: LineageGraph DetailPanel invocation (line 654-662)
  found: DOES pass datasetId prop from URL parameters (contains full dataset_id from AssetBrowser navigation)
  implication: Column-level lineage view works IF navigated from AssetBrowser with correct dataset_id in URL

- timestamp: 2026-02-07
  checked: Existing statistics-endpoint-404 debug session
  found: Identical root cause already diagnosed and documented
  implication: Same fix will resolve both DDL and statistics 404 issues

## Resolution

root_cause: The DetailPanel computes effectiveDatasetId by stripping the column name from lineage node IDs (format "database.table.column" -> "database.table"). This "database.table" value is the OL_DATASET.name, NOT the OL_DATASET.dataset_id. The DDL endpoint queries OL_DATASET WHERE dataset_id = ? using this name value, but dataset_id has the format "namespace_hash/database.table" (e.g., "a1b2c3d4e5f6a7b8/demo_user.customers"). The query returns no rows, causing a 404.

This is identical to the statistics endpoint 404 issue (same root cause, same code path).

fix: Two possible approaches:
  1. (Backend - simpler) Modify DDL and statistics endpoints to accept dataset name as fallback lookup: WHERE dataset_id = ? OR "name" = ?
  2. (Frontend - more complete) Ensure DetailPanel always receives the correct full datasetId by:
     a. Passing datasetId prop from DatabaseLineageGraph and AllDatabasesLineageGraph
     b. Including full dataset_id in lineage response node metadata so effectiveDatasetId can be computed correctly

verification:
files_changed: []
