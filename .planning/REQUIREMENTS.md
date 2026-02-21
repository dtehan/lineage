# Requirements: Lineage v4.0

**Defined:** 2026-02-20
**Core Value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases.

## v4.0 Requirements

Requirements for v4.0 First-Time Load Performance. Each maps to roadmap phases.

### In-Memory Graph Engine

- [ ] **GRAPH-01**: Application loads all active OL_COLUMN_LINEAGE rows into a networkx DiGraph at startup
- [ ] **GRAPH-02**: BFS traversal returns upstream lineage for a given column within <100ms (warm graph)
- [ ] **GRAPH-03**: BFS traversal returns downstream lineage for a given column within <100ms (warm graph)
- [ ] **GRAPH-04**: Bidirectional traversal returns both upstream and downstream lineage within <100ms (warm graph)
- [ ] **GRAPH-05**: Graph engine falls back to existing CTE queries if in-memory graph is unavailable or loading
- [ ] **GRAPH-06**: Graph rebuilds use blue-green swap pattern (build new graph, atomically swap reference) with no downtime
- [ ] **GRAPH-07**: Background warm-up thread initializes graph during app startup without blocking request handling
- [ ] **GRAPH-08**: BFS traversal produces semantically identical results to existing CTE queries (same nodes, edges, transformation types)

### Progressive Depth Loading

- [ ] **PROG-01**: User sees depth-1 lineage graph rendered within 200ms of clicking a column
- [ ] **PROG-02**: Full-depth lineage graph expands from depth-1 view via a second background query
- [ ] **PROG-03**: Graph layout runs only on the final depth slice to prevent layout jitter
- [ ] **PROG-04**: Existing graph nodes remain stable (no position jumping) when deeper levels are added
- [ ] **PROG-05**: Loading progress indicator shows depth-1 complete, then full-depth expanding

### Cache Integration

- [ ] **CACHE-01**: Existing /cache/invalidate endpoint also triggers in-memory graph rebuild
- [ ] **CACHE-02**: Three-layer invalidation verified end-to-end: ETL trigger clears Redis cache AND rebuilds in-memory graph
- [ ] **CACHE-03**: Graph engine serves CTE fallback during rebuild gap (no stale data served from old graph)

### Observability

- [ ] **OBS-01**: API responses include timing headers showing database query time vs in-memory traversal time
- [ ] **OBS-02**: Graph engine exposes metrics endpoint (node count, edge count, last rebuild time, memory usage)
- [ ] **OBS-03**: Frontend loading progress displays per-stage timing (fetch, layout, render)

### Redis Serialization

- [ ] **REDIS-01**: In-memory graph is serialized to Redis after successful warm-up
- [ ] **REDIS-02**: On cold restart, graph restores from Redis serialization before falling back to Teradata query
- [ ] **REDIS-03**: Redis-restored graph serves requests within <1s of app restart

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Performance Validation

- **PERF-01**: Automated CI benchmarking and regression detection
- **PERF-02**: Production load testing with concurrent graph viewers

### Deployment

- **DEPLOY-01**: Multi-worker Gunicorn support with shared graph state
- **DEPLOY-02**: Gevent worker support for SSE streaming connections

## Out of Scope

| Feature | Reason |
|---------|--------|
| SSE streaming endpoint | Incompatible with sync Gunicorn workers; polling achieves same UX with zero infrastructure risk |
| Multi-worker shared graph | Single-worker + threads sufficient for current deployment; adds Redis Pub/Sub complexity |
| Canvas-based rendering | React Flow handles 200-node graphs fine; canvas rewrite only needed at 1000+ nodes |
| Data normalization (TRIM removal) | Low impact vs in-memory engine; can be done independently later |
| networkx → plain dict migration | Chose networkx for maintainability; optimize only if memory becomes an issue in production |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRAPH-01 | — | Pending |
| GRAPH-02 | — | Pending |
| GRAPH-03 | — | Pending |
| GRAPH-04 | — | Pending |
| GRAPH-05 | — | Pending |
| GRAPH-06 | — | Pending |
| GRAPH-07 | — | Pending |
| GRAPH-08 | — | Pending |
| PROG-01 | — | Pending |
| PROG-02 | — | Pending |
| PROG-03 | — | Pending |
| PROG-04 | — | Pending |
| PROG-05 | — | Pending |
| CACHE-01 | — | Pending |
| CACHE-02 | — | Pending |
| CACHE-03 | — | Pending |
| OBS-01 | — | Pending |
| OBS-02 | — | Pending |
| OBS-03 | — | Pending |
| REDIS-01 | — | Pending |
| REDIS-02 | — | Pending |
| REDIS-03 | — | Pending |

**Coverage:**
- v4.0 requirements: 22 total
- Mapped to phases: 0
- Unmapped: 22 ⚠️

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after initial definition*
