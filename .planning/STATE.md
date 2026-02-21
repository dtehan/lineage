# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** v4.0 Phase 17 — Observability

## Current Position

Phase: 17 of 18 (Observability)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-02-21 — Phase 17 Plan 02 complete (per-stage timing display in frontend)

Progress: [█████████░] 77% (17/22 phases complete across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 33 (v1.0: 12, v2.0: 8, v3.0: 7, v4.0: 6)
- v3.0 average plan duration: ~200s
- Recent plans range: 78s (fast) to ~45min (complex with fixes)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Code Quality | 3 | 12 | Complete |
| v2.0 Performance | 3 | 8 | Complete |
| v3.0 Wildcard Expansion | 7 | 7 | Complete |
| v4.0 First-Time Load | 5 | 6 | In progress |

*Updated after each plan completion*

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 14-in-memory-graph-engine P01 | 2min | 1 tasks | 4 files |
| Phase 14-in-memory-graph-engine P02 | 2min | 2 tasks | 4 files |
| Phase 14-in-memory-graph-engine P03 | 2min | 2 tasks | 4 files |
| Phase 15-cache-integration P01 | 2min | 2 tasks | 3 files |
| Phase 16-progressive-depth-loading P01 | 3min | 1 tasks | 4 files |
| Phase 16-progressive-depth-loading P02 | 5min | 2 tasks | 3 files |
| Phase 17-observability P01 | 3min | 2 tasks | 5 files |
| Phase 17-observability P02 | 8min | 2 tasks | 5 files |

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
- [14-02]: Lock held only for reference copy/swap operations — never during BFS traversal or GraphStore.build()
- [14-02]: BFS results intentionally omit namespace fields; _enrich_bfs_results() resolves them with per-request cache to avoid N+1 queries
- [14-02]: Database-level lineage continues using CTE path — batch dataset query pattern doesn't map cleanly to per-field BFS
- [14-02]: graph_engine.initialize() is non-blocking by design: daemon thread warmup, app serves CTE immediately
- [14-03]: BFS traversal uses subgraph reachability (single_source_shortest_path_length + induced subgraph) instead of nx.bfs_edges — correctly returns diamond convergence edges that BFS tree traversal misses
- [14-03]: Engine test injection pattern: set engine._store = GraphStore.build(G) and engine._ready.set() to simulate warm engine without DB connection
- [15-01]: invalidate() ordering: _ready.clear() must happen before thread.start() to avoid race where fast rebuild completes before clear undoes _ready.set()
- [15-01]: GatedLoader pattern: threading.Event gate for deterministic rebuild timing in tests — test controls release, no time.sleep() dependency
- [15-01]: Redis flush before graph rebuild: graph_engine.invalidate() called after Redis flush completes to ensure Redis is always cleared first
- [16-01]: useProgressiveLineage uses TanStack Query enabled chaining (enabled: isEnabled && !!depth1Query.data && maxDepth > 1) — no custom state machine required
- [16-01]: When maxDepth=1, fullDepthQuery shares the same cache key as depth1Query so no second network request fires (enabled guard prevents fetch), TanStack serves cached data
- [16-01]: appendGraph uses Set-based deduplication for O(n) merge with existing-first ordering
- [16-02]: columnData = isFullDepthReady ? columnFinalData : (isDepth1Ready ? depth1Query.data : null) — spinner dismisses on depth-1 arrival, layout fires twice (both near-instant via deterministic topological algorithm)
- [16-02]: ProgressBanner placed below showProgress early-return so it only renders when depth-1 graph is visible; ProgressBanner accessible name requires aria-label not text content for role=status
- [17-01]: record_timing() catches RuntimeError (not just hasattr) for no-op outside Flask app context — required for tests calling service methods without app context
- [17-01]: Table lineage uses single aggregate metric (bfs_total/db_total) for entire field loop — one header entry per request, not per field, keeps Server-Timing header readable
- [17-01]: expose_headers=['Server-Timing'] added to existing CORS() call — JavaScript can read Server-Timing in cross-origin requests
- [17-02]: stageStartTimeRef set inside setStageState updater to access guaranteed-correct prevStage — avoids race with stale closure
- [17-02]: formatMs is a separate export from formatDuration — formatMs for per-stage (ms/s display), formatDuration for total elapsed (s/m display)
- [17-02]: Post-render timing bar shows only when stage=complete AND stageDurations has at least one entry — no flicker for empty loads

### Pending Todos

None.

### Blockers/Concerns

- [Phase 14]: Gunicorn preload fork-safety with existing DB connection lifecycle needs experimental validation in staging before production deployment
- [Phase 14]: Memory footprint at production scale (100K edges) needs measurement before committing to networkx — one-day spike recommended at start of Phase 14

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 17-observability 17-02-PLAN.md (per-stage timing display in frontend)
Resume file: None
