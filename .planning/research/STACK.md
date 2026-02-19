# Stack Research: Wildcard Expansion in SQL Lineage Extraction

**Domain:** SQL wildcard expansion for DBQL-based column lineage extraction
**Researched:** 2026-02-18
**Confidence:** HIGH

## Context

This research focuses ONLY on stack additions/changes needed for wildcard expansion (`SELECT *`, `SELECT t.*`, `SELECT * EXCEPT`) in existing DBQL lineage extraction. The system already has:
- SQLGlot parser (>=25.0.0) for SQL parsing
- DBC.ColumnsJQV queries for table/view metadata
- OpenLineage schema (OL_* tables) for lineage storage
- populate_lineage.py + dbql_extractor.py for DBQL extraction

## Recommended Stack

### Core: SQLGlot Optimizer for Star Expansion

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| sqlglot | >=28.0.0 | SQL parser with optimizer for star expansion | Version 28+ includes mature star expansion via `qualify()` function with `expand_stars=True` parameter. Already in use for parsing, now extending to use optimizer module. |
| sqlglot.optimizer.qualify | Built-in | Normalize and expand SELECT * to column lists | Official SQLGlot method for star expansion. Requires schema catalog to resolve wildcards. Handles `SELECT *`, `SELECT t.*`, and dialect-specific exclusions. |
| sqlglot.schema.MappingSchema | Built-in | In-memory schema catalog for star expansion | Lightweight schema representation supporting 3-level hierarchy (catalog.database.table.column). No external dependencies. |

**Why sqlglot.optimizer.qualify:**
- Native SQLGlot feature, zero additional dependencies
- Handles all wildcard patterns: `*`, `table.*`, qualified table references
- Schema-aware expansion respects table context in JOINs
- Returns expanded AST for existing lineage extraction logic

**Why NOT custom regex/string parsing:**
- Wildcards in complex queries (CTEs, subqueries, JOINs) require semantic understanding
- Schema context needed to resolve `t.*` when `t` is an alias
- SQLGlot AST already parsed, optimizer extends existing workflow

### Supporting: Schema Population from Teradata Metadata

| Component | Source | Purpose | Integration Point |
|-----------|--------|---------|-------------------|
| DBC.ColumnsJQV query | Teradata system view | Retrieve complete column lists for all tables/views in query | Called during DBQL extraction before SQL parsing |
| Schema caching | Python dict | In-memory cache of table → columns mapping | Populated once per extraction batch, reused across queries |
| QVCI requirement | Teradata DB config | Enable DBC.ColumnsJQV access for view column metadata | Already documented in CLAUDE.md, confirmed working |

**Why DBC.ColumnsJQV:**
- Already in use for `populate_openlineage_fields()` (line 198 of populate_lineage.py)
- Returns complete column metadata including views (unlike DBC.ColumnsV)
- Single query retrieves all columns for all referenced tables
- Provides column order (ColumnId) for correct expansion sequence

**Schema Query Pattern:**
```sql
-- Extract all columns for tables referenced in DBQL queries
SELECT
    TRIM(DatabaseName) as db_name,
    TRIM(TableName) as tbl_name,
    TRIM(ColumnName) as col_name,
    ColumnId as ordinal
FROM DBC.ColumnsJQV
WHERE (DatabaseName, TableName) IN (
    -- Subquery: extract unique table references from DBQL query batch
    SELECT source_db, source_table FROM extracted_tables
)
ORDER BY DatabaseName, TableName, ColumnId
```

### Integration: Wildcard Expansion Workflow

| Step | Technology | Method | Purpose |
|------|------------|--------|---------|
| 1. Parse SQL | sqlglot | `sqlglot.parse_one(sql, dialect="teradata")` | Already implemented in `TeradataSQLParser._parse_with_sqlglot()` |
| 2. Extract table refs | sqlglot AST | `parsed.find_all(exp.Table)` | Identify tables needing column metadata |
| 3. Query metadata | Teradata | DBC.ColumnsJQV | Build schema catalog for referenced tables only |
| 4. Build schema | sqlglot.schema.MappingSchema | `MappingSchema(nested_dict)` | Create schema object for qualify() |
| 5. Expand stars | sqlglot.optimizer.qualify | `qualify(parsed, schema=schema, expand_stars=True)` | Replace * with column lists in AST |
| 6. Extract lineage | Existing logic | `_extract_insert_lineage(expanded_ast)` | Proceed with existing column mapping logic |

