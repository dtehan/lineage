# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** Phase 13 - Multi-select and group move in lineage graph (COMPLETE)

## Current Position

Phase: 13 of 13 (Multi-select and group move in lineage graph)
Plan: 1 of 1 (complete)
Status: Complete - All 13 phases done
Last activity: 2026-02-19 — Plan 13-01 complete, SUMMARY.md written, all 13 phases done

Progress: [██████████] 100% complete (13/13 phases done)

## Performance Metrics

**Velocity:**
- Total plans completed: 27 (across v1.0, v2.0, and v3.0)
- v1.0: 12 plans over 2 days
- v2.0: 8 plans over 18 days
- v3.0: 7 plans (07-01: 78s, 07-02: 181s, 07-03: 293s, 08-01: 181s, 08-02: 195s, 09-01: 239s, 09-02: 125s)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Code Quality | 3 | 12 | Complete |
| v2.0 Performance | 3 | 8 | Complete |
| v3.0 Wildcard Expansion | 3 | 6 | Complete |

**Recent Trend:**
Phase 13 complete - React Flow multi-select wired to Zustand store; Cmd+click or toolbar toggle selects table nodes with blue ring, group drag moves them together, Escape exits cleanly

*Updated after 13-01 full completion*
| Phase 07 P01 | 78s | 1 task | 1 file |
| Phase 07 P02 | 181s | 2 tasks | 2 files |
| Phase 07 P03 | 293s | 2 tasks | 3 files |
| Phase 08 P01 | 181s | 2 tasks | 2 files |
| Phase 08 P02 | 195s | 2 tasks | 2 files |
| Phase 09 P01 | 239s | 2 tasks | 2 files |
| Phase 09 P02 | 125s | 2 tasks | 2 files |
| Phase 10 P01 | 140s | 2 tasks | 3 files |
| Phase 10 P02 | ~300s | 2 tasks | 3 files |
| Phase 11 P01 | ~2min | 2 tasks | 5 files | 2026-02-19 |
| Phase 12 P01 | ~25min | 3 tasks + 2 fixes | 3 files | 2026-02-19 | Complete |
| Phase 13 P01 | 210s | 2 tasks | 7 files | 2026-02-19 | Complete |

## Accumulated Context

### Roadmap Evolution

