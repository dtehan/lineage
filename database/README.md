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
| `run_tests.py` | Run database tests |

## Usage

```bash
# Create OpenLineage tables
python setup_lineage_schema.py --openlineage

# Populate with manual mappings
python populate_lineage.py

# Preview what would be populated
python populate_lineage.py --dry-run

# Append mode (don't clear existing data)
python populate_lineage.py --skip-clear
```

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
