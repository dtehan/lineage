# Phase 8 Plan 1: OpenLineage Database Schema Summary

**One-liner:** OpenLineage-aligned OL_* schema with 9 tables, 18 indexes, and CLI flags for spec v2-0-2 compliance

---

## Frontmatter

```yaml
phase: 08-open-lineage-standard-alignment
plan: 01
subsystem: database
tags: [openlineage, teradata, schema, ddl]

dependency-graph:
  requires: []
  provides: [ol-schema, ol-ddl-statements, ol-index-statements]
  affects: [08-02, 08-03, 08-04]

tech-stack:
  added: []
  patterns: [openlineage-spec-v2-0-2, namespace-uri-pattern, materialized-lineage]

key-files:
  created: []
  modified:
    - database/setup_lineage_schema.py

decisions:
  - id: 08-01-01
    choice: "OL_* table prefix for OpenLineage-aligned tables"
    rationale: "Clear distinction from existing LIN_* tables during migration"
  - id: 08-01-02
    choice: "Materialized column lineage in OL_COLUMN_LINEAGE"
    rationale: "Enables efficient graph traversal queries while maintaining OpenLineage semantics"
  - id: 08-01-03
    choice: "--openlineage and --openlineage-only CLI flags"
    rationale: "Backward compatibility - default behavior unchanged, opt-in for new schema"
  - id: 08-01-04
    choice: "transformation_type and transformation_subtype columns"
    rationale: "OpenLineage spec v2-0-2 defines DIRECT/INDIRECT types with subtypes"
  - id: 08-01-05
    choice: "OL_SCHEMA_VERSION table for spec tracking"
    rationale: "Track which OpenLineage spec version schema implements"

metrics:
  duration: 3 min
  completed: 2026-01-30
```

---

## Summary

Created OpenLineage-aligned database schema following spec v2-0-2. Added 9 new OL_* tables to store namespaces, datasets, fields, jobs, runs, and materialized column lineage. Added 18 indexes for efficient query patterns. Updated main() with --openlineage flag for opt-in creation alongside existing LIN_* tables.

## What Was Done

### Task 1: Add OL_* table DDL statements
**Commit:** 193283a

Added `OL_DDL_STATEMENTS` list with 9 table definitions:
- **OL_NAMESPACE** - Connection URI registry (teradata://host:port)
- **OL_DATASET** - Table registry with namespace reference
- **OL_DATASET_FIELD** - Column registry with ordinal_position
- **OL_JOB** - ETL process definitions
- **OL_RUN** - Job execution instances with event_type (START/RUNNING/COMPLETE/ABORT/FAIL)
- **OL_RUN_INPUT** - Run to input dataset mapping
- **OL_RUN_OUTPUT** - Run to output dataset mapping
- **OL_COLUMN_LINEAGE** - Materialized lineage with transformation_type/subtype
- **OL_SCHEMA_VERSION** - Schema and spec version tracking

### Task 2: Add OL_* index statements
**Commit:** b32ef4e

Added `OL_INDEX_STATEMENTS` list with 18 indexes:
- Namespace lookups (namespace_uri)
- Dataset lookups (namespace_id, name)
- Field lookups (dataset_id, field_name)
- Job lookups (namespace_id, name)
- Run lookups (job_id, event_time, event_type)
- Run input/output lookups (dataset_id)
- Column lineage graph traversal (source_dataset, source_field, target_dataset, target_field, run_id, transformation_type)

### Task 3: Update main() to create OL_* tables
**Commit:** 54ed688

Updated main() function:
- Added argparse with `--openlineage` / `-o` and `--openlineage-only` flags
- Added `ol_tables_to_drop` list for proper drop ordering
- Conditionally creates OL_* tables when flags are used
- Inserts initial OL_SCHEMA_VERSION record (spec 2-0-2, schema 1.0.0)
- Updated verification to show both LIN_* and OL_* tables
- Default behavior (no flags) unchanged for backward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Table prefix | OL_* | Distinguishes from LIN_* during migration period |
| Namespace format | URI (teradata://host:port) | OpenLineage spec requirement |
| Lineage storage | Materialized table | Efficient graph queries vs event replay |
| Transformation types | type + subtype columns | Matches spec (DIRECT/INDIRECT + subtypes) |
| CLI flags | Opt-in with default unchanged | Backward compatibility |

## Key Files

| File | Changes |
|------|---------|
| database/setup_lineage_schema.py | Added OL_DDL_STATEMENTS (9 tables), OL_INDEX_STATEMENTS (18 indexes), argparse with --openlineage flags |

## Verification Results

- [x] Syntax check passed: `python -m py_compile` succeeds
- [x] OL_DDL_STATEMENTS contains all 9 table definitions
- [x] OL_INDEX_STATEMENTS contains all 18 index definitions
- [x] main() handles --openlineage and --openlineage-only flags
- [x] OL_COLUMN_LINEAGE has transformation_type and transformation_subtype columns
- [x] OL_SCHEMA_VERSION tracks spec version 2-0-2

## Next Phase Readiness

### Prerequisites Met
- OL_* schema ready for data population scripts
- Indexes designed for lineage graph traversal
- Schema version tracking in place

### Blockers/Concerns
None identified.

### Handoff Notes
- Plan 08-02 can now implement data migration scripts
- Namespace URI must be configured from TERADATA_HOST environment variable
- transformation_type mapping: DIRECT->DIRECT/IDENTITY, CALCULATION->DIRECT/TRANSFORMATION, AGGREGATION->DIRECT/AGGREGATION, JOIN->INDIRECT/JOIN, FILTER->INDIRECT/FILTER
