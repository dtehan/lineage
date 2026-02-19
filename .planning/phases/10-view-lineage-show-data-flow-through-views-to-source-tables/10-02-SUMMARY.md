---
phase: 10-view-lineage-show-data-flow-through-views-to-source-tables
plan: 02
subsystem: database
tags: [sqlglot, python, view-lineage, openlineage, teradata, DBC.TablesV]

# Dependency graph
requires:
  - phase: 10-01
    provides: sourceType propagation in column/table lineage endpoints (views rendered as orange cards with VIEW badge)
provides:
  - ViewLineageExtractor class that fetches view SQL from DBC.TablesV.RequestText and parses with SQLGlot to produce OL_COLUMN_LINEAGE records
  - --views flag on populate_lineage.py to populate view-chain lineage records
  - 25 unit tests covering all extraction cases
affects: [view lineage graph rendering, upstream lineage traversal through views]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ViewLineageExtractor follows the WildcardResolver fetch+parse+insert pattern
    - _parse_view_lineage normalizes REPLACE VIEW -> CREATE VIEW before SQLGlot parse
    - Batch-fetches view SQL from DBC.TablesV in groups of 100 (same BATCH_SIZE pattern as WildcardResolver)
    - --views is a standalone boolean flag (not in mutually exclusive group) so it combines with --fixtures/--dbql

key-files:
  created:
    - database/scripts/populate/view_lineage_extractor.py
    - database/tests/test_view_lineage_extractor.py
  modified:
    - database/scripts/populate/populate_lineage.py

key-decisions:
  - "REPLACE VIEW -> CREATE VIEW normalization done via regex (same pattern as wildcard_resolver.py lines 468-475)"
  - "Unqualified column with single source table: assign to that table directly (no DB query needed)"
  - "Unqualified column with multiple source tables: query OL_DATASET_FIELD to resolve, skip if still ambiguous"
  - "SELECT * with single source: use OL_DATASET_FIELD for both source and view columns, map by ordinal position"
  - "SELECT * with multiple sources: log warning and skip (ambiguous attribution, same policy as WildcardResolver)"
  - "--views flag sits outside mutually exclusive group so it can combine with any lineage source mode"
  - "Duplicate key errors (code 2801) silently ignored on INSERT (same as fixtures pattern)"
  - "confidence_score: 0.90 DIRECT, 0.80 CALCULATION/expression, 0.70 SELECT * wildcard expansion"

patterns-established:
  - "View lineage extraction: discover (OL_DATASET WHERE source_type=VIEW) -> fetch SQL (DBC.TablesV.RequestText) -> parse (SQLGlot) -> insert (OL_COLUMN_LINEAGE)"
  - "Per-view try/except: one bad view never crashes the whole extraction run"

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 10 Plan 02: ViewLineageExtractor and --views Flag Summary

**ViewLineageExtractor derives column-level lineage from Teradata view SQL via SQLGlot: discovers views in OL_DATASET, fetches RequestText from DBC.TablesV, parses SELECT expressions, and inserts OL_COLUMN_LINEAGE records for each source->target column mapping**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-19T17:36:17Z
- **Completed:** 2026-02-19T17:40:15Z
- **Tasks:** 1 of 2 complete (stopped at checkpoint Task 2: human-verify)
- **Files modified:** 3

## Accomplishments

- Created `view_lineage_extractor.py` with `ViewLineageExtractor` class implementing `extract_all()`, `_discover_views()`, `_fetch_view_definitions()`, `_parse_view_lineage()`, `_insert_lineage_records()`
- Added `--views` flag to `populate_lineage.py` as a standalone boolean (combinable with `--fixtures`/`--dbql`) that calls `populate_lineage_from_views()`
- 25 unit tests pass without any database connection, covering: simple columns, aliases, expressions/CALCULATION, JOIN views, unparseable views, REPLACE VIEW normalization, SELECT * expansion, dry_run mode, duplicate handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ViewLineageExtractor module and integrate with populate_lineage.py** - `2e301c8` (feat)

**Plan metadata:** TBD (docs commit pending Task 2 human verification)

## Files Created/Modified

- `database/scripts/populate/view_lineage_extractor.py` - ViewLineageExtractor class with full extraction pipeline
- `database/tests/test_view_lineage_extractor.py` - 25 unit tests (no DB connection required)
- `database/scripts/populate/populate_lineage.py` - Added `--views` flag and `populate_lineage_from_views()` function

## Decisions Made

- REPLACE VIEW -> CREATE VIEW normalization via regex before SQLGlot parse (Teradata stores definitions as REPLACE VIEW in RequestText)
- Unqualified column with single source table: assign directly (no extra DB query)
- Unqualified column with multiple source tables: probe OL_DATASET_FIELD, skip if still ambiguous
- SELECT * with single source: map by name match first, then ordinal position fallback
- SELECT * with multiple sources: skip with warning (ambiguous attribution)
- `--views` sits outside the mutually exclusive group so it can be combined: `--fixtures --views` or `--dbql --views`
- Duplicate key errors (2801) silently ignored on INSERT (same pattern as fixtures)
- confidence_score: 0.90 DIRECT, 0.80 CALCULATION/expression, 0.70 SELECT * wildcard

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

After human verification (Task 2), run the following to populate view lineage:

```bash
cd database
python scripts/populate/populate_lineage.py --skip-clear --lineage-only --views
```

Then navigate to a view in the lineage graph to verify upstream edges appear.

## Next Phase Readiness

- Task 2 (human-verify) is pending: human must run `--views` against the database and verify upstream lineage appears in the graph for at least one view
- ViewLineageExtractor is ready to run against any Teradata instance with views registered in OL_DATASET
- Nested view chains (view -> view -> table) will produce transitive records at each hop since the recursive CTE in the lineage service handles multi-hop traversal

## Self-Check: PASSED

Files verified:
- FOUND: database/scripts/populate/view_lineage_extractor.py
- FOUND: database/tests/test_view_lineage_extractor.py
- FOUND: commit 2e301c8

---
*Phase: 10-view-lineage-show-data-flow-through-views-to-source-tables*
*Completed: 2026-02-19 (partial - Task 2 checkpoint pending)*