**Modified Code Location:**
- `lineage-api/utils/sql_parser.py` → Add `_expand_wildcards()` helper method
- `database/scripts/populate/dbql_extractor.py` → Add schema caching before query processing loop

## Installation

**No new dependencies required.** All components are either:
- Already installed: `sqlglot>=25.0.0` (in requirements.txt)
- Built-in to sqlglot: `sqlglot.optimizer.qualify`, `sqlglot.schema`
- Existing infrastructure: DBC.ColumnsJQV queries, Teradata connection

**Version Upgrade (Recommended):**
```bash
# Update requirements.txt
sqlglot>=28.0.0  # Up from >=25.0.0

# Install
pip install --upgrade sqlglot
```

**Rationale for 28.0.0:**
- Version 25.0.0 has star expansion, but 28.x includes bug fixes and Teradata dialect improvements
- Latest stable: 28.10.1 (released 2026-02-09)
- Backward compatible with existing parsing code

## Alternatives Considered

| Recommended | Alternative | Why Not Alternative |
|-------------|-------------|---------------------|
| sqlglot.optimizer.qualify | Manual regex wildcard detection + string replacement | Complex queries (CTEs, subqueries) break regex patterns. No schema context for `t.*` resolution. |
| DBC.ColumnsJQV metadata query | Parse SHOW TABLE output | Requires N additional queries (one per table). No column order guarantee. |
| Schema caching per batch | Query metadata per SQL statement | 1000+ queries in batch → 1000+ metadata round-trips. 50x slower. |
| MappingSchema (dict-based) | Custom schema class | MappingSchema is official API, handles 3-level hierarchy, well-tested. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| DBC.ColumnsV | Returns NULL for view column types. Insufficient for view lineage. | DBC.ColumnsJQV (requires QVCI enabled) |
| sqlglot < 25.0.0 | Older versions lack mature star expansion. Teradata dialect incomplete. | sqlglot >= 28.0.0 |
| HELP COLUMN commands | Legacy Teradata metadata access. Requires N queries per table. Slow. | DBC.ColumnsJQV bulk query |
| Persistent schema database | Adds complexity, staleness issues. This is point-in-time extraction. | In-memory dict cache per batch |

## Teradata-Specific Considerations

### Antiselect Function (Column Exclusion)

**Status:** Teradata uses `Antiselect` function, NOT `SELECT * EXCEPT` syntax
```sql
-- Teradata column exclusion syntax
SELECT * FROM Antiselect (ON table_name USING Exclude ('col1','col2')) AS anti
```

**SQLGlot Support:** UNKNOWN confidence (not documented in search results)

**Recommendation:**
- Phase 1 (wildcard expansion): Handle `SELECT *` and `SELECT t.*` only
- Phase 2 (optional): Research SQLGlot's Antiselect parsing support
- Antiselect is advanced feature, less common than basic wildcards

