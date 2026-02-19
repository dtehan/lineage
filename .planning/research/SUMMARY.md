# Project Research Summary

**Project:** SQL Wildcard Expansion for Column-Level Lineage
**Domain:** Data lineage extraction - SQL parser enhancement
**Researched:** 2026-02-18
**Confidence:** HIGH

## Executive Summary

SQL wildcard expansion (`SELECT *`, `SELECT t.*`) is essential for complete column-level lineage extraction from DBQL queries. Currently, the Teradata lineage application skips queries with wildcards, resulting in 30-50% incomplete lineage coverage for JOIN-heavy workloads. Research confirms that wildcard expansion is achievable with **zero new dependencies** by extending SQLGlot's existing optimizer module (`sqlglot.optimizer.qualify`) and leveraging the existing DBC.ColumnsJQV metadata queries already used in the codebase.

The recommended approach involves three integration points: (1) metadata caching via a new `WildcardResolver` class that batch-queries DBC.ColumnsJQV for all referenced tables, (2) AST-level wildcard expansion in `TeradataSQLParser._extract_select_columns()` using SQLGlot's `qualify()` function with `expand_stars=True`, and (3) dependency injection to preserve testability. This design adds <5 MB memory overhead and <1ms per-query latency when metadata is cached, with a one-time 0.5-2 second batch metadata query cost.

