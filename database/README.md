# Database Schema

This directory contains scripts for managing the Teradata lineage database schema.

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

The `populate_lineage.py` script populates these tables by extracting metadata directly from DBC views.

## Scripts

| Script | Purpose |
|--------|---------|
| `setup_lineage_schema.py` | Create OpenLineage tables (OL_*) |
| `populate_lineage.py` | Populate OpenLineage tables from DBC views |
| `setup_test_data.py` | Create test data tables |
| `insert_cte_test_data.py` | Insert test lineage patterns (cycles, diamonds, fans) |
| `populate_test_metadata.py` | Populate OL_* metadata for test tables |
| `run_tests.py` | Run database tests |

## Usage

### Production Setup

```bash
# 1. Create OpenLineage tables
python setup_lineage_schema.py --openlineage

# 2. Populate with production data
python populate_lineage.py

# Preview what would be populated (dry-run)
python populate_lineage.py --dry-run

# Append mode (don't clear existing data)
python populate_lineage.py --skip-clear
```

### Test Data Setup

For testing lineage algorithms (cycle detection, diamond patterns, fan-in/out):

```bash
# 1. Insert test lineage patterns into OL_COLUMN_LINEAGE
python insert_cte_test_data.py

# 2. Populate metadata so test tables appear in UI
python populate_test_metadata.py
```

**Important:** You must run `populate_test_metadata.py` after `insert_cte_test_data.py` for test data to be visible in the UI. The test lineage script only populates `OL_COLUMN_LINEAGE`, but the UI requires entries in `OL_NAMESPACE`, `OL_DATASET`, and `OL_DATASET_FIELD` to display tables in the Asset Browser.

Test data includes:
- 89 lineage records covering 17 test patterns
- 2-node, 4-node, and 5-node cycles
- Simple, nested, and wide diamond patterns
- Fan-out patterns (1→5, 1→10) and fan-in patterns (5→1, 10→1)
- Combined patterns (cycle+diamond, fan-out+fan-in)

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