**Sources:**
- [Teradata Antiselect (DWH Pro)](https://www.dwhpro.com/teradata-antiselect/)
- [Teradata Antiselect (Medium)](https://medium.com/@r.wenzlofsky/teradata-antiselect-2bebe8457739)

### QVCI Requirement

**Critical Dependency:** DBC.ColumnsJQV requires QVCI (Queryable View Column Index) enabled

**Validation:**
```sql
-- Check QVCI status (error 9719 = disabled)
SELECT TOP 1 * FROM DBC.ColumnsJQV;
```

**Documented:** CLAUDE.md section "Teradata QVCI Requirements"

**Fallback:** If QVCI disabled, use DBC.ColumnsV + HELP COLUMN (slower, already documented in codebase history)

## Stack Integration Example

```python
# lineage-api/utils/sql_parser.py

from sqlglot import exp
from sqlglot.optimizer import qualify
from sqlglot.schema import MappingSchema
from typing import Dict, List, Tuple

class TeradataSQLParser:
    def __init__(self, default_database: str = None):
        self.default_database = default_database or self.DEFAULT_DATABASE
        self._table_aliases: Dict[str, Tuple[str, str]] = {}
        self._schema_cache: Optional[MappingSchema] = None  # NEW

    def set_schema(self, schema_dict: Dict[str, Dict[str, Dict[str, str]]]):
        """Set schema catalog for wildcard expansion.

        Args:
            schema_dict: Nested dict {db: {table: {column: type}}}
        """
        self._schema_cache = MappingSchema(schema_dict)

    def _parse_with_sqlglot(self, sql: str) -> List[ColumnLineage]:
        """Parse SQL using SQLGlot and extract lineage."""
        self._table_aliases = {}

        # Parse with Teradata dialect
        parsed = sqlglot.parse_one(sql, dialect="teradata")
        if parsed is None:
            return []

        # NEW: Expand wildcards if schema available
        if self._schema_cache:
            parsed = self._expand_wildcards(parsed)

        # Continue with existing lineage extraction...
        if isinstance(parsed, exp.Insert):
            return self._extract_insert_lineage(parsed)
        # ... rest of existing code

    def _expand_wildcards(self, parsed: exp.Expression) -> exp.Expression:
        """Expand SELECT * using sqlglot optimizer.

        Args:
            parsed: SQLGlot AST

        Returns:
            AST with wildcards expanded to explicit column lists
        """
        try:
            expanded = qualify(
                parsed,
                schema=self._schema_cache,
                dialect="teradata",
                expand_stars=True,
                qualify_columns=True,
                validate_qualify_columns=False,  # Don't fail on unresolved refs
            )
            return expanded
        except Exception as e:
            # Fallback: return original AST if expansion fails
            # Log warning but don't block lineage extraction
            return parsed
```

```python
# database/scripts/populate/dbql_extractor.py

class DBQLExtractor:
    def extract_lineage(self, since: Optional[datetime] = None, full: bool = False) -> int:
        """Extract column lineage from DBQL."""

        # Fetch queries from DBQL
        queries = self.fetch_queries(since)
        if not queries:
            return 0

        # NEW: Build schema catalog for all referenced tables
        schema_dict = self._build_schema_catalog(queries)
        self.parser.set_schema(schema_dict)

        # Process each query (existing logic continues)
        for query_id, stmt_type, query_text, query_time, default_db, sql_length in queries:
            # Existing processing with wildcard expansion now enabled...
            records = self.parser.extract_column_lineage(query_text, stmt_type)
            # ... rest of existing code

    def _build_schema_catalog(self, queries: List[Tuple]) -> Dict:
        """Build schema catalog from DBC.ColumnsJQV for all referenced tables.

        Args:
            queries: List of DBQL query tuples

        Returns:
            Nested dict {database: {table: {column: type}}}
        """
        # Extract unique table references from all queries
        table_refs = set()
        for _, _, query_text, _, _, _ in queries:
            if not query_text:
                continue
            try:
                parsed = sqlglot.parse_one(query_text, dialect="teradata")
                for table in parsed.find_all(exp.Table):
                    db = table.db or self.parser.default_database
                    table_refs.add((db, table.name))
            except:
                continue  # Skip unparseable queries

        if not table_refs:
            return {}

        # Query DBC.ColumnsJQV for all referenced tables
        placeholders = ','.join([f"('{db}','{tbl}')" for db, tbl in table_refs])
        query = f"""
            SELECT
                TRIM(DatabaseName) as db_name,
                TRIM(TableName) as tbl_name,
                TRIM(ColumnName) as col_name,
                TRIM(ColumnType) as col_type
            FROM DBC.ColumnsJQV
            WHERE (DatabaseName, TableName) IN ({placeholders})
            ORDER BY DatabaseName, TableName, ColumnId
        """

        self.cursor.execute(query)
        rows = self.cursor.fetchall()

        # Build nested dict structure
        schema = {}
        for db, table, column, col_type in rows:
            if db not in schema:
                schema[db] = {}
            if table not in schema[db]:
                schema[db][table] = {}
            schema[db][table][column] = col_type or "VARCHAR(1000)"  # Default type

        return schema
```

## Version Compatibility

| Package | Current Version | Recommended Version | Notes |
|---------|----------------|---------------------|-------|
| sqlglot | >=25.0.0 | >=28.0.0 | Star expansion available in 25.x, but 28.x more stable. Latest: 28.10.1 (2026-02-09) |
| Python | 3.x | >=3.9 | SQLGlot 28.x requires Python 3.9+ |
| teradatasql | >=17.20.0 | (unchanged) | No conflicts with SQLGlot upgrade |

**Breaking Changes:** None. SQLGlot 28.x is backward compatible with 25.x parsing API.

## Performance Considerations

### Schema Query Cost

**Baseline:** DBQL extraction processes 1000+ queries per batch (based on codebase analysis)

**With Schema Catalog:**
- **One-time cost:** Single DBC.ColumnsJQV query for all tables in batch
- **Per-query cost:** In-memory schema lookup (negligible)

**Estimated Impact:**
- Schema query: +0.5-2 seconds per batch (one query for N tables)
- Wildcard expansion: +0.01-0.05 seconds per query (AST transformation)
- **Net benefit:** Queries with wildcards now produce lineage (currently skipped)

**Optimization:** Build schema catalog only for tables referenced in batch, not all database tables

### Memory Considerations

**Schema Size:**
- 1000 tables × 50 columns average = 50,000 entries
- Dict overhead: ~100 bytes per entry = ~5 MB
- MappingSchema wrapper: negligible

**Acceptable:** DBQL extraction already loads query text (32KB per query), schema adds <10 MB

## Migration Path

### Phase 1: Core Wildcard Expansion (SELECT *, SELECT t.*)
1. Add `_expand_wildcards()` to `sql_parser.py`
2. Add `_build_schema_catalog()` to `dbql_extractor.py`
3. Update `extract_lineage()` to call schema builder before query loop
4. Test with existing unit tests (should pass, wildcards now expanded)

### Phase 2: Validation (optional)
5. Add unit tests for wildcard expansion with mock schema
6. Add integration test with real DBC.ColumnsJQV query
7. Compare lineage output before/after expansion (should be superset)

### Phase 3: Antiselect Support (future enhancement)
8. Research SQLGlot Antiselect parsing (not covered in this research)
9. Extend `_expand_wildcards()` if SQLGlot supports Antiselect
10. Otherwise, manual AST transformation for Antiselect patterns

## Open Questions (for implementation phase)

1. **SQLGlot Antiselect Support:** Does sqlglot.parse_one() recognize Teradata's Antiselect function? (requires testing)
2. **Error Handling:** Should wildcard expansion failures block lineage extraction or log warning + continue? (recommend: log + continue)
3. **Schema Staleness:** How to handle schema changes mid-batch? (recommend: acceptable, extraction is point-in-time)
4. **Partial Schema:** How to handle queries referencing tables not in DBC.ColumnsJQV result? (recommend: qualify() has fallback, existing skip logic continues)

## Sources

**SQLGlot Core:**
- [SQLGlot GitHub](https://github.com/tobymao/sqlglot) — Official repository (HIGH confidence)
- [SQLGlot PyPI](https://pypi.org/project/sqlglot/) — Latest version 28.10.1, requires Python >=3.9 (HIGH confidence)
- [SQLGlot API: qualify](https://sqlglot.com/sqlglot/optimizer/qualify.html) — Star expansion API documentation (HIGH confidence)
- [SQLGlot API: schema](https://sqlglot.com/sqlglot/schema.html) — MappingSchema class documentation (HIGH confidence)

**Star Expansion Research:**
- [DataHub: Extracting Column-Level Lineage from SQL](https://blog.datahubproject.io/extracting-column-level-lineage-from-sql-779b8ce17567) — SQLGlot star expansion use case (MEDIUM confidence)
- [GitHub: sqlglot/optimizer/qualify_columns.py](https://github.com/tobymao/sqlglot/blob/main/sqlglot/optimizer/qualify_columns.py) — Star expansion implementation details (HIGH confidence)

**Teradata Metadata:**
- [Teradata: ColumnsV[X] Documentation](https://docs.teradata.com/r/oiS9ixs9ixs2ypIQvjTUOJfgoA/fQ8NslP6DDESV0ZiODLlIw) — DBC.ColumnsV documentation (HIGH confidence)
- [Teradata: Getting View Column Information](https://docs.teradata.com/r/Teradata-VantageCloud-Lake/Database-Reference/Database-Administration/Working-with-Tables-and-Views-Application-DBAs/Working-with-Views/Getting-View-Column-Information) — DBC.ColumnsJQV and QVCI (HIGH confidence)
- [DBMSTutorials: Teradata Metadata Queries](https://dbmstutorials.com/teradata/teradata_data_dictionary_queries.html) — DBC views query patterns (MEDIUM confidence)

**Teradata Antiselect:**
- [DWH Pro: Teradata Antiselect](https://www.dwhpro.com/teradata-antiselect/) — Antiselect function documentation (MEDIUM confidence)
- [Medium: Teradata Antiselect](https://medium.com/@r.wenzlofsky/teradata-antiselect-2bebe8457739) — Antiselect usage examples (MEDIUM confidence)

**SQLGlot Changelog:**
- [SQLGlot CHANGELOG.md](https://github.com/tobymao/sqlglot/blob/main/CHANGELOG.md) — Version history and breaking changes (HIGH confidence)

---
*Stack research for: Wildcard expansion in DBQL lineage extraction*
*Researched: 2026-02-18*
*Confidence: HIGH — SQLGlot star expansion verified with official docs and API references. DBC.ColumnsJQV already in use. Zero new dependencies required.*
