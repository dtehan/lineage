# Requirements: Lineage - Wildcard Expansion

**Defined:** 2026-02-18
**Core Value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases

## v3.0 Requirements

Requirements for wildcard expansion in SQL lineage extraction. Each maps to roadmap phases.

### Core Wildcard Expansion

- [ ] **CORE-01**: System expands simple `SELECT *` to actual column names using table metadata
- [ ] **CORE-02**: System matches columns by ordinal position (1st→1st, 2nd→2nd) for `INSERT INTO...SELECT *` statements
- [ ] **CORE-03**: System derives target column names from source for `CREATE TABLE AS SELECT *` statements
- [ ] **CORE-04**: System batch-queries and caches table metadata to prevent N+1 query performance trap
- [ ] **CORE-05**: System assigns confidence score 0.70 to wildcard-expanded lineage (vs 0.95 for explicit columns)
- [ ] **CORE-06**: System handles case-insensitive Teradata identifier matching during metadata resolution
- [ ] **CORE-07**: System detects and skips multi-table unqualified `SELECT *` with warning (ambiguous table attribution)
- [ ] **CORE-08**: System sets CTE/subquery expansion depth limit (5 levels) with cycle detection

### Qualified Wildcards

- [ ] **QUAL-01**: System expands qualified wildcards (`SELECT t1.*`) using table alias resolution
- [ ] **QUAL-02**: System handles multi-table queries with multiple qualified wildcards (`SELECT t1.*, t2.*`)
- [ ] **QUAL-03**: System detects schema evolution (column count changes) and logs warnings
- [ ] **QUAL-04**: System logs each wildcard expansion (table, column count, timestamp) for audit trail
- [ ] **QUAL-05**: System continues extraction when individual wildcard expansion fails (graceful degradation)
- [ ] **QUAL-06**: System detects positional ORDER BY references and skips with warning

### View Expansion

- [ ] **VIEW-01**: System detects view references in queries (via DBC.TablesV.TableKind)
- [ ] **VIEW-02**: System retrieves and parses view definitions from DBC.TablesV.RequestText
- [ ] **VIEW-03**: System recursively expands wildcards in view definitions with depth limit (3 levels)
- [ ] **VIEW-04**: System caches expanded view schemas for reuse across queries
- [ ] **VIEW-05**: System detects circular view references and logs errors

## v4.0 Requirements

Deferred to future release. Tracked but not in current roadmap.

### BigQuery Compatibility

- **BQRY-01**: System supports `SELECT * EXCEPT (column)` syntax for BigQuery-compatible lineage
- **BQRY-02**: System supports `SELECT * REPLACE (expr AS column)` syntax

### Schema Versioning

- **SCHM-01**: System tracks schema versions with timestamps for historical accuracy
- **SCHM-02**: System reconstructs historical schemas for queries executed in the past
- **SCHM-03**: System flags lineage with schema version mismatches

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time wildcard expansion during query execution | Adds latency to queries; extraction is batch process |
| Auto-fix column mismatches | Guessing creates incorrect lineage; fail fast instead |
| Name-based column matching for INSERT INTO | Violates SQL standard (ordinal position is correct) |
| Cross-database wildcard resolution | Edge case; most queries single-database; adds complexity |
| DBC.ColumnsV metadata source | Returns NULL for view column types; DBC.ColumnsJQV required |
| SELECT * EXCEPT for v3.0 | BigQuery-specific, not Teradata native; defer to v4.0 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | TBD | Pending |
| CORE-02 | TBD | Pending |
| CORE-03 | TBD | Pending |
| CORE-04 | TBD | Pending |
| CORE-05 | TBD | Pending |
| CORE-06 | TBD | Pending |
| CORE-07 | TBD | Pending |
| CORE-08 | TBD | Pending |
| QUAL-01 | TBD | Pending |
| QUAL-02 | TBD | Pending |
| QUAL-03 | TBD | Pending |
| QUAL-04 | TBD | Pending |
| QUAL-05 | TBD | Pending |
| QUAL-06 | TBD | Pending |
| VIEW-01 | TBD | Pending |
| VIEW-02 | TBD | Pending |
| VIEW-03 | TBD | Pending |
| VIEW-04 | TBD | Pending |
| VIEW-05 | TBD | Pending |

**Coverage:**
- v3.0 requirements: 19 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 19 ⚠️

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
