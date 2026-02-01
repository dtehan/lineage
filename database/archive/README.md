# Archived Code

Experimental and deprecated code preserved for historical reference.

## Files

### extract_dbql_lineage.py
Experimental approach for extracting lineage from Teradata DBQL (Database Query Log).

**Status:** Archived - not currently used

**Why archived:**
- DBQL access is restricted in ClearScape Analytics demo environments
- Manual mapping approach (populate_lineage.py) is more reliable for testing
- Preserved for potential future use with full Teradata deployments

**What it does:**
- Queries DBC.DBQLSqlTbl and DBC.DBQLObjTbl for query history
- Parses SQL statements to extract table/column dependencies
- Attempts to infer lineage from actual query execution

**Limitations:**
- Requires DBQL to be enabled (needs admin privileges)
- Query parsing is complex and error-prone
- Not all queries produce clear lineage (dynamic SQL, stored procedures)

### sql_parser.py
SQL parsing utilities used by extract_dbql_lineage.py.

**Status:** Archived - dependency of extract_dbql_lineage.py

**What it does:**
- Parses SELECT, INSERT, UPDATE, DELETE statements
- Extracts table references and column dependencies
- Handles basic SQL syntax patterns

**Limitations:**
- Does not handle all SQL dialects and edge cases
- Complex queries (CTEs, subqueries, window functions) are challenging
- Teradata-specific syntax not fully supported

## Future Considerations

These files may be useful if:
- DBQL access becomes available in production environments
- Automated lineage extraction is preferred over manual mappings
- Query log analysis is needed for lineage validation

For now, the manual mapping approach in `scripts/populate/populate_lineage.py` is the recommended method.
