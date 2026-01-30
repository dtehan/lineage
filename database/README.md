# Database Schema

This directory contains scripts for managing the Teradata lineage database schema.

## Schema Versions

### Legacy Schema (LIN_* tables)

The original lineage schema uses `LIN_` prefixed tables:

- **LIN_DATABASE** - Database registry
- **LIN_TABLE** - Table registry
- **LIN_COLUMN** - Column registry
- **LIN_COLUMN_LINEAGE** - Column-to-column lineage relationships
- **LIN_TABLE_LINEAGE** - Table-level lineage summary
- **LIN_TRANSFORMATION** - Transformation definitions
- **LIN_QUERY** - Query registry (from DBQL)
- **LIN_WATERMARK** - Extraction watermarks

### OpenLineage Schema (OL_* tables)

The OpenLineage-aligned schema follows [spec v2-0-2](https://openlineage.io/):

- **OL_NAMESPACE** - Data source namespaces (URI format)
- **OL_DATASET** - Dataset registry (maps to tables)
- **OL_DATASET_FIELD** - Field definitions (maps to columns)
- **OL_JOB** - Job definitions
- **OL_RUN** - Job execution runs
- **OL_RUN_INPUT** - Run input datasets
- **OL_RUN_OUTPUT** - Run output datasets
- **OL_COLUMN_LINEAGE** - Column lineage with OL transformation types
- **OL_SCHEMA_VERSION** - Schema version tracking

## Scripts

| Script | Purpose |
|--------|---------|
| `setup_lineage_schema.py` | Create database tables |
| `populate_lineage.py` | Extract metadata and populate lineage |
| `extract_dbql_lineage.py` | Extract lineage from DBQL |
| `setup_test_data.py` | Create test data tables |
| `run_tests.py` | Run database tests |

## Usage

### Setup Legacy Schema Only

```bash
python setup_lineage_schema.py
python populate_lineage.py
```

### Setup OpenLineage Schema

```bash
python setup_lineage_schema.py --openlineage
python populate_lineage.py --openlineage
```

### OpenLineage-Only Setup

```bash
python setup_lineage_schema.py --openlineage-only
python populate_lineage.py --openlineage
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
