# Phase 7: Core Wildcard Expansion + Metadata Caching - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand simple wildcards (`SELECT *`) to actual column names by querying Teradata metadata. Handles single-table sources with batch metadata fetching to enable accurate column-level lineage extraction.

**In scope:**
- Wildcard detection in SQL queries (`SELECT *`)
- Column name expansion via Teradata metadata (DBC views)
- Batch metadata caching strategy
- Confidence scoring for expanded lineage (0.70 vs 0.95)
- INSERT INTO...SELECT * ordinal position matching
- CREATE TABLE AS SELECT * column name derivation

**Out of scope (later phases):**
- Qualified wildcards (SELECT t1.*, t2.*) - Phase 8
- View expansion - Phase 9

</domain>

<decisions>
## Implementation Decisions

### Metadata Collection Integration
- **Integrate view column type fetching in the same pass as other metadata collection**
- Extend existing `populate_lineage.py` flow to handle view column types
- Already collecting database, table, and column names - this fills the gap on view column types

### Column Type Sources
- **Primary source:** DBC.ColumnsJQV (already in use for view information)
- **Known issue:** Sometimes ColumnsJQV data is not available (QVCI disabled, ClearScape limitations)

### Fallback Strategy
When column type information is unavailable from ColumnsJQV:
1. **First fallback:** Use `SHOW VIEW` to deduce column types from view definition
2. **Last resort:** Mark column type as `UNKNOWN` or `NULL`

**Do NOT:**
- Skip wildcard expansion entirely (always expand even if type unknown)
- Fail the entire lineage extraction on missing metadata

### Claude's Discretion
- Query batching approach (per-database vs paginated batches vs single large query)
- Optimal batch size to avoid Teradata query limits
- Connection pooling and reuse strategy
- Exact caching duration and invalidation logic
- Performance tuning of metadata queries

</decisions>

<specifics>
## Specific Ideas

- Leverage existing populate_lineage.py infrastructure - don't reinvent metadata collection
- SHOW VIEW fallback matches archived approach that was working before
- Graceful degradation over hard failures - always prefer partial lineage over no lineage

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-core-wildcard-expansion-metadata-caching*
*Context gathered: 2026-02-18*
