# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** v4.0 Phase 14 — In-Memory Graph Engine

## Current Position

Phase: 14 of 18 (In-Memory Graph Engine)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-21 — Plan 14-01 complete: graph package with GraphStore and GraphLoader

Progress: [██████░░░░] 59% (13/22 phases complete across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 27 (v1.0: 12, v2.0: 8, v3.0: 7)
- v3.0 average plan duration: ~200s
- Recent plans range: 78s (fast) to ~45min (complex with fixes)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Code Quality | 3 | 12 | Complete |
| v2.0 Performance | 3 | 8 | Complete |
| v3.0 Wildcard Expansion | 7 | 7 | Complete |
| v4.0 First-Time Load | 5 | 1 | In progress |

*Updated after each plan completion*

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 14-in-memory-graph-engine P01 | 2min | 1 tasks | 4 files |

## Accumulated Context

### Key Decisions for v4.0

- [Research]: networkx DiGraph chosen over plain dicts — maintainability over memory; optimize only if production RSS exceeds targets
- [Research]: Polling (two TanStack Query fetches) chosen over SSE — SSE incompatible with sync Gunicorn workers; polling achieves same UX with zero infrastructure risk
- [Research]: Blue-green graph swap pattern required from day one — build new graph into separate variable, atomically swap reference, never destroy old before new is ready
- [Research]: Defer ELKjs layout to final depth only — prevents layout jitter, avoids re-render storm, no position-stability algorithm needed
- [Research]: Gunicorn worker model (--preload or --workers 1 --threads N) must be decided and validated in Phase 14 before any other phase begins
- [Research]: BFS/CTE semantic equivalence tests must be written and passing before CTE path is retired
- [14-01]: GraphStore.build() uses psutil process RSS for memory_bytes — consistent baseline for monitoring reload growth, not graph-scoped heap
- [14-01]: fetchall() inside cursor context, loop outside — avoids holding cursor open during DiGraph construction

### Pending Todos

None.

### Blockers/Concerns

- [Phase 14]: Gunicorn preload fork-safety with existing DB connection lifecycle needs experimental validation in staging before production deployment
- [Phase 14]: Memory footprint at production scale (100K edges) needs measurement before committing to networkx — one-day spike recommended at start of Phase 14

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 14-in-memory-graph-engine-01-PLAN.md
Resume file: None
