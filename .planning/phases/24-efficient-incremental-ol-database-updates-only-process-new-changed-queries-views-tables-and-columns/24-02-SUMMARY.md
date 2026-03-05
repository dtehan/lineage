---
phase: 24-efficient-incremental-ol-database-updates
plan: 02
subsystem: database
tags: [teradata, watermark, incremental, dbql, view-lineage, populate]

# Dependency graph
requires:
  - phase: 24-efficient-incremental-ol-database-updates-01
    provides: WatermarkStore class with get/set/clear methods backed by OL_POPULATE_LOG
provides:
  - DBQLExtractor with automatic watermark-based incremental extraction
  - ViewLineageExtractor with changed-view detection via AlterTimeStamp
  - Stale lineage cleanup before re-extraction for changed views
  - Watermark writes after successful extraction in both extractors
affects:
  - 24-03 (populate_lineage.py orchestration will pass since parameter to ViewLineageExtractor)
  - Any caller of DBQLExtractor.extract_lineage() — now writes watermark on every run

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auto-read watermark when since=None and full=False; write after successful insert (even 0 records)"
    - "First run falls back to DEFAULT_LOOKBACK_DAYS (30 days) when no watermark exists"
    - "Changed-view detection: JOIN OL_DATASET to DBC.TablesV on UPPER(name) with COALESCE(AlterTimeStamp, CreateTimeStamp) > CAST(? AS TIMESTAMP(0)) parameterized"
    - "Stale lineage cleanup: DELETE OL_COLUMN_LINEAGE WHERE target_dataset = ? AND transformation_description = 'Derived from view definition' before re-extraction"
    - "since=None preserves full scan behavior (backward compatible)"
    - "Changed-view query failure falls back to full _discover_views() scan (non-fatal)"

key-files:
  created: []
  modified:
    - database/scripts/populate/dbql_extractor.py
    - database/scripts/populate/view_lineage_extractor.py

key-decisions:
  - "DBQLExtractor writes watermark even on 0-record runs to advance the mark and avoid re-scanning already-processed time windows"
  - "ViewLineageExtractor.since defaults to None preserving existing full-scan behavior; Plan 03 will wire the caller to pass the watermark value"
  - "Parameterized CAST(? AS TIMESTAMP(0)) used for AlterTimeStamp filter — NOT string interpolation — to avoid SQL injection and formatting issues"
  - "Changed-view query falls back to full scan on failure; stale cleanup failures are per-view non-fatal (logged warning, continue)"

patterns-established:
  - "Write watermark after insert, not before — ensures watermark only advances when data is actually committed"
  - "0-record successful runs still advance watermark to prevent re-scanning empty windows"
  - "Incremental fallback pattern: try changed-only query, fall back to full scan on exception"

requirements-completed: [INC-03, INC-04]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 24 Plan 02: Watermark Integration for DBQL and View Lineage Extractors Summary

**DBQLExtractor auto-reads watermark on each run (falling back to 30-day lookback on first run), ViewLineageExtractor discovers only changed views via DBC.TablesV AlterTimeStamp with stale lineage cleanup before re-extraction**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T02:58:05Z
- **Completed:** 2026-03-05T03:00:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- DBQLExtractor now auto-reads SOURCE_DBQL watermark when no explicit `since` is provided; falls back to DEFAULT_LOOKBACK_DAYS (30) on first run; writes watermark after every successful extraction (including 0-record runs)
- ViewLineageExtractor gains `since` parameter and `_discover_changed_views()` that queries only views with AlterTimeStamp or CreateTimeStamp > since using parameterized SQL
- `_cleanup_stale_view_lineage()` DELETEs existing OL_COLUMN_LINEAGE records for changed views before re-extraction, preventing duplicate/stale lineage accumulation
- Both extractors write their watermark (SOURCE_DBQL / SOURCE_VIEW_LINEAGE) after successful extraction; all failure modes are non-fatal with graceful fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire DBQL extractor to automatic watermark** - `223af95` (feat)
2. **Task 2: Add changed-view detection and stale lineage cleanup to view extractor** - `63787b9` (feat)

**Plan metadata:** (docs commit hash — see below)

## Files Created/Modified

- `database/scripts/populate/dbql_extractor.py` - WatermarkStore import, auto-watermark in extract_lineage(), watermark write after insert, print_summary() watermark line
- `database/scripts/populate/view_lineage_extractor.py` - WatermarkStore import + instance, since parameter, _discover_changed_views(), _cleanup_stale_view_lineage(), watermark write after extraction, mode print in extract_all()

## Decisions Made

- **Watermark written after insert (not before):** Ensures watermark only advances when data is committed. If insert fails mid-batch, the next run will re-scan from last watermark.
- **0-record runs still advance watermark:** Prevents repeatedly re-scanning a time window with no activity. A clean run with 0 records is still a successful run.
- **Parameterized CAST(? AS TIMESTAMP(0)):** The plan explicitly noted the RESEARCH.md example showed string interpolation for illustration only — parameterized form used to avoid SQL injection and timestamp formatting bugs.
- **since=None default preserves backward compatibility:** ViewLineageExtractor callers that don't pass `since` continue to get full scan behavior. Plan 03 will wire the orchestrator to pass the watermark value.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

The `since` parameter for ViewLineageExtractor defaults to None (full scan). Plan 03 will update `populate_lineage.py` to pass the watermark timestamp through.

## Next Phase Readiness

- DBQL extractor is fully wired: auto-incremental on each run, no caller changes needed
- ViewLineageExtractor is ready for incremental mode — Plan 03 must pass `since=watermark.get(SOURCE_VIEW_LINEAGE)` in the populate_lineage_from_views() caller
- No blockers

---
*Phase: 24-efficient-incremental-ol-database-updates*
*Completed: 2026-03-05*
