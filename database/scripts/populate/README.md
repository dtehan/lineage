# Data Population Scripts

Scripts that populate the OpenLineage tables with metadata and lineage information.

## Scripts

### populate_lineage.py
Extracts metadata from DBC views and populates OpenLineage tables.

**Usage:**
```bash
python scripts/populate/populate_lineage.py              # Use manual mappings
python scripts/populate/populate_lineage.py --dry-run    # Preview changes
python scripts/populate/populate_lineage.py --manual     # Explicit manual mode
python scripts/populate/populate_lineage.py --dbql       # Extract from DBQL (future)
```

**What it does:**
- Extracts namespaces, datasets, and fields from DBC.DatabasesV, DBC.TablesV, DBC.ColumnsV
- Uses HELP COLUMN to derive accurate view column types (DBC.ColumnsV returns NULL for views)
- Creates lineage relationships based on manual mappings
- Populates OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD, OL_JOB, OL_RUN, OL_COLUMN_LINEAGE

**Note:** For view columns, the script automatically uses Teradata's HELP COLUMN command to retrieve actual column types, since DBC.ColumnsV does not provide type information for views.

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
