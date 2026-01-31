# Technical Debt Register

This document tracks known technical debt, workarounds, and issues that need future attention.

---

## Database Layer

### TD-001: Column Extraction Included Stored Procedure Parameters

| Field | Value |
|-------|-------|
| **Status** | RESOLVED |
| **Date Identified** | 2024-01-19 |
| **Date Resolved** | 2024-01-19 (LIN_*), 2024-01-30 (OL_*) |
| **Severity** | Low |
| **Component** | populate_lineage.py, lineage_plan_database.md |

**Problem:**
The column extraction query pulled all columns from `DBC.ColumnsV` without filtering by object type. This caused stored procedure parameters (TableKind = 'P') to be extracted as columns, but stored procedures were not extracted as tables (only T, V, O were extracted). This resulted in orphaned column records that failed referential integrity checks.

**Affected Objects:**
- `demo_user.get_data` (stored procedure)
- `demo_user.remove_data` (stored procedure)

**Root Cause:**
In Teradata, stored procedure parameters appear in `DBC.ColumnsV` with the procedure name as `TableName`. The original extraction query did not join to `DBC.TablesV` to verify the parent object was a table/view.

**Resolution:**
Added an EXISTS subquery to the column extraction to only extract columns from actual tables, views, and join indexes:

```sql
AND EXISTS (
    SELECT 1 FROM DBC.TablesV t
    WHERE t.DatabaseName = c.DatabaseName
      AND t.TableName = c.TableName
      AND t.TableKind IN ('T', 'V', 'O')
)
```

**Files Modified:**
- `populate_lineage.py` - Now extracts directly from DBC views to OL_DATASET_FIELD with proper filtering

**Note:** The script now populates OpenLineage tables (OL_*) exclusively, extracting metadata directly from DBC views.

---

### TD-002: ClearScape Analytics Limitations

| Field | Value |
|-------|-------|
| **Status** | OPEN - ACCEPTED |
| **Date Identified** | 2024-01-19 |
| **Severity** | Medium |
| **Component** | All database scripts |

**Problem:**
The ClearScape Analytics demo environment has several limitations compared to a full Teradata deployment:

1. **Cannot create separate databases** - Using `demo_user` instead of dedicated `lineage` database
2. **No DEFAULT CURRENT_TIMESTAMP** - Timestamps must be explicitly provided in INSERT statements
3. **No secondary indexes** - CREATE INDEX statements fail; queries still work but may be slower at scale
4. **No table partitioning** - PARTITION BY clauses removed from OpenLineage tables
5. **Limited DBQL access** - Automated lineage discovery from query logs is not available
6. **CLOB not supported** - Changed to VARCHAR for large text columns

**Impact:**
- Performance may be impacted without indexes on large datasets
- Automated lineage discovery is not yet implemented
- Manual lineage mappings required for demo/test environments

**Workaround:**
All scripts adapted for ClearScape. The application uses manual lineage mappings for testing and demo purposes. For production deployment on full Teradata:
- Use dedicated database with appropriate space allocation
- Create secondary indexes for performance
- Future: Implement automated lineage discovery

---

### TD-003: Test TC-EXT-009 Uses Wrong Target

| Field | Value |
|-------|-------|
| **Status** | RESOLVED |
| **Date Identified** | 2024-01-19 |
| **Date Resolved** | 2024-01-30 |
| **Severity** | Low |
| **Component** | run_tests.py |

**Problem:**
Test TC-EXT-009 (Extract Columns - Nullable and Default Values) attempted to verify the `nullable` column by looking up metadata tables. The extraction intentionally excludes `OL_*` tables to avoid self-referential metadata.

**Resolution:**
OpenLineage schema migration resolved this issue. The test should now use columns from test data tables such as:
- `demo_user.SRC_CUSTOMER.customer_id` (should be NOT NULL)
- `demo_user.FACT_SALES.sales_sk` (should be NOT NULL)

---

## Future Considerations

### Specification Document Updates

The specification document (`lineage_plan_database.md`) should be updated to:

1. Add the EXISTS subquery fix to the column extraction query (Section 1.3)
2. Document ClearScape-specific adaptations as an appendix
3. Add notes about filtering out system objects and non-table objects

### Production Deployment Checklist

When deploying to a production Teradata environment:

- [ ] Create dedicated `lineage` database with appropriate space allocation
- [ ] Use original DDL with DEFAULT clauses and partitioning
- [ ] Create all secondary indexes
- [ ] Enable DBQL object logging for automatic lineage discovery
- [ ] Configure watermark-based incremental extraction
- [ ] Set up scheduled extraction jobs