- Phase 10 added: View lineage - show data flow through views to source tables
- Phase 11 added: Sort columns alphabetically in lineage graph nodes
- Phase 12 added: Prevent database cluster overlap in lineage graph visualization
- Phase 13 added: Multi-select and group move in lineage graph

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 13-01]: multiSelectionKeyCode=null when isMultiSelectMode active so RF treats every click as selection toggle (no modifier required)
- [Phase 13-01]: Entering multi-select mode clears all highlight/selection state atomically to prevent dimming interfering with ring visibility
- [Phase 13-01]: ring-blue-400 ring-offset-2 used for multi-select ring (lighter than border-blue-500 for column selection) to make them visually distinguishable
- [Phase 13-01]: onNodeClick returns early on metaKey/ctrlKey/isMultiSelectMode to let React Flow manage selection natively
- [Phase 13-01]: selectionOnDrag=false prevents accidental box-selection when panning
- [Phase 12-01]: ELK partitioning applied only to hasCrossDatabaseEdges flat-layout branch; compound-node path unchanged
- [Phase 12-01]: Post-layout separateDatabaseClusters() required because ELK partitioning alone cannot guarantee padded bounding boxes won't overlap at same y-range
- [Phase 12-01]: topoSortDatabases() (Kahn's algorithm) replaces alphabetical sort - upstream databases assigned lower partition indices and placed LEFT
- [Phase 12-01]: separateDatabaseClusters() accepts explicit dbOrder parameter to enforce lineage-flow ordering in post-layout shift step
- [Phase 12-01]: ClusterBackground default padding increased from 20 to 60 flow units for visible gaps between clusters
- [Phase 11-01]: Sort applied after .map() in transformToTableNodes so original columnNodes array is not mutated
- [Phase 11-01]: Sort happens before createElkPorts so ELK port indices automatically match sorted display order
- [Phase 11-01]: DetailPanel sort uses columnName field (ColumnDetail type) vs layoutEngine sort using name field (ColumnDefinition type)
- [Phase 10-02]: REPLACE VIEW -> CREATE VIEW normalization via regex before SQLGlot parse (Teradata stores definitions as REPLACE VIEW in RequestText)
- [Phase 10-02]: Unqualified column with single source table: assign directly (no extra DB query)
- [Phase 10-02]: Unqualified column with multiple source tables: probe OL_DATASET_FIELD, skip if still ambiguous
- [Phase 10-02]: SELECT * with single source: map by name match first, then ordinal position fallback
- [Phase 10-02]: SELECT * with multiple sources: skip with warning (ambiguous attribution, same policy as WildcardResolver)
- [Phase 10-02]: --views flag sits outside mutually exclusive group so it can combine: --fixtures --views or --dbql --views
- [Phase 10-02]: Duplicate key errors (2801) silently ignored on INSERT (same as fixtures pattern)
- [Phase 10-02]: confidence_score: 0.90 DIRECT, 0.80 CALCULATION/expression, 0.70 SELECT * wildcard
- [Phase 10-01]: source_type_cache pre-seeded with root dataset from get_dataset_with_namespace() to avoid N+1 queries for the most common node
- [Phase 10-01]: _build_node() source_type param defaults to "TABLE" for graceful degradation when OL_DATASET has no entry
- [Phase 10-01]: get_dataset_with_namespace() backward-compatible extension - callers ignoring source_type are unaffected
- [Phase 09-02]: _configure_cursor helper uses _last_query instance variable via execute side_effect to discriminate query types (TablesV vs ColumnsJQV vs RequestText)
- [Phase 09-02]: test_warm_cache_with_views_integration uses three-way fetchall discriminator to simulate complete warm_cache() flow
- [Phase 09-02]: Integration tests simulate view expansion via MockWildcardResolver pre-populated with view columns (resolve_star() is shared interface)
- [Phase 09-01]: MAX_VIEW_EXPANSION_DEPTH = 3 separate from CTE MAX_EXPANSION_DEPTH = 5 (different nesting expectations)
- [Phase 09-01]: View expansion happens after table cache warming so proxy can find base table columns
- [Phase 09-01]: Query-discriminating fetchall side_effect pattern for tests calling warm_cache() (prevents column rows from being misidentified as view refs)
- [Phase 09-01]: _column_cache stores view-expanded columns alongside table columns - resolve_star() unchanged
- [Phase 08-02]: Use self.assertLogs() for warning verification (more reliable than mocking logger)
- [Phase 08-02]: Use tempfile.TemporaryDirectory() for baseline file tests (automatic cleanup)
- [Phase 08-02]: Manually populate _column_cache for schema evolution tests (clearer than mocking fetchall)
- [Phase 08-01]: Qualified wildcard detection via isinstance(expr, exp.Column) and expr.name == '*' (SQLGlot representation)
- [Phase 08-01]: Schema evolution via column count comparison only (not full definitions) for memory efficiency
- [Phase 08-01]: baseline_path parameter optional (default None) for backward compatibility
- [Phase 08-01]: Audit logging for both qualified and unqualified wildcard expansions
- [Phase 07-03]: All unit tests use mocks - no database connection required
- [Phase 07-03]: Pattern-based fallback is acceptable behavior when wildcard expansion unavailable
- [Phase 07-02]: Wildcard-expanded lineage gets confidence 0.70 (vs 0.95 direct, 0.85 expression)
- [Phase 07-02]: Multi-table unqualified SELECT * skipped with warning (ambiguous attribution)
- [Phase 07-02]: CTE expansion depth limit of 5 levels with cycle detection
- [Phase 07-01]: Batch size limit of 100 tables per query to prevent query explosion
- [Phase 07-01]: In-memory dict cache (no Redis) - sufficient for single extraction run
- [Phase 07-01]: Graceful degradation: return empty list on cache miss, never raise exceptions

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-19
Stopped at: Phase 13 Plan 01 — SUMMARY.md written, plan 13-01 fully complete
Resume file: None

## Performance Metrics (v3.0)

| Phase-Plan | Duration | Tasks | Files | Completed |
|------------|----------|-------|-------|-----------|
| 07-01 | 78s | 1 | 1 | 2026-02-19 |
| 07-02 | 181s | 2 | 2 | 2026-02-19 |
| 07-03 | 293s | 2 | 3 | 2026-02-19 |
| 08-01 | 181s | 2 | 2 | 2026-02-19 |
| 08-02 | 195s | 2 | 2 | 2026-02-19 |
| 09-01 | 239s | 2 | 2 | 2026-02-19 |
| 09-02 | 125s | 2 | 2 | 2026-02-19 |
| 10-01 | 140s | 2 | 3 | 2026-02-19 |
| 10-02 | ~300s | 2 | 3 | 2026-02-19 |
| 11-01 | 131s | 1 (checkpoint) | 5 | 2026-02-19 |
| 12-01 | ~300s | 2 (checkpoint) | 3 | 2026-02-19 |
| 13-01 | 210s | 2 | 7 | 2026-02-19 |
