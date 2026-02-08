# Database Schema

This directory contains scripts for managing the Teradata lineage database schema.

Part of [Teradata Column Lineage](../README.md)

## OpenLineage Schema

The schema is aligned with [OpenLineage spec v2-0-2](https://openlineage.io/):

- **OL_NAMESPACE** - Data source namespaces (URI format)
- **OL_DATASET** - Dataset registry (maps to tables)
- **OL_DATASET_FIELD** - Field definitions (maps to columns)
- **OL_JOB** - Job definitions
- **OL_RUN** - Job execution runs
- **OL_RUN_INPUT** - Run input datasets
- **OL_RUN_OUTPUT** - Run output datasets
- **OL_COLUMN_LINEAGE** - Column lineage with transformation types
- **OL_SCHEMA_VERSION** - Schema version tracking

The `scripts/populate/populate_lineage.py` script populates these tables by extracting metadata directly from DBC views. It uses `DBC.ColumnsJQV` instead of `DBC.ColumnsV` because ColumnsJQV provides complete column type information for both tables AND views (ColumnsV returns NULL for view column types).

**IMPORTANT:** The populate script requires QVCI (Queryable View Column Index) to be enabled on your Teradata system. See the [QVCI Requirements](#qvci-requirements) section below.

## Lineage Population Modes

The `populate_lineage.py` script supports two modes for populating column-level lineage:

### DBQL Mode (Default)

Extracts lineage by parsing executed SQL from Teradata's DBQL (Database Query Log) tables.

```bash
python scripts/populate/populate_lineage.py                           # Default: DBQL
python scripts/populate/populate_lineage.py --dbql --since 2024-01-01 # Since date
python scripts/populate/populate_lineage.py --dbql --full             # All history
```

**Requirements:**
- SELECT access on `DBC.DBQLogTbl` and `DBC.DBQLSQLTbl`
- Query logging enabled: `BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL`
- `sqlglot` library: `pip install sqlglot>=25.0.0`

**Best for:** Production environments with DBQL enabled.

### Fixture Mode

Uses hardcoded mappings from `fixtures/lineage_mappings.py` for the demo medallion architecture.

```bash
python scripts/populate/populate_lineage.py --fixtures   # Use fixture mode
```

**Best for:** Testing, demos, development environments.

## QVCI Requirements

The `populate_lineage.py` script requires QVCI (Queryable View Column Index) to be enabled because it uses `DBC.ColumnsJQV` to extract column metadata.

### Checking QVCI Status

Try running the populate script. If QVCI is disabled, you'll receive error 9719: "QVCI feature is disabled."

### Enabling QVCI

Contact your Teradata DBA to enable QVCI using the `dbscontrol` utility:

```bash
dbscontrol << EOF
M internal 551=false
W
EOF
```

**Note:** This requires a database restart. See `CLAUDE.md` for complete details and fallback options.

## Directory Structure

```
database/
├── db_config.py                              # Database connection configuration
├── fixtures/                                 # Test data fixtures
│   ├── __init__.py
│   └── lineage_mappings.py                   # Demo lineage mappings (SRC->STG->DIM->FACT)
├── scripts/
│   ├── setup/                                # One-time setup operations
│   │   ├── setup_lineage_schema.py           # Create OpenLineage tables (OL_*)
│   │   └── setup_test_data.py                # Create test data tables
│   ├── populate/                             # Data population scripts
│   │   ├── populate_lineage.py               # Main entry point (fixtures or DBQL)
│   │   ├── dbql_extractor.py                 # DBQL extraction logic
│   │   ├── sql_parser.py                     # SQLGlot-based SQL parser
│   │   └── populate_test_metadata.py         # Populate OL_* metadata for test tables
│   └── utils/                                # Testing & performance utilities
│       ├── insert_cte_test_data.py           # Insert test lineage patterns
│       └── benchmark_cte.py                  # Performance benchmarks
├── tests/                                    # Test suite (73 tests)
│   ├── run_tests.py                          # Main test runner
│   ├── test_correctness.py                   # CTE correctness validation
│   ├── test_credential_validation.py         # Credential validation tests
│   └── test_dbql_error_handling.py           # DBQL error handling tests
└── archive/                                  # Archived experimental code
    ├── extract_dbql_lineage.py               # Original DBQL extraction (for reference)
    └── sql_parser.py                         # Original SQL parser (for reference)
```

## Usage

### Production Setup

```bash
# 1. Create OpenLineage tables
python scripts/setup/setup_lineage_schema.py

# 2. Populate with fixture mappings (testing/demo)
python scripts/populate/populate_lineage.py

# Or: Populate from DBQL (production)
python scripts/populate/populate_lineage.py --dbql

# Preview what would be populated (dry-run)
python scripts/populate/populate_lineage.py --dry-run

# Append mode (don't clear existing data)
python scripts/populate/populate_lineage.py --skip-clear
```

### Test Data Setup

For testing lineage algorithms (cycle detection, diamond patterns, fan-in/out):

```bash
# 1. Insert test lineage patterns into OL_COLUMN_LINEAGE
python scripts/utils/insert_cte_test_data.py

# 2. Populate metadata so test tables appear in UI
python scripts/populate/populate_test_metadata.py
```

**Important:** You must run `scripts/populate/populate_test_metadata.py` after `scripts/utils/insert_cte_test_data.py` for test data to be visible in the UI. The test lineage script only populates `OL_COLUMN_LINEAGE`, but the UI requires entries in `OL_NAMESPACE`, `OL_DATASET`, and `OL_DATASET_FIELD` to display tables in the Asset Browser.

Test data includes:
- 89 lineage records covering 17 test patterns
- 2-node, 4-node, and 5-node cycles
- Simple, nested, and wide diamond patterns
- Fan-out patterns (1->5, 1->10) and fan-in patterns (5->1, 10->1)
- Combined patterns (cycle+diamond, fan-out+fan-in)

## Testing

The database test suite includes 73 tests covering schema validation, CTE correctness, credential handling, and DBQL error handling.

```bash
# Run all database tests
cd database
python tests/run_tests.py
```

| Test File | Focus | Count |
|-----------|-------|-------|
| `tests/run_tests.py` | Schema and CTE tests | ~40 |
| `tests/test_correctness.py` | CTE correctness validation | ~16 |
| `tests/test_credential_validation.py` | Credential validation | ~6 |
| `tests/test_dbql_error_handling.py` | DBQL error handling | ~11 |

**Note:** 29 tests are skipped in ClearScape Analytics environments due to DBQL/index limitations.

## Configuration

Uses environment variables from `.env` or `db_config.py`:

- `TERADATA_HOST` / `TD_HOST` - Database host
- `TERADATA_USER` / `TD_USER` - Username
- `TERADATA_PASSWORD` / `TD_PASSWORD` - Password
- `TERADATA_DATABASE` / `TD_DATABASE` - Default database

## OpenLineage Transformation Mapping

| Legacy Type | OpenLineage Type | OpenLineage Subtype |
|-------------|------------------|---------------------|
| DIRECT | DIRECT | IDENTITY |
| CALCULATION | DIRECT | TRANSFORMATION |
| AGGREGATION | DIRECT | AGGREGATION |
| JOIN | INDIRECT | JOIN |
| FILTER | INDIRECT | FILTER |

## SQL Parsing

The DBQL extraction mode uses [SQLGlot](https://github.com/tobymao/sqlglot) to parse SQL and extract column-level lineage. Supported statement types:

| Statement Type | DBQL StatementType | Example |
|----------------|-------------------|---------|
| INSERT...SELECT | Insert | `INSERT INTO target SELECT ... FROM source` |
| MERGE INTO | Merge Into | `MERGE INTO target USING source ...` |
| CREATE TABLE AS | Create Table | `CREATE TABLE target AS SELECT ... FROM source` |
| UPDATE...FROM | Update | `UPDATE target FROM source SET ...` |

The parser handles:
- Table aliases and qualified names
- CTEs (Common Table Expressions)
- JOINs (INNER, LEFT, RIGHT, FULL)
- Subqueries in SELECT clause
- Aggregation functions (SUM, COUNT, AVG, etc.)
- Expression columns (CONCAT, CASE WHEN, etc.)

**Limitations:**
- SELECT * requires schema information for column expansion
- Complex Teradata-specific syntax (NORMALIZE, PERIOD) may need custom handling
- Unqualified column names in multi-table queries need schema for disambiguation
