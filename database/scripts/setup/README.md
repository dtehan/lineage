# Database Setup Scripts

One-time setup operations for creating database schema and test data.

## Scripts

### setup_lineage_schema.py
Creates OpenLineage-aligned tables (OL_*) in the Teradata database.

**Usage:**
```bash
python scripts/setup/setup_lineage_schema.py --openlineage
python scripts/setup/setup_lineage_schema.py --dry-run  # Preview only
```

**Creates:**
- OL_NAMESPACE - Data source namespaces
- OL_DATASET - Dataset registry (tables/views)
- OL_DATASET_FIELD - Field definitions (columns)
- OL_JOB - Job definitions
- OL_RUN - Job execution runs
- OL_RUN_INPUT, OL_RUN_OUTPUT - Run I/O datasets
- OL_COLUMN_LINEAGE - Column-level lineage relationships
- OL_SCHEMA_VERSION - Schema version tracking

### setup_test_data.py
Creates test tables with medallion architecture pattern (SRC → STG → DIM → FACT).

**Usage:**
```bash
python scripts/setup/setup_test_data.py
```

**Creates:**
- Bronze layer: SRC_CUSTOMERS, SRC_ORDERS, SRC_PRODUCTS
- Silver layer: STG_ORDERS
- Gold layer: DIM_CUSTOMERS, DIM_PRODUCTS, FACT_SALES
- Reporting views: V_SALES_SUMMARY, V_REGIONAL_PERFORMANCE

Run this after `setup_lineage_schema.py` to create test data for validating lineage functionality.
