---
phase: 01-foundation-refactoring-impact-analysis-core
plan: 02
subsystem: backend-service-layer
tags: [refactoring, service-layer, impact-analysis]
dependencies:
  requires: ["01-01"]
  provides: ["service-layer-classes", "impact-service"]
  affects: ["lineage-api/routes"]
tech_stack:
  added: []
  patterns: ["service-layer", "dependency-injection"]
key_files:
  created:
    - lineage-api/services/__init__.py
    - lineage-api/services/dataset_service.py
    - lineage-api/services/lineage_service.py
    - lineage-api/services/impact_service.py
  modified: []
decisions:
  - decision: "Service layer returns dict shapes matching current API responses"
    rationale: "Ensures backward compatibility and zero breaking changes during refactoring"
  - decision: "ImpactService default max_depth of 5"
    rationale: "Conservative default matching column lineage; research suggested 10 but starting cautious"
  - decision: "Impact type classification: direct (depth=1) vs indirect (depth>1)"
    rationale: "Simple binary classification for initial implementation; can be refined in future"
metrics:
  duration_minutes: 2
  tasks_completed: 1
  files_created: 4
  commits: 1
  completed_at: "2026-02-14T20:14:46Z"
---

# Phase 01 Plan 02: Service Layer Extraction Summary

**One-liner:** Created service layer with DatasetService (8 methods), LineageService (3 graph builders + helpers), and ImpactService (downstream impact analysis with depth classification)

## Overview

Extracted business logic from Flask route handlers into dedicated service classes that orchestrate repository calls. This establishes a clean three-layer architecture (routes → services → repositories) and creates the ImpactService needed for the new impact analysis endpoint in Plan 04.

## Tasks Completed

### Task 1: Create service layer classes

**Outcome:** Created lineage-api/services/ package with three service classes

**What was built:**
- `DatasetService`: 8 methods delegating to DatasetRepository
  - list_namespaces(), get_namespace()
  - list_datasets(), get_dataset()
  - search_datasets(), unified_search()
  - get_dataset_statistics(), get_dataset_ddl()
- `LineageService`: 3 public methods + 3 helper methods
  - get_column_lineage_graph() - replicates logic from get_openlineage_lineage()
  - get_table_lineage_graph() - replicates logic from get_openlineage_table_lineage()
  - get_database_lineage_graph() - replicates logic from get_openlineage_database_lineage()
  - Helper methods: _build_node(), _build_edge(), _add_lineage_results()
- `ImpactService`: 1 method for downstream impact analysis
  - analyze_downstream_impact() - aggregates downstream lineage into impact summary
  - Returns: sourceAsset, impactedAssets (with databaseName, tableName, columnName, depth, impactType), summary (totalImpacted, tableCount, columnCount, databaseCount, byDatabase, byDepth)

**Files created:**
- lineage-api/services/__init__.py (13 lines)
- lineage-api/services/dataset_service.py (183 lines)
- lineage-api/services/lineage_service.py (441 lines)
- lineage-api/services/impact_service.py (147 lines)

**Verification:**
- All three services import successfully
- Service methods have correct signatures
- python_server.py unchanged (backward compatibility)
- Database tests not run (no Teradata connection) but no database changes made

**Commit:** 4d1ede3 - "feat(01-02): create service layer for lineage, dataset, and impact operations"

## Deviations from Plan

None - plan executed exactly as written.

## Technical Implementation Details

### Service Layer Architecture

```
Flask Routes (Plan 03)
    ↓
Service Layer (Plan 02) ← YOU ARE HERE
    ↓
Repository Layer (Plan 01)
    ↓
Teradata Database
```

### DatasetService

Wraps DatasetRepository methods with minimal business logic:
- Adds response envelope structures (e.g., `{"namespaces": [...]}`)
- Handles pagination metadata construction
- Raises ValueError for not-found cases (consistent error handling)
- Preserves exact response shapes from current python_server.py

### LineageService

Extracts complex graph-building logic from python_server.py route handlers:
- `get_column_lineage_graph()`: Builds nodes/edges from upstream/downstream lineage records
- `get_table_lineage_graph()`: Aggregates lineage for all fields in a dataset
- `get_database_lineage_graph()`: Handles cross-database lineage with external node metadata lookups
- Helper methods eliminate code duplication between methods

Key design choices:
- Nodes dict keyed by `dataset.field` for O(1) deduplication
- Edges list with edge ID checking for deduplication
- Helper `_add_lineage_results()` processes repository records into graph structures

### ImpactService

New service for downstream impact analysis (powers Plan 04 endpoint):
- Calls `lineage_repo.get_downstream_lineage()` with max_depth
- Deduplicates impacted columns (keeps shortest depth)
- Classifies impact: "direct" (depth=1) vs "indirect" (depth>1)
- Calculates summary statistics:
  - totalImpacted: unique impacted columns
  - tableCount: unique database.table combinations
  - columnCount: same as totalImpacted (deduplicated)
  - databaseCount: unique databases
  - byDatabase: count per database name
  - byDepth: count per depth level

## Impact on Roadmap

### Phase 01 (Foundation Refactoring & Impact Analysis Core)

**Plan 03 (Route Handler Refactoring):** Can now replace route handler logic with simple service method calls

**Plan 04 (Impact Analysis Endpoint):** ImpactService.analyze_downstream_impact() is ready to power the new `/api/v2/openlineage/impact/{datasetId}/{fieldName}` endpoint

**Plan 05 (BFS Depth Validation):** ImpactService uses depth from repository CTEs; validation will test depth accuracy in multi-path scenarios

## Open Questions / Follow-ups

1. **ImpactService max_depth default:** Started with 5 (conservative, matches column lineage). Research suggested 10. May need adjustment based on production use.

2. **Impact type classification:** Binary "direct/indirect" is simple but may need refinement. Consider: "direct", "1-hop", "2-hop", "distant" for more granularity?

3. **Performance:** Database lineage endpoint queries all datasets in database + all fields. May need optimization for large databases (1000+ tables).

## Self-Check

Verifying key claims from summary:

**Files created:**
- lineage-api/services/__init__.py
- lineage-api/services/dataset_service.py
- lineage-api/services/lineage_service.py
- lineage-api/services/impact_service.py

**Verification commands:**
```bash
# Check files exist
[ -f "lineage-api/services/__init__.py" ] && echo "FOUND: __init__.py" || echo "MISSING"
[ -f "lineage-api/services/dataset_service.py" ] && echo "FOUND: dataset_service.py" || echo "MISSING"
[ -f "lineage-api/services/lineage_service.py" ] && echo "FOUND: lineage_service.py" || echo "MISSING"
[ -f "lineage-api/services/impact_service.py" ] && echo "FOUND: impact_service.py" || echo "MISSING"

# Check commit exists
git log --oneline --all | grep -q "4d1ede3" && echo "FOUND: 4d1ede3" || echo "MISSING"

# Verify imports work
cd lineage-api && python3 -c "from services import LineageService, DatasetService, ImpactService; print('OK')"
```

**Self-check results:**
```
FOUND: __init__.py
FOUND: dataset_service.py
FOUND: lineage_service.py
FOUND: impact_service.py
FOUND: commit 4d1ede3
Services import: OK
```

## Self-Check: PASSED

All files created, commit exists, and services import successfully.
