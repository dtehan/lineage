# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** Draggable minimap viewport feature

## Current Position

Phase: 01-draggable-minimap-viewport
Plan: 01 complete (1/1 plans done)
Status: In progress
Last activity: 2026-02-22 — completed 01-01 interactive minimap plan

Progress: [██████████] 100% (18/18 prior milestone phases complete)

v1.0: ██████████ 100% (3/3 phases) — shipped 2026-02-15
v2.0: ██████████ 100% (3/3 phases) — shipped 2026-02-16
v3.0: ██████████ 100% (7/7 phases) — shipped 2026-02-19
v4.0: ██████████ 100% (5/5 phases) — shipped 2026-02-21
Draggable Minimap: ██████████ 100% (1/1 plans) — in progress 2026-02-22

## Performance Metrics

**Velocity:**
- Total plans completed: 37 (v1.0: 12, v2.0: 8, v3.0: 7, v4.0: 9, draggable-minimap: 1)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Code Quality | 3 | 12 | Shipped 2026-02-15 |
| v2.0 Performance | 3 | 8 | Shipped 2026-02-16 |
| v3.0 Wildcard Expansion | 7 | 7 | Shipped 2026-02-19 |
| v4.0 First-Time Load | 5 | 9 | Shipped 2026-02-21 |
| Draggable Minimap Viewport | 1 | 1 | In progress 2026-02-22 |

## Accumulated Context

### Pending Todos

None.

### Roadmap Evolution

- Phase 1 added: Draggable Minimap Viewport

### Key Decisions (01-draggable-minimap-viewport)

- nodeColor is the only prop on LineageMiniMap - all other minimap props are fixed interactive defaults
- CSS class hook (.lineage-minimap--interactive) used for grab cursor because React Flow does not add cursor styles when pannable={true}
- maskStrokeColor=#3b82f6 (blue) on viewport indicator signals draggability matching app primary color

### Blockers/Concerns

None active. Previous concerns resolved:
- Gunicorn preload fork-safety: validated via daemon thread warmup pattern
- Memory footprint: psutil RSS monitoring built into graph status endpoint

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 01-draggable-minimap-viewport/01-01-PLAN.md
Resume file: None
