---
status: resolved
trigger: "Research and establish an approach to populate OL_COLUMN_LINEAGE table from executed SQL queries on Teradata platform"
created: 2026-02-01T10:00:00Z
updated: 2026-02-01T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - A hybrid approach using DBQL logs + SQLGlot parsing works for automated column-level lineage extraction
test: Implementation complete
expecting: N/A - task complete
next_action: N/A - resolved

## Symptoms

expected: OL_COLUMN_LINEAGE should be populated by parsing executed SQL from DBQL logs, extracting column-level lineage relationships automatically using a hybrid approach (DBQL logs + system views + parsing)
actual: Current populate_openlineage_lineage function in populate_lineage.py uses hardcoded manual mappings (COLUMN_LINEAGE_MAPPINGS dictionary) which is only suitable for testing
errors: None - this is a research/design task
reproduction: Review database/scripts/populate/populate_lineage.py
started: New capability - SQL-based lineage discovery has never been implemented

## Eliminated

## Evidence

- timestamp: 2026-02-01T10:15:00Z
  checked: Current implementation in populate_lineage.py
  found: |
    - COLUMN_LINEAGE_MAPPINGS is a hardcoded list of 61 tuples defining source->target lineage
    - Each tuple: (source_col_path, target_col_path, transformation_type, confidence_score)
    - populate_openlineage_lineage() iterates through mappings and inserts into OL_COLUMN_LINEAGE
    - Transformation types: DIRECT, CALCULATION, AGGREGATION, JOIN, FILTER
    - OpenLineage mapping: DIRECT->(DIRECT,IDENTITY), CALCULATION->(DIRECT,TRANSFORMATION), etc.
    - The code already supports --dbql flag but shows "not yet implemented" error
  implication: Existing code is well-structured; need to implement DBQL extraction as alternative to manual mappings

- timestamp: 2026-02-01T10:20:00Z
  checked: Archived DBQL extraction code in database/archive/
  found: |
    - extract_dbql_lineage.py: Complete DBQL extraction framework exists
    - sql_parser.py: SQLGlot-based parser with TeradataSQLParser class
    - Parser handles: INSERT...SELECT, MERGE, CTAS, UPDATE statements
    - Uses sqlglot.parse_one(sql, dialect="teradata")
    - Has fallback pattern-based extraction for unparseable SQL
    - Writes to LIN_TABLE_LINEAGE and LIN_COLUMN_LINEAGE (legacy tables)
    - Uses LIN_WATERMARK for incremental extraction tracking
  implication: Most of the code already exists in archive; needs adaptation for OpenLineage schema (OL_*)

- timestamp: 2026-02-01T10:30:00Z
  checked: DBQL table structure and capabilities
  found: |
    Key DBQL tables for lineage extraction:
    - DBC.DBQLogTbl: Main query log with StatementType, QueryID, StartTime, DefaultDatabase, ErrorCode
    - DBC.DBQLSQLTbl: SQL text storage (SQLTextInfo column), joins via QueryID + ProcID
    - DBC.DBQLObjTbl: Object usage (tables read/written) - may have limitations

    Join pattern:
    SELECT q.QueryID, q.StatementType, CAST(s.SQLTextInfo AS VARCHAR(32000)),
           q.StartTime, q.DefaultDatabase
    FROM DBC.DBQLogTbl q
    JOIN DBC.DBQLSQLTbl s ON q.QueryID = s.QueryID AND q.ProcID = s.ProcID
    WHERE q.StatementType IN ('Insert', 'Merge Into', 'Create Table', 'Update')
      AND q.ErrorCode = 0  -- Only successful queries
      AND s.SQLRowNo = 1   -- First SQL segment

    Requirements:
    - User needs SELECT on DBC.DBQLogTbl and DBC.DBQLSQLTbl
    - Query logging must be enabled: BEGIN QUERY LOGGING WITH SQL, OBJECTS LIMIT SQLTEXT=0 ON ALL
    - SQL text may be truncated; multi-row queries need reassembly
  implication: DBQL provides executed SQL but requires proper permissions and logging configuration