Critical risks include stale metadata (current schema doesn't match historical query execution), N+1 metadata query anti-patterns (solved via batch caching), and ambiguous multi-table wildcards (mitigated by detecting and skipping unqualified `SELECT *` in JOINs during Phase 1). The phased approach allows incremental validation: Phase 1 handles simple wildcards with comprehensive metadata caching, Phase 2 adds qualified wildcards (`t.*`) and schema evolution warnings, and Phase 3 tackles advanced patterns like view expansion and CTE recursion.

## Key Findings

### Recommended Stack

SQLGlot (>=28.0.0) provides mature wildcard expansion via the `sqlglot.optimizer.qualify()` function with built-in schema catalog support through `MappingSchema`. The codebase already uses SQLGlot >=25.0.0, requiring only a minor version upgrade. DBC.ColumnsJQV (already in use for `populate_openlineage_fields()`) provides complete column metadata including views via QVCI.

**Core technologies:**
- **SQLGlot >=28.0.0**: AST parsing + optimizer for star expansion — native feature, zero additional dependencies, handles all wildcard patterns with schema context
- **sqlglot.optimizer.qualify**: Normalize and expand `SELECT *` to column lists — official SQLGlot API with `expand_stars=True` parameter
- **sqlglot.schema.MappingSchema**: In-memory schema catalog for wildcard expansion — lightweight dict-based representation, supports 3-level hierarchy (catalog.database.table.column)
- **DBC.ColumnsJQV**: Teradata system view for column metadata — already in use, requires QVCI enabled, provides column order for correct expansion sequence

**Critical dependencies:**
- QVCI (Queryable View Column Index) must be enabled on Teradata system (already documented in CLAUDE.md)
- Python >=3.9 (SQLGlot 28.x requirement)

**What NOT to use:**
- DBC.ColumnsV (returns NULL for view column types)
- Custom regex/string parsing (breaks on complex queries)
- HELP COLUMN commands (legacy, slow, N queries per table)
- Persistent schema database (adds complexity, staleness issues)

### Expected Features

Wildcard expansion falls into five categories: simple wildcards (table stakes), qualified wildcards (competitive advantage), INSERT INTO ordinal matching (critical for correctness), CTAS name derivation (simpler pattern), and SELECT * EXCEPT (BigQuery-specific, defer to v2+).

**Must have (table stakes):**
- **Simple SELECT * expansion** — Core SQL pattern, users expect all lineage tools to handle this. Requires schema lookup from OL_DATASET_FIELD, position-based matching.
- **INSERT INTO...SELECT * ordinal matching** — Critical: columns matched by POSITION (1st to 1st, 2nd to 2nd), NOT by name. SQL standard behavior. Name-based matching creates incorrect lineage.
- **CREATE TABLE AS SELECT * name derivation** — Target column names inherit source names (or aliases). Standard DDL pattern, simpler than INSERT as target schema is defined by query.
- **Confidence scoring** — Wildcards inherently less certain than explicit columns. Use 0.70 for wildcard-expanded lineage vs 0.95 for explicit references.

**Should have (competitive):**
- **Qualified wildcards (t.*)** — Essential for multi-table queries with JOINs. Requires table alias resolution (already exists in `TeradataSQLParser._table_aliases`). Differentiates t1.* from t2.* in same query.
- **Schema evolution warnings** — Alert when source table column count changed since last extraction. Tracks metadata staleness, prevents incorrect lineage after schema changes.
- **Wildcard expansion auditing** — Log each wildcard expansion (table, column count, timestamp). Debugging aid for lineage gaps.
- **Partial failure handling** — Continue extraction when some wildcards fail to expand. Graceful degradation better than all-or-nothing.

**Defer (v2+):**
- **SELECT * EXCEPT support** — BigQuery extension, not ANSI SQL or Teradata native. High complexity (custom AST handling). Low value for Teradata-focused lineage.
- **Cross-database wildcard resolution** — Edge case, most queries single-database.
- **Historical schema reconstruction** — Requires schema versioning system. Current snapshot approach sufficient for most use cases.

**Anti-features (avoid):**
- Real-time wildcard expansion during query execution (adds latency, external dependency)
- Auto-fix column mismatches (guessing creates incorrect lineage)
- Wildcard expansion without schema metadata (impossible to be accurate)
- Name-based column matching for INSERT INTO (violates SQL standard)

### Architecture Approach

Wildcard expansion integrates at the AST traversal phase in `TeradataSQLParser._extract_select_columns()`, replacing the current `continue` statement that skips wildcards. A new `WildcardResolver` class handles metadata queries and caching, injected into the parser via dependency injection to preserve testability.

**Major components:**
1. **WildcardResolver (new)** — Queries DBC.ColumnsJQV for column lists, caches results in-memory per (database, table) key. Batch-queries all tables referenced in DBQL queries upfront to avoid N+1 pattern.
2. **TeradataSQLParser (modified)** — Accepts optional `wildcard_resolver` parameter in constructor. When encountering `exp.Star` nodes, calls `resolver.resolve_star(db, table)` and expands to column list in AST.
3. **DBQLExtractor (modified)** — Creates `WildcardResolver` with cursor, passes to parser. Handles resolver lifecycle per extraction run.

**Data flow:**
```
1. DBQLExtractor fetches queries from DBQL
2. Build schema catalog: batch query DBC.ColumnsJQV for all referenced tables
3. Create WildcardResolver with schema cache
4. For each query: parser expands wildcards via resolver during AST traversal
5. Lineage mapping proceeds with expanded columns
6. Insert to OL_COLUMN_LINEAGE (same format as explicit columns)
```

**Key patterns:**
- **Dependency Injection** — Optional `wildcard_resolver` parameter preserves backward compatibility and testability (unit tests without database)
- **Cache-Aside with Dictionary** — In-memory cache reduces queries from O(queries × tables) to O(unique tables), acceptable 5 MB memory overhead
- **Qualified vs Unqualified Handling** — `SELECT t.*` explicit (resolve directly), `SELECT *` inferred (require single table in FROM or skip)

**Project structure:**
- `database/scripts/populate/wildcard_resolver.py` (NEW)
- `database/scripts/populate/dbql_extractor.py` (MODIFIED: instantiate resolver)
- `lineage-api/utils/sql_parser.py` (MODIFIED: add wildcard expansion logic)

### Critical Pitfalls

Research identified 8 critical pitfalls ranked by impact and likelihood. The top 3 must be addressed in Phase 1.

1. **Stale Metadata (CRITICAL - Phase 1 document, Phase 3 fix)** — Current schema doesn't match historical query execution. You expand `SELECT *` using today's columns, but SQL ran weeks ago when table had different structure. **Avoid:** Accept lower confidence (0.70 for wildcards), document limitation clearly. Phase 3: add schema versioning with timestamp tracking.

2. **N+1 Metadata Query Performance Trap (CRITICAL - Phase 1 mandatory)** — Querying DBC.ColumnsJQV separately for each `SELECT *` occurrence. With 1000 queries across 50 unique tables, this creates 1000+ metadata round-trips (extraction takes 20 minutes instead of 30 seconds). **Avoid:** Two-pass extraction: (1) collect unique table references from all queries, (2) batch query metadata with `IN (...)` clause, (3) cache in-memory, (4) expand wildcards using cache. NOT an optimization—this is a correctness requirement at scale.

3. **Ambiguous Table References (HIGH - Phase 1 detect/skip, Phase 2 fix)** — Unqualified `SELECT * FROM t1 JOIN t2` is table-ambiguous. Can't determine which columns came from which table. **Avoid:** Phase 1: detect multi-table context, skip unqualified wildcards, log warning. Phase 2: add qualified wildcard support (`SELECT t1.*, t2.*`).

4. **CTE and Subquery Wildcard Depth Explosion (HIGH - Phase 1 limit)** — Nested CTEs with wildcards require recursive expansion. 10-level CTE chains cause exponential complexity or stack overflow. **Avoid:** Set depth limit (5 levels), add cycle detection for recursive CTEs.

5. **View Definition Wildcards (MEDIUM - Phase 3)** — Views with `SELECT *` in definition require transitive expansion. Lineage stops at view boundary without recursive parsing. **Avoid:** Phase 1: treat views like tables, document limitation. Phase 3: parse view definitions from DBC.TablesV.RequestText, expand recursively with depth limits.

## Implications for Roadmap

Based on research, wildcard expansion should be implemented in 3 phases over 5-7 day timeline. Phase structure prioritizes rapid validation with production data while deferring complex edge cases.

### Phase 1: Core Wildcard Expansion + Metadata Caching (3-4 days)

**Rationale:** Handles 60-70% of wildcard patterns (simple SELECT *, INSERT INTO ordinal matching, CTAS) with mandatory performance foundation (metadata caching). Delivers immediate value by unblocking lineage extraction for single-table wildcard queries.

**Delivers:**
- Simple `SELECT *` expansion from single-table queries
- INSERT INTO ordinal position matching (SQL standard behavior)
- CREATE TABLE AS name derivation
- Batch metadata query + in-memory caching (prevents N+1 trap)
- Confidence scoring (0.70 for wildcards)
- Case normalization for Teradata identifiers

**Addresses features:**
- Simple SELECT * expansion (table stakes)
- INSERT INTO...SELECT * ordinal matching (table stakes)
- CTAS name derivation (table stakes)
- Confidence scoring (table stakes)

**Avoids pitfalls:**
- N+1 metadata queries (MANDATORY - batch caching required from start)
- Case sensitivity mismatch (normalize on metadata lookup)
- Stale metadata (document limitation, use confidence penalty)
- CTE depth explosion (set depth limit = 5, add cycle detection)
- EXCLUDE/EXCEPT syntax (detect and skip with warning)

**Technical work:**
1. Create `WildcardResolver` class with batch metadata query + caching
2. Modify `TeradataSQLParser.__init__()` for optional resolver injection
3. Add `_expand_wildcards()` method using sqlglot.optimizer.qualify
4. Modify `DBQLExtractor.extract_lineage()` to instantiate resolver
5. Add unit tests with mock resolver
6. Add integration tests with real DBC.ColumnsJQV queries

**Success criteria:**
- Metadata cache hit rate >80% after first 100 queries
- Extraction time increase <5% for queries with cached wildcards
- Zero metadata queries after cache warm-up
- Queries with unqualified multi-table `SELECT *` logged and skipped

### Phase 2: Qualified Wildcards + Schema Evolution (2-3 days)

**Rationale:** Handles remaining 30% of wildcard patterns (qualified t.*, multi-table queries) and adds production robustness (schema change detection, partial failures). Depends on Phase 1 validation with real DBQL data.

**Delivers:**
- Qualified wildcard expansion (`SELECT t1.*, t2.*`)
- Multi-table query support with table alias resolution
- Schema evolution warnings (column count mismatches)
- Wildcard expansion auditing (log table, columns, timestamp)
- Partial failure handling (continue on metadata errors)
- Positional ORDER BY detection (skip with warning)

**Addresses features:**
- Qualified wildcards (differentiator)
- Schema evolution warnings (differentiator)
- Wildcard expansion auditing (differentiator)
- Partial failure handling (differentiator)

**Avoids pitfalls:**
- Ambiguous table references (qualified wildcards resolve ambiguity)
- Wildcard + positional ORDER BY (detect, skip, log)

**Technical work:**
1. Extend `_expand_wildcards()` for qualified stars (`expr.table` attribute)
2. Add table alias resolution from existing `_table_aliases` map
3. Add schema timestamp tracking + staleness warnings
4. Add per-wildcard try/catch for graceful degradation
5. Add expansion audit logging

**Success criteria:**
- Queries with `SELECT t1.*, t2.*` extract correctly
- Schema mismatches flagged with confidence 0.50 (vs 0.70)
- Metadata failures skip wildcard but continue extracting explicit columns

### Phase 3: Advanced Patterns - View Expansion (2 days, OPTIONAL)

**Rationale:** Handles edge cases (view transitive lineage, CTE recursion) identified as lower priority during research. Only implement if Phase 1-2 validation reveals high demand for view-level lineage. May be deferred to v2.0 if users satisfied with view-as-table boundary.

**Delivers:**
- View definition parsing from DBC.TablesV.RequestText
- Recursive view expansion with depth limits
- Transitive lineage through view layers (base_table → view → target)

**Addresses pitfalls:**
- View definition wildcards (transitive expansion)

**Technical work:**
1. Add view detection (DBC.TablesV.TableKind = 'V')
2. Query and parse view definitions (RequestText)
3. Recursive wildcard expansion with depth limit = 3 for views
4. Cache expanded view schemas

**Success criteria:**
- Lineage for views shows base table sources (not just view boundary)
- Recursive view chains handled up to depth 3
- Circular view references detected and logged

### Phase Ordering Rationale

**Why this order:**
1. **Phase 1 before Phase 2 before Phase 3:** Dependency-based ordering. Qualified wildcards (Phase 2) build on simple wildcard expansion (Phase 1). View expansion (Phase 3) requires stable wildcard expansion foundation.

2. **Metadata caching mandatory in Phase 1:** N+1 pitfall is not an optimization concern—it's a correctness issue. Without batch caching, extraction is unusable at production scale (1000+ queries).

3. **Qualified wildcards in Phase 2 (not Phase 1):** Simple wildcards cover 60-70% of patterns and allow rapid validation. Qualified wildcards add complexity (alias resolution, multi-table coordination) that should be tackled after core pattern validates.

4. **View expansion optional in Phase 3:** Research shows view expansion is complex (recursive parsing, depth limits, circular references) and only valuable if users demand transitive lineage through views. Phase 1-2 deliver complete functionality for table-level lineage, allowing product decision on whether view expansion ROI justifies complexity.

**Dependencies discovered:**
- Qualified wildcards depend on simple wildcard expansion
- Schema evolution warnings require timestamp tracking infrastructure
- View expansion requires recursive parsing with cycle detection

**Pitfall avoidance:**
- Phase 1 includes metadata caching (avoids N+1 trap)
- All phases include depth limits (avoids recursion explosion)
- Each phase logs skipped patterns (transparency for users)

**Compounding benefits:**
- Phase 1 unlocks 60-70% of wildcard patterns
- Phase 2 unlocks remaining 30% + adds robustness
- Phase 3 enables transitive lineage through views

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (View Expansion):** SQLGlot Antiselect parsing support UNKNOWN. Teradata uses `Antiselect` function (not `SELECT * EXCEPT`). Need to test if sqlglot.parse_one() recognizes this syntax before implementing.

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** SQLGlot star expansion verified with official docs. DBC.ColumnsJQV already in use. Integration points clear from codebase analysis.
- **Phase 2:** Table alias resolution already implemented in `_table_aliases`. Schema evolution is standard metadata comparison pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SQLGlot star expansion verified with API docs and GitHub source. DBC.ColumnsJQV already in production use. Zero new dependencies. Version upgrade (25 → 28) is backward compatible. |
| Features | HIGH | Feature categories validated against DataHub, Metaplane, and sqllineage implementations. SQL standard behavior (ordinal matching) verified with W3Schools and PostgreSQL docs. MVP definition aligns with table stakes identified across sources. |
| Architecture | HIGH | Integration points verified in existing codebase (`sql_parser.py` line 424-478, `dbql_extractor.py`). Dependency injection pattern standard. Cache-aside with dict well-established. Performance estimates based on measured DBC query latency (10-50ms). |
| Pitfalls | HIGH | Stale metadata, N+1 queries, ambiguous wildcards validated in DataHub blog, Metaplane blog, and academic paper (LineageX). CTE depth issues documented in PostgreSQL and SQLServer sources. View expansion complexity confirmed via Teradata DBC documentation. |

**Overall confidence:** HIGH

All core recommendations backed by official documentation (SQLGlot API, Teradata DBC views) and verified implementations (DataHub uses identical approach). The existing codebase provides concrete integration points, eliminating architectural uncertainty. Performance characteristics estimated from measured metadata query latency and memory overhead calculations.

### Gaps to Address

1. **SQLGlot Antiselect support (Phase 3):** Research couldn't confirm if sqlglot.parse_one() recognizes Teradata's Antiselect function. **Resolution:** Test parsing during Phase 3 planning. If unsupported, document as v2+ feature.

2. **Metadata query failure modes:** Research identified failure scenarios (QVCI disabled, table dropped, permissions denied) but couldn't quantify frequency in production. **Resolution:** Add comprehensive error logging in Phase 1. Monitor error rates during first week of production use to prioritize Phase 2 error handling improvements.

3. **Schema staleness threshold:** Proposed 30-day cutoff for "stale metadata" warnings based on typical ETL cadences, but not validated against actual schema change frequency. **Resolution:** Make configurable via environment variable. Start with 30 days, adjust based on user feedback.

4. **Wildcard expansion for ORDER BY/GROUP BY positional references:** Research identified the pitfall but didn't find established resolution patterns in other lineage tools. **Resolution:** Phase 1 detects and skips (conservative approach). Phase 2 investigate if SQLGlot's qualify() handles positional references automatically.

## Sources

### Primary (HIGH confidence)
- **SQLGlot API Documentation** (sqlglot.com) — Star expansion via qualify() function, MappingSchema class, Teradata dialect support
- **SQLGlot GitHub Repository** (github.com/tobymao/sqlglot) — Source code for qualify_columns.py, version compatibility (28.10.1 latest stable)
- **Teradata Documentation** (docs.teradata.com) — DBC.ColumnsV vs DBC.ColumnsJQV, QVCI requirements, view column metadata
- **DataHub Blog: Extracting Column-Level Lineage from SQL** (datahubproject.io) — Schema-aware parsing approach, metadata requirements, SQLGlot integration patterns
- **Existing Codebase** (`sql_parser.py`, `dbql_extractor.py`, `populate_lineage.py`) — Current architecture, integration points, DBC query patterns

### Secondary (MEDIUM confidence)
- **Metaplane Blog: Column-Level Lineage** (metaplane.dev) — SQL parser challenges, wildcard handling pitfalls
- **Recce Blog: Column-Level Lineage Internals** (reccehq.com) — SQLGlot lineage extraction approach
- **sqllineage Documentation** (sqllineage.readthedocs.io) — Column-level lineage design patterns
- **PostgreSQL Documentation** (postgresql.org) — INSERT INTO ordinal position matching behavior
- **W3Schools SQL Reference** (w3schools.com) — SQL standard behavior for wildcards and INSERT

### Tertiary (LOW confidence)
- **DWH Pro: Teradata Antiselect** (dwhpro.com) — Antiselect function documentation (not official Teradata docs)
- **Medium: Teradata Antiselect** (medium.com/@r.wenzlofsky) — Usage examples, but author not verified Teradata expert
- **DBMSTutorials: Teradata Metadata Queries** (dbmstutorials.com) — DBC query patterns, community-contributed

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
