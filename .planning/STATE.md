# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** v5.0 — Phase 19: Layout Engine Foundation

## Current Position

Phase: 19 of 21 in v5.0 (Layout Engine Foundation)
Plan: 2 of 2 in current phase — Phase 19 COMPLETE
Status: Phase complete — ready for Phase 20
Last activity: 2026-02-22 — Plan 19-02 complete: Four algorithmic bug fixes (LFND-01, 02, 03, 06)

Progress: [██░░░░░░░░] 20% (v5.0)

v1.0: ██████████ 100% (3/3 phases) — shipped 2026-02-15
v2.0: ██████████ 100% (3/3 phases) — shipped 2026-02-16
v3.0: ██████████ 100% (7/7 phases) — shipped 2026-02-19
v4.0: ██████████ 100% (5/5 phases) — shipped 2026-02-21
Draggable Minimap: ██████████ 100% (1/1 plans) — complete 2026-02-22

## Performance Metrics

**Velocity:**
- Total plans completed: 39 (v1.0: 12, v2.0: 8, v3.0: 7, v4.0: 9, draggable-minimap: 1, v5.0: 2)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Code Quality | 3 | 12 | Shipped 2026-02-15 |
| v2.0 Performance | 3 | 8 | Shipped 2026-02-16 |
| v3.0 Wildcard Expansion | 7 | 7 | Shipped 2026-02-19 |
| v4.0 First-Time Load | 5 | 9 | Shipped 2026-02-21 |
| Draggable Minimap Viewport | 1 | 1 | Complete 2026-02-22 |
| v5.0 Database Lineage Layout | 3 | 5 | Phase 19 complete (2/5 plans done) |

## Accumulated Context

### Key Decisions (v5.0 research)

- All layout changes confined to `layoutEngine.ts` — no caller interface changes, no API changes, no React Flow component changes
- Phase 19 before Phase 20 is a hard dependency: separateDatabaseClusters bounding-box bug breaks multi-database graphs the moment non-contiguous nodes exist
- Worker migration (Phase 19) must precede new BFS algorithm (Phase 20): connected component analysis adds ~5ms per 500 tables, acceptable in worker, jank on main thread
- layoutSimpleNodes ELK config change ships in Phase 20 alongside main path fix (atomic release, same symptom)
- ELK DisCo explicitly rejected: known hang risk on dense graphs
- No new npm packages: ELKjs 0.9.3 already supports all required options

### Key Decisions (19-02 execution)

- Binary-search splice insertion chosen for Kahn sort: queue stays sorted at O(log n) per push, eliminates O(n log n) re-sort inside while loop
- djb2 hash for cluster color lookup: deterministic unsigned 32-bit, color stable across page refreshes regardless of Map iteration order
- separateDatabaseClusters extended with secLo/secHi non-breaking: existing { lo, hi } destructuring sites unchanged, secondary bounds available for Phase 20

### Key Decisions (19-01 execution)

- Emit fixed progress milestones (35 before Worker, 90 after) rather than passing onProgress callback — functions are not structured-clone-able across Worker boundary (Comlink uses structured clone)
- Generation counter (not boolean cancelled flag) protects against stale layout results from rapid direction changes

### Pending Todos

None.

### Blockers/Concerns

None active.

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 19-02-PLAN.md — Phase 19 complete (both plans done), ready for Phase 20
Resume file: None