- timestamp: 2026-02-01T10:45:00Z
  checked: SQLGlot library capabilities for Teradata
  found: |
    SQLGlot features:
    - Native Teradata dialect support: sqlglot.parse_one(sql, dialect="teradata")
    - Built-in lineage module: sqlglot.lineage function
    - Supports INSERT, UPDATE, MERGE, CTAS statement types
    - Can traverse AST to find column dependencies
    - Used by DataHub for production lineage extraction

    Limitations:
    - Schema-naive parsing may not resolve ambiguous columns (SELECT a FROM x JOIN y)
    - Need to pass schema information for accurate column resolution
    - Complex Teradata syntax (NORMALIZE, PERIOD operations) may need custom handling

    Recommended approach:
    - Use sqlglot.parse_one() for AST generation
    - Use optimizer.qualify() to prefix columns with table names
    - Use optimizer.scope.traverse_scope() for CTE handling
    - Combine with DBC.ColumnsJQV schema info for disambiguation
  implication: SQLGlot is suitable; existing sql_parser.py already implements most of this

- timestamp: 2026-02-01T11:00:00Z
  checked: Test data structure and fixture requirements
  found: |
    Current test data approach:
    - insert_cte_test_data.py: 89 lineage records for graph algorithms (cycles, diamonds, fans)
    - Uses hardcoded INSERT statements with TEST_* prefix lineage_ids
    - populate_test_metadata.py: Populates OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD for test tables

    COLUMN_LINEAGE_MAPPINGS (61 records) represents:
    - SRC_* -> STG_* (12 records): ETL staging
    - STG_* -> DIM_* (13 records): Dimension building
    - Multi-source -> FACT_* (14 records): Fact table population
    - FACT_* -> aggregations and reports (22 records)

    This should become a test fixture, separate from production DBQL extraction
  implication: Manual mappings should be moved to test fixtures; production uses DBQL

## Resolution

root_cause: DBQL-based lineage extraction was designed but archived; needed adaptation for OpenLineage schema and integration into populate_lineage.py

fix: Implemented hybrid lineage extraction with two modes:
1. --fixtures (default): Use hardcoded test fixtures from database/fixtures/lineage_mappings.py
2. --dbql: Extract from DBQL using SQLGlot parsing via dbql_extractor.py

verification:
- Unit tests for SQL parser exist in test_dbql_error_handling.py
- Manual testing: python populate_lineage.py --dry-run (both modes)
- Existing tests remain valid

files_changed:
- database/fixtures/__init__.py (created)
- database/fixtures/lineage_mappings.py (created - moved from populate_lineage.py)
- database/scripts/populate/sql_parser.py (copied from archive)
- database/scripts/populate/dbql_extractor.py (created - adapted from archive)
- database/scripts/populate/populate_lineage.py (updated - added --fixtures and --dbql modes)
- database/README.md (updated - documented new modes and structure)

---

## Research Findings Summary

### 1. Current Architecture

**Production flow (populate_lineage.py):**
```
DBC.TablesV -> OL_DATASET (tables)
DBC.ColumnsJQV -> OL_DATASET_FIELD (columns)
COLUMN_LINEAGE_MAPPINGS -> OL_COLUMN_LINEAGE (hardcoded)
```

**Archived DBQL flow (extract_dbql_lineage.py):**
```
DBC.DBQLogTbl + DBC.DBQLSQLTbl -> SQL text
SQL text -> TeradataSQLParser -> ColumnLineage records
ColumnLineage -> LIN_COLUMN_LINEAGE (legacy table)
```

### 2. Key Components Already Built

| Component | Location | Status |
|-----------|----------|--------|
| TeradataSQLParser | database/archive/sql_parser.py | Complete, needs review |
| DBQLLineageExtractor | database/archive/extract_dbql_lineage.py | Complete for LIN_* tables |
| OpenLineage schema | database/scripts/setup/setup_lineage_schema.py | Production ready |
| DBQL error handling tests | database/tests/test_dbql_error_handling.py | 25 test cases |

### 3. Implementation Plan

#### Phase 1: Refactor Test Fixtures

Move COLUMN_LINEAGE_MAPPINGS from populate_lineage.py to a dedicated test module:

```
database/
├── fixtures/
│   ├── __init__.py
│   └── test_lineage_mappings.py  # COLUMN_LINEAGE_MAPPINGS
├── scripts/
│   └── utils/
│       └── insert_test_lineage.py  # New: inserts fixtures into OL_COLUMN_LINEAGE
```

#### Phase 2: Adapt SQL Parser for OpenLineage

Update sql_parser.py to output OpenLineage format:
- Change ColumnLineage dataclass to include OL_COLUMN_LINEAGE fields
- Add transformation type/subtype mapping
- Add namespace/dataset ID generation

#### Phase 3: Create DBQL Extraction Module

