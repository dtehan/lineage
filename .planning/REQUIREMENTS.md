# Requirements: Lineage v6.0 Full System Catalog

**Defined:** 2026-02-23
**Core Value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases

## v6.0 Requirements

Requirements for Full System Catalog milestone. Each maps to roadmap phases.

### Metadata Population

- [ ] **POP-01**: User can run populate script with system database exclusion to register all user databases/tables/views/columns in OL_* tables
- [ ] **POP-02**: Teradata system databases (DBC, SysAdmin, SYSLIB, Sys_Calendar, etc.) are excluded from catalog population

### Standalone Rendering

- [ ] **REND-01**: User can view a table with no lineage as a single node with columns in the graph (no error state)
- [ ] **REND-02**: User sees "No lineage connections" informational banner when viewing a table with zero edges
- [ ] **REND-03**: Backend returns valid `{nodes, edges}` response (not error) for tables with no lineage data

### Browser Enhancements

- [ ] **BROW-01**: User can browse all databases and tables in Asset Browser without silent truncation at 1000 items
- [ ] **BROW-02**: User can see a "has lineage" indicator per table distinguishing lineage-connected from catalog-only tables

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Population Enhancements

- **POP-03**: `--catalog-only` flag for populate script to run metadata-only without lineage extraction
- **POP-04**: Configurable `CATALOG_EXCLUDE_DATABASES` env var for different Teradata installs

### Browser Enhancements

- **BROW-03**: Table count badges per database (T: N, V: N) in Asset Browser
- **BROW-04**: Virtual scrolling in Asset Browser for 5000+ table environments

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Show all TableKind types (macros, procedures, triggers) | Code objects, not data assets — cannot have column lineage |
| Auto-populate catalog on server startup | Blocks startup for minutes on large systems |
| Live DBC queries on every browser request | 30-60 second response times; OL_* materialized cache is correct |
| NOPI table distinct visual badge | Low user value unless environment uses many NOPI tables |
| Column-level lineage for tables without DBQL history | No DBQL = no lineage to extract; this is correct behavior |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| POP-01 | Phase 22 | Pending |
| POP-02 | Phase 22 | Pending |
| REND-01 | Phase 23 | Pending |
| REND-02 | Phase 23 | Pending |
| REND-03 | Phase 23 | Pending |
| BROW-01 | Phase 22 | Pending |
| BROW-02 | Phase 23 | Pending |

**Coverage:**
- v6.0 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap creation*
