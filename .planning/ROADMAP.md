# Roadmap: Lineage - Wildcard Expansion

## Milestones

- ✅ **v1.0 Code Quality & Missing Features** - Phases 1-3 (shipped 2026-02-15)
- ✅ **v2.0 Performance Optimization** - Phases 4-6 (shipped 2026-02-16)
- ✅ **v3.0 Wildcard Expansion** - Phases 7-9 (shipped 2026-02-19)

## Phases

<details>
<summary>✅ v1.0 Code Quality & Missing Features (Phases 1-3) - SHIPPED 2026-02-15</summary>

### Phase 1: Impact Analysis Implementation
**Goal**: Implement complete downstream impact visualization feature
**Plans**: 4 plans (complete)

### Phase 2: Exception Handling & Observability
**Goal**: Implement structured exception handling and production logging
**Plans**: 4 plans (complete)

### Phase 3: Architecture Refactoring
**Goal**: Extract shared CTE logic and refactor backend into service/repository layers
**Plans**: 4 plans (complete)

</details>

<details>
<summary>✅ v2.0 Performance Optimization (Phases 4-6) - SHIPPED 2026-02-16</summary>

### Phase 4: Database Query Optimization
**Goal**: Optimize CTE query performance with composite indexes, statistics, and LOCKING hints
**Plans**: 3 plans (complete)

### Phase 5: Frontend Rendering Performance
**Goal**: Eliminate UI freeze during graph layout by offloading to Web Worker
**Plans**: 3 plans (complete)

### Phase 6: Redis Caching Layer
**Goal**: Implement cache-aside pattern with stampede prevention and ETL integration
**Plans**: 2 plans (complete)

</details>

### ✅ v3.0 Wildcard Expansion (Shipped 2026-02-19)

**Milestone Goal:** Enable complete column-level lineage capture for SQL queries using wildcard syntax

#### Phase 7: Core Wildcard Expansion + Metadata Caching
**Goal**: Expand simple wildcards to actual column names with batch metadata caching
**Depends on**: Nothing (first phase of milestone)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08
**Success Criteria** (what must be TRUE):
  1. Queries with `SELECT *` from single-table sources extract lineage to all actual columns
  2. INSERT INTO...SELECT * statements create lineage using ordinal position matching (1st→1st, 2nd→2nd)
  3. CREATE TABLE AS SELECT * statements derive target column names from source expressions
  4. Metadata queries execute once per unique table (batch mode), not once per query occurrence
  5. Wildcard-expanded lineage records display confidence score 0.70 (vs 0.95 for explicit columns)
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md -- WildcardResolver module with batch metadata caching
- [ ] 07-02-PLAN.md -- SQL parser wildcard expansion + DBQLExtractor integration
- [ ] 07-03-PLAN.md -- Comprehensive tests for wildcard expansion (TDD)

#### Phase 8: Qualified Wildcards + Schema Evolution
**Goal**: Handle qualified wildcards in multi-table queries with schema change detection
**Depends on**: Phase 7
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06
**Success Criteria** (what must be TRUE):
  1. Queries with qualified wildcards (SELECT t1.*, t2.*) extract lineage to correct table columns
  2. Multi-table queries with multiple qualified wildcards resolve each to proper table aliases
  3. Schema evolution (column count changes) detected and logged with warning messages
  4. Each wildcard expansion logged with table name, column count, and timestamp for audit trail
  5. Individual wildcard expansion failures gracefully degrade (skip wildcard, continue with explicit columns)
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md -- Qualified wildcard expansion + schema evolution detection
- [x] 08-02-PLAN.md -- Comprehensive tests for qualified wildcards + schema evolution (TDD)

#### Phase 9: View Expansion
**Goal**: Recursively expand wildcards in view definitions for transitive lineage
**Depends on**: Phase 8
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05
**Success Criteria** (what must be TRUE):
  1. View references in queries detected via DBC.TablesV.TableKind metadata
  2. View definitions retrieved and parsed from DBC.TablesV.RequestText column
  3. Wildcards in view definitions recursively expanded up to depth limit (3 levels)
  4. Expanded view schemas cached for reuse across multiple query extractions
  5. Circular view references detected and logged as errors (no infinite recursion)
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md -- View detection, definition retrieval, recursive expansion in WildcardResolver
- [x] 09-02-PLAN.md -- Comprehensive tests for view expansion (TDD)

## Progress

**Execution Order:**
Phases execute in numeric order: 7 → 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Impact Analysis | v1.0 | 4/4 | Complete | 2026-02-15 |
| 2. Exception Handling | v1.0 | 4/4 | Complete | 2026-02-15 |
| 3. Architecture Refactoring | v1.0 | 4/4 | Complete | 2026-02-15 |
| 4. Database Optimization | v2.0 | 3/3 | Complete | 2026-02-16 |
| 5. Frontend Performance | v2.0 | 3/3 | Complete | 2026-02-16 |
| 6. Redis Caching | v2.0 | 2/2 | Complete | 2026-02-16 |
| 7. Core Wildcard Expansion | v3.0 | 3/3 | Complete | 2026-02-19 |
| 8. Qualified Wildcards | v3.0 | 2/2 | Complete | 2026-02-19 |
| 9. View Expansion | v3.0 | 2/2 | Complete | 2026-02-19 |

### Phase 10: View lineage - show data flow through views to source tables

**Goal:** Surface views as visible intermediate nodes in lineage graphs by propagating sourceType through column and table lineage endpoints
**Depends on:** Phase 9
**Plans:** 2 plans

Plans:
- [x] 10-01-PLAN.md -- Add sourceType propagation to column/table lineage endpoints + unit tests
- [ ] 10-02-PLAN.md -- Add view-chain test data (CREATE VIEW DDL, lineage fixtures, VIEW metadata)