Create `database/scripts/populate/extract_dbql_lineage.py`:
- Move from archive, update for OL_* tables
- Add schema-aware parsing using DBC.ColumnsJQV
- Implement incremental extraction with OL_WATERMARK table

#### Phase 4: Update populate_lineage.py

Add --dbql mode:
```python
def populate_openlineage_lineage(cursor, namespace_id, namespace_uri, mode='manual'):
    if mode == 'dbql':
        return extract_from_dbql(cursor, namespace_id, namespace_uri)
    else:
        return insert_manual_mappings(cursor, namespace_id, namespace_uri)
```

### 4. SQL Parsing Strategy

**Statement types to handle:**
| Type | DBQL StatementType | Lineage Pattern |
|------|-------------------|-----------------|
| INSERT...SELECT | 'Insert' | target_table <- source_tables |
| MERGE INTO | 'Merge Into' | target_table <- source_tables |
| CREATE TABLE AS | 'Create Table' | new_table <- source_tables |
| UPDATE...FROM | 'Update' | target_table <- source_tables |

**SQLGlot parsing approach:**
```python
import sqlglot
from sqlglot import exp

def extract_lineage(sql: str, dialect: str = "teradata"):
    ast = sqlglot.parse_one(sql, dialect=dialect)

    if isinstance(ast, exp.Insert):
        target = get_table_name(ast.this)
        sources = extract_sources_from_select(ast.expression)
        columns = match_columns(target, sources)
    # ... similar for Merge, Create, Update
```

**Schema-aware column resolution:**
```python
def resolve_ambiguous_columns(column: str, tables: list, schema: dict):
    """Use DBC.ColumnsJQV to find which table has this column."""
    candidates = [t for t in tables if column in schema.get(t, [])]
    if len(candidates) == 1:
        return candidates[0]
    # If multiple, need context (JOIN ON, WHERE clause analysis)
```

### 5. OpenLineage Transformation Mapping

```python
TRANSFORMATION_MAPPING = {
    # SQL Operation -> (OL_type, OL_subtype, confidence)
    "direct_copy": ("DIRECT", "IDENTITY", 0.95),
    "expression": ("DIRECT", "TRANSFORMATION", 0.85),
    "aggregation": ("DIRECT", "AGGREGATION", 0.90),
    "join": ("INDIRECT", "JOIN", 0.80),
    "filter": ("INDIRECT", "FILTER", 0.75),
    "unknown": ("DIRECT", "TRANSFORMATION", 0.60),
}
```

### 6. Error Handling Requirements

- DBQL access denied -> Clear message with manual fallback instructions
- SQL parse failure -> Log and skip, continue with other queries
- Schema resolution failure -> Mark as low confidence, include in output
- Truncated SQL -> Attempt reassembly from SQLRowNo > 1

### 7. Recommended File Structure

```
database/
├── db_config.py
├── fixtures/
│   ├── __init__.py
│   └── lineage_mappings.py      # Test fixtures (was COLUMN_LINEAGE_MAPPINGS)
├── scripts/
│   ├── setup/
│   │   └── setup_lineage_schema.py
│   ├── populate/
│   │   ├── populate_lineage.py  # Main entry point
│   │   ├── dbql_extractor.py    # DBQL extraction logic
│   │   ├── sql_parser.py        # SQLGlot wrapper (from archive)
│   │   └── populate_test_metadata.py
│   └── utils/
│       ├── insert_test_lineage.py  # Insert test fixtures
│       └── benchmark_cte.py
└── tests/
    ├── test_sql_parser.py       # Parser unit tests
    ├── test_dbql_extractor.py   # Extractor tests
    └── test_correctness.py
```

### 8. Next Steps

1. Create fixtures/ directory and move COLUMN_LINEAGE_MAPPINGS
2. Move sql_parser.py from archive to scripts/populate/
3. Adapt DBQLLineageExtractor for OL_* tables
4. Update populate_lineage.py with --dbql mode
5. Add/update tests
6. Document new workflow in README.md

Sources:
- [Teradata DBQL Tables](https://www.dwhpro.com/teradata-query-logging-dbql/)
- [SQLGlot Lineage Documentation](https://sqlglot.com/sqlglot/lineage.html)
- [DataHub Column-Level Lineage](https://medium.com/datahub-project/extracting-column-level-lineage-from-sql-779b8ce17567)
- [Teradata DBQLSQLTbl Reference](https://docs.teradata.com/r/B7Lgdw6r3719WUyiCSJcgw/c6Wx_KuMzRhurqVaWHVsIg)
