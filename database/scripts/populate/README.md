# Data Population Scripts

Scripts that populate the OpenLineage tables with metadata and lineage information.

## Scripts

### populate_lineage.py
Extracts metadata from DBC views and populates OpenLineage tables.

**Lineage Modes:**

| Mode | Command | Use Case |
|------|---------|----------|
| Fixtures (default) | `python populate_lineage.py` | Demo, testing, development |
| DBQL extraction | `python populate_lineage.py --dbql` | Production - extracts from query logs |

**Usage:**
```bash
# Fixtures mode (default) - uses hardcoded test mappings
python scripts/populate/populate_lineage.py
python scripts/populate/populate_lineage.py --fixtures   # Explicit fixtures mode

# DBQL mode - extracts lineage from executed SQL in query logs
python scripts/populate/populate_lineage.py --dbql                    # Last 30 days
python scripts/populate/populate_lineage.py --dbql --since "2024-01-01"  # Since date
python scripts/populate/populate_lineage.py --dbql --full             # All history

# Common options
python scripts/populate/populate_lineage.py --dry-run    # Preview changes
python scripts/populate/populate_lineage.py --verbose    # Detailed output
python scripts/populate/populate_lineage.py --skip-clear # Append mode
```

**What it does:**
- Extracts namespaces, datasets, and fields from DBC.TablesV, DBC.ColumnsV
- In fixtures mode: Creates lineage from predefined mappings in `database/fixtures/`
- In DBQL mode: Parses executed SQL (INSERT SELECT, MERGE, CREATE VIEW, etc.) to discover lineage
- Populates OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD, OL_COLUMN_LINEAGE

**DBQL Mode Requirements:**
- SELECT access on DBC.DBQLogTbl and DBC.DBQLSQLTbl
- Query logging enabled: `BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL`
- sqlglot library: `pip install sqlglot>=25.0.0`

**General Requirements:**
- QVCI (Queryable View Column Index) must be enabled on your Teradata system
- If you receive error 9719 ("QVCI feature is disabled"), contact your DBA to enable QVCI
- See `CLAUDE.md` for QVCI setup instructions and fallback options

Run this after creating test data to populate lineage metadata.

### populate_test_metadata.py
Creates OpenLineage metadata for test tables created by insert_cte_test_data.py.

**Usage:**
```bash
python scripts/populate/populate_test_metadata.py
```

**What it does:**
- Populates OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD for test pattern tables
- Enables test tables to appear in the Asset Browser UI
- Required for CTE correctness tests to work properly

Run this after `insert_cte_test_data.py` to make test tables visible in the UI.
