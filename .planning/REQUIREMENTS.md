# Requirements: Lineage Application

**Defined:** 2026-01-31
**Core Value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.

## v3.0 Requirements (Graph Improvements)

Requirements for enhancing lineage graph usability, correctness, and performance.

### Graph UX - Loading Experience

- [ ] **UX-LOAD-01**: User sees progress bar (0-100%) during graph loading
- [ ] **UX-LOAD-02**: User sees current stage text ("Loading data...", "Calculating layout...", "Rendering...")
- [ ] **UX-LOAD-03**: Progress indicator replaces current spinner
- [ ] **UX-LOAD-04**: Progress tracking covers data fetch, ELK layout, and React Flow render stages

### Graph UX - Viewport & Zoom

- [ ] **UX-VIEW-01**: Graph initial viewport positioned at top-left (not centered)
- [ ] **UX-VIEW-02**: Small graphs (<20 nodes) zoom to readable text size
- [ ] **UX-VIEW-03**: Large graphs (>50 nodes) fit more nodes on screen with smaller zoom
- [ ] **UX-VIEW-04**: Zoom level balances readability and content visibility
- [ ] **UX-VIEW-05**: User can manually adjust zoom after initial fit

### Graph UX - Space Optimization

- [ ] **UX-SPACE-01**: Node spacing reduced between tables (minimize gaps)
- [ ] **UX-SPACE-02**: Layout algorithm configured for compact arrangement
- [ ] **UX-SPACE-03**: Column text remains readable at optimized spacing
- [ ] **UX-SPACE-04**: Scrolling required only for genuinely large graphs

### Graph Correctness - Test Data

- [ ] **CORRECT-DATA-01**: Test data includes 3+ cycle patterns (2-node, 3-node, 5-node cycles)
- [ ] **CORRECT-DATA-02**: Test data includes 3+ diamond patterns (simple, nested, wide diamonds)
- [ ] **CORRECT-DATA-03**: Test data includes fan-out patterns (1→5, 1→10 targets)
- [ ] **CORRECT-DATA-04**: Test data includes fan-in patterns (5→1, 10→1 sources)
- [ ] **CORRECT-DATA-05**: Test data includes combined patterns (cycle+diamond, fan-out+fan-in)

### Graph Correctness - Validation

- [ ] **CORRECT-VAL-01**: Integration tests verify cycle detection prevents infinite loops
- [ ] **CORRECT-VAL-02**: Tests verify diamond patterns produce single node (no duplication)
- [ ] **CORRECT-VAL-03**: Tests verify fan-out patterns include all target nodes
- [ ] **CORRECT-VAL-04**: Tests verify fan-in patterns include all source nodes
- [ ] **CORRECT-VAL-05**: Tests verify path tracking in CTE works for complex patterns
- [ ] **CORRECT-VAL-06**: Tests verify node count matches expected for each pattern
- [ ] **CORRECT-VAL-07**: Tests verify edge count matches expected for each pattern

### Graph Performance - CTE Optimization

- [ ] **PERF-CTE-01**: Benchmark recursive CTE at depths 5, 10, 15, 20
- [ ] **PERF-CTE-02**: Profile identifies performance bottlenecks (path concat, POSITION search)
- [ ] **PERF-CTE-03**: Implementation optimizes identified bottlenecks
- [ ] **PERF-CTE-04**: Performance tests verify improvement at depth > 10
- [ ] **PERF-CTE-05**: Query hints added for Teradata optimization (if beneficial)

### Graph Performance - Frontend Rendering

- [ ] **PERF-RENDER-01**: Benchmark ELK.js layout time with 50, 100, 200 node graphs
- [ ] **PERF-RENDER-02**: Benchmark React Flow render time with 50, 100, 200 node graphs
- [ ] **PERF-RENDER-03**: Identify rendering bottlenecks (layout, node creation, edge rendering)
- [ ] **PERF-RENDER-04**: Verify `onlyRenderVisibleElements` threshold optimization
- [ ] **PERF-RENDER-05**: Test zoom/pan responsiveness with large graphs (target <100ms)
- [ ] **PERF-RENDER-06**: Performance tests automated and repeatable

## Future Milestones

Requirements deferred beyond v3.0.

### Additional Graph Features

- **GRAPH-EXPORT-01**: Export graph as PNG/SVG
- **GRAPH-FILTER-01**: Filter graph by transformation type
- **GRAPH-SEARCH-01**: Search/highlight within graph
- **GRAPH-LEGEND-01**: Enhanced legend with pattern explanations

### Additional Performance Work

- **PERF-REDIS-01**: Integrate Redis caching for lineage responses
- **PERF-POOL-01**: Configure connection pooling for database
- **PERF-INDEX-01**: Add secondary indexes for search performance

### Additional Quality Work

- **QUAL-PARSER-01**: Improve SQL parser with confidence tracking
- **QUAL-EXTRACT-01**: Harden database extraction against version changes
- **QUAL-E2E-01**: End-to-end lineage validation through multiple hops
- **QUAL-VAULT-01**: Integrate with secrets vault

## Out of Scope

Explicitly excluded from v3.0 milestone.

| Feature | Reason |
|---------|--------|
| Real-time progress from backend | Frontend progress tracking sufficient for UX; backend streaming adds complexity |
| Cursor-based pagination for graphs | Graphs are snapshot-based, not paginated; defer to future if needed |
| Graph editing capabilities | Read-only lineage visualization is core value; editing deferred |
| 3D or alternative layouts | React Flow 2D layout proven sufficient; no user demand for alternatives |
| Mobile-optimized graph view | Desktop-first application; mobile optimization deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (To be filled by roadmapper) | | |

**Coverage:**
- v3.0 requirements: 33 total
- Mapped to phases: (pending)
- Unmapped: (pending)

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-01-31 after initial definition*
