---
status: diagnosed
trigger: "Statistics endpoint returning 404 errors instead of table metadata"
created: 2026-02-07T00:00:00Z
updated: 2026-02-07T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - datasetId format mismatch between frontend node IDs and backend database IDs
test: Traced data flow from API response node IDs through DetailPanel effectiveDatasetId computation to statistics API call
expecting: Node IDs use dataset "name" format (demo_user.customers) but backend expects full dataset_id (namespace_hash/demo_user.customers)
next_action: Root cause documented, ready for fix

## Symptoms

expected: GET /api/v2/openlineage/datasets/{datasetId}/statistics returns JSON with rowCount, sizeBytes, owner, createdAt, modifiedAt, sourceType
actual: 404 error, "Failed to load statistics" in UI
errors: 404 Not Found on statistics endpoint
reproduction: Click on table details -> statistics option in UI (especially from database-level lineage view)
started: Phase 20 implementation (new endpoints)

## Eliminated

- hypothesis: Flask routing conflict between <path:dataset_id> and <path:dataset_id>/statistics
  evidence: Verified with Flask test_client that Werkzeug correctly routes both patterns, even with slashes in dataset_id
  timestamp: 2026-02-07

- hypothesis: Vite proxy misconfiguration dropping or mangling encoded slashes
  evidence: Proxy config is straightforward (/api -> localhost:8080); Flask correctly handles %2F in paths
  timestamp: 2026-02-07

- hypothesis: encodeURIComponent encoding breaks the URL pattern
  evidence: Flask test_client confirms %2F is decoded before route matching; <path:> converter handles it correctly
  timestamp: 2026-02-07

## Evidence

- timestamp: 2026-02-07
  checked: Database schema - OL_DATASET.dataset_id format
  found: dataset_id = "{namespace_hash}/{database}.{table}" (e.g., "a1b2c3d4/demo_user.customers")
  implication: The full dataset_id includes a namespace prefix with a slash separator

- timestamp: 2026-02-07
  checked: Python API lineage endpoints - node ID construction
  found: All lineage endpoints construct node IDs as "{dataset_name}.{field_name}" (e.g., "demo_user.customers.customer_id"), NOT using the full dataset_id
  implication: Node IDs omit the namespace prefix, using only the "name" column from OL_DATASET

- timestamp: 2026-02-07
  checked: DetailPanel.tsx effectiveDatasetId computation (line 97-99)
  found: When datasetId prop is not provided (DatabaseLineageGraph, AllDatabasesLineageGraph), computes effectiveDatasetId by stripping last dot-segment from node ID, yielding "demo_user.customers" (just the dataset name, not the full dataset_id)
  implication: Statistics/DDL API calls use incorrect dataset identifier

- timestamp: 2026-02-07
  checked: Python statistics handler (line 1703-1705)
  found: Queries "SELECT source_type FROM OL_DATASET WHERE dataset_id = ?" with the value received from URL, which is "demo_user.customers" instead of "a1b2c3d4/demo_user.customers"
  implication: Query returns no rows -> 404 "Dataset not found" response

- timestamp: 2026-02-07
  checked: DatabaseLineageGraph DetailPanel invocation (line 510-517)
  found: Does NOT pass datasetId prop to DetailPanel, forcing fallback to node ID-based computation
  implication: Primary trigger path for the bug

- timestamp: 2026-02-07
  checked: AllDatabasesLineageGraph DetailPanel invocation (line 656-663)
  found: Also does NOT pass datasetId prop to DetailPanel
  implication: Same bug affects all-databases view

- timestamp: 2026-02-07
  checked: LineageGraph DetailPanel invocation (line 654-662)
  found: DOES pass datasetId prop (from URL parameter, which contains full dataset_id from AssetBrowser navigation)
  implication: Column-level lineage view should work IF navigated from AssetBrowser; the user's report about column-level failure may be from database lineage view context

## Resolution

root_cause: The DetailPanel computes effectiveDatasetId by stripping the column name from lineage node IDs (format "database.table.column" -> "database.table"). This "database.table" string is used to call the /statistics and /ddl API endpoints. However, these endpoints query OL_DATASET.dataset_id which has the format "namespace_hash/database.table". The query "WHERE dataset_id = 'demo_user.customers'" returns no rows because the actual value is "a1b2c3d4/demo_user.customers", causing a 404.

The root issue is a format mismatch: lineage node IDs use dataset *name* (OL_DATASET.name) while the statistics/DDL endpoints expect the full dataset *ID* (OL_DATASET.dataset_id).

fix: Two possible fix approaches:
  1. (Backend) Modify statistics/DDL endpoints to also accept dataset name as lookup key (add fallback: WHERE dataset_id = ? OR name = ?)
  2. (Frontend) Ensure DetailPanel always receives the correct full datasetId - either pass it as a prop from DatabaseLineageGraph/AllDatabasesLineageGraph, or include the full dataset_id in lineage response node metadata so it can be extracted
  Approach 1 is simpler and more robust.

verification:
files_changed: []
