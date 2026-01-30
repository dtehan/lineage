# Phase 8: Open Lineage Standard Alignment - Research

**Researched:** 2026-01-29
**Domain:** Data lineage standard compliance (OpenLineage.io specification)
**Confidence:** HIGH

## Summary

This research investigates the OpenLineage specification to align the existing custom LIN_* database schema with industry standards. OpenLineage defines a universal lineage metadata model with three core entities (Job, Run, Dataset) and extensible facets for enriched metadata. The current system's column-to-column lineage concept maps conceptually to OpenLineage's ColumnLineageDatasetFacet, while assets (databases, tables, columns) map to Datasets with SchemaDatasetFacet.

The key transformation is conceptual: OpenLineage is event-driven (Run events capture lineage as jobs execute), while the current system stores static lineage relationships. The recommended approach is to adapt the schema to support both the event-based model and a materialized view of current lineage state, enabling future interoperability while maintaining existing query patterns.

**Primary recommendation:** Implement OpenLineage spec version 2-0-2, redesigning the schema to separate Events (Run/Job history) from materialized Datasets/Lineage, adding facet tables for extensibility, and preserving backward-compatible API responses.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenLineage Spec | 2-0-2 | Core schema definition | Official latest stable version |
| JSON Schema (2020-12) | draft 2020-12 | Facet validation | OpenLineage uses this JSON Schema draft |
| UUID v7 | - | Run identifiers | OpenLineage recommends UUIDv7 for new implementations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Marquez | 0.52+ | Reference implementation | For understanding schema patterns (PostgreSQL) |
| Python openlineage-python | 1.43.0 | Client library | If emitting OpenLineage events programmatically |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Full event store | Materialized lineage only | Lose historical run data, simpler schema |
| Custom facet tables | JSONB/CLOB columns | Simpler but less queryable |
| Teradata-native | External Marquez | More complexity but keeps data in platform |

**Installation:**
```bash
# Python client (optional, for future event emission)
pip install openlineage-python==1.43.0

# No Go client library exists - use raw JSON structures
```

## Architecture Patterns

### Recommended Project Structure

The OpenLineage alignment requires restructuring from flat lineage tables to an event-centric model with materialized views.

```
Database Schema (Teradata):
OL_NAMESPACE           # Namespace registry (teradata://host, etc.)
OL_DATASET             # Dataset registry (maps to LIN_TABLE + LIN_DATABASE)
OL_DATASET_VERSION     # Dataset versions with schema changes
OL_DATASET_FIELD       # Fields within datasets (maps to LIN_COLUMN)
OL_JOB                 # Job definitions (ETL processes)
OL_JOB_VERSION         # Job versions
OL_RUN                 # Run instances (job executions)
OL_RUN_EVENT           # Raw OpenLineage events (optional, for full compliance)
OL_LINEAGE             # Materialized column lineage (queryable view)
OL_FACET_*             # Separate tables per facet type
```

### Pattern 1: Event-to-Materialized Lineage

**What:** Store OpenLineage events, then materialize lineage relationships for querying
**When to use:** Full spec compliance, future interoperability
**Example:**
```sql
-- Source: OpenLineage spec adaptation for relational storage

-- Run events create lineage records
-- When a COMPLETE event arrives, extract input/output datasets and their facets
-- Materialize column lineage from ColumnLineageDatasetFacet in output datasets

CREATE TABLE OL_RUN (
    run_id VARCHAR(64) NOT NULL,           -- UUIDv7
    job_namespace VARCHAR(256) NOT NULL,
    job_name VARCHAR(256) NOT NULL,
    event_type VARCHAR(20),                -- START, RUNNING, COMPLETE, ABORT, FAIL
    event_time TIMESTAMP(6) WITH TIME ZONE,
    producer VARCHAR(512),
    schema_url VARCHAR(512),
    PRIMARY KEY (run_id, event_time)
);

-- Materialized lineage from facets
CREATE TABLE OL_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    run_id VARCHAR(64),                    -- Which run discovered this
    source_dataset_namespace VARCHAR(256) NOT NULL,
    source_dataset_name VARCHAR(256) NOT NULL,
    source_field_name VARCHAR(256) NOT NULL,
    target_dataset_namespace VARCHAR(256) NOT NULL,
    target_dataset_name VARCHAR(256) NOT NULL,
    target_field_name VARCHAR(256) NOT NULL,
    transformation_type VARCHAR(50),       -- DIRECT, INDIRECT
    transformation_subtype VARCHAR(50),    -- IDENTITY, AGGREGATION, JOIN, etc.
    transformation_description VARCHAR(2000),
    masking CHAR(1) DEFAULT 'N',
    discovered_at TIMESTAMP(0),
    is_active CHAR(1) DEFAULT 'Y',
    PRIMARY KEY (lineage_id)
);
```

### Pattern 2: Namespace-based Asset Identification

**What:** Use OpenLineage naming conventions for asset IDs
**When to use:** All dataset/job references
**Example:**
```python
# Source: https://openlineage.io/docs/spec/naming

# Current: "demo_user.SRC_CUSTOMER.customer_id"
# OpenLineage namespace: "teradata://{host}:{port}"
# OpenLineage name: "{database}.{table}"
# Field: Stored in SchemaDatasetFacet

def to_openlineage_dataset(database: str, table: str, host: str, port: int = 1025):
    """Convert Teradata table to OpenLineage Dataset reference."""
    return {
        "namespace": f"teradata://{host}:{port}",
        "name": f"{database}.{table}"
    }

def to_openlineage_field(column_id: str):
    """Extract field name from column_id."""
    # "demo_user.SRC_CUSTOMER.customer_id" -> "customer_id"
    parts = column_id.split(".")
    return parts[-1] if len(parts) >= 3 else column_id
```

### Pattern 3: Facet Storage in Relational Tables

**What:** Store each facet type in dedicated tables rather than JSON blobs
**When to use:** Teradata environment (no native JSON querying), need for SQL-based facet queries
**Example:**
```sql
-- Source: Marquez pattern adapted for Teradata

-- Schema facet stored as dataset fields
CREATE TABLE OL_DATASET_FIELD (
    dataset_id VARCHAR(256) NOT NULL,
    field_name VARCHAR(256) NOT NULL,
    field_type VARCHAR(256),
    field_description VARCHAR(2000),
    ordinal_position INTEGER,              -- 1-indexed per spec
    PRIMARY KEY (dataset_id, field_name)
);

-- Ownership facet
CREATE TABLE OL_DATASET_OWNER (
    dataset_id VARCHAR(256) NOT NULL,
    owner_name VARCHAR(256) NOT NULL,
    owner_type VARCHAR(50),                -- MAINTAINER, TECHNICAL_OWNER, etc.
    PRIMARY KEY (dataset_id, owner_name)
);

-- Data quality metrics facet (input datasets)
CREATE TABLE OL_DATA_QUALITY_METRICS (
    dataset_id VARCHAR(256) NOT NULL,
    run_id VARCHAR(64) NOT NULL,
    row_count BIGINT,
    bytes BIGINT,
    file_count INTEGER,
    PRIMARY KEY (dataset_id, run_id)
);

-- Column-level data quality
CREATE TABLE OL_COLUMN_METRICS (
    dataset_id VARCHAR(256) NOT NULL,
    run_id VARCHAR(64) NOT NULL,
    field_name VARCHAR(256) NOT NULL,
    null_count BIGINT,
    distinct_count BIGINT,
    min_value VARCHAR(256),
    max_value VARCHAR(256),
    quantiles_json VARCHAR(10000),        -- Store as JSON string
    PRIMARY KEY (dataset_id, run_id, field_name)
);
```

### Anti-Patterns to Avoid

- **Storing full JSON events in CLOB:** Teradata has limited JSON query support; prefer relational tables
- **Single facets table:** Don't store all facet types in one table with type discriminator - use separate tables
- **Ignoring versioning:** OpenLineage tracks dataset/job versions; don't flatten to single current state only
- **Breaking asset ID format:** Keep OpenLineage naming convention (namespace + name) even if mapped internally

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID v7 generation | Custom timestamp-based ID | Use uuid7 library or database function | Ordering, uniqueness guarantees |
| JSON facet validation | Custom validation logic | JSON Schema validators | OpenLineage provides schemas |
| Namespace parsing | Regex string splitting | URI parsing libraries | Handles edge cases (escaping, ports) |
| Column lineage graph | Custom graph algorithms | Existing recursive CTE patterns | Already implemented, proven |
| Transformation type mapping | Custom enum | OpenLineage defined types | DIRECT/INDIRECT with subtypes |

**Key insight:** OpenLineage defines precise semantics for transformation types (DIRECT vs INDIRECT, with subtypes like IDENTITY, AGGREGATION, JOIN, FILTER). Use these exactly rather than inventing similar concepts.

## Common Pitfalls

### Pitfall 1: Conflating Events and State

**What goes wrong:** Treating OpenLineage as a static schema definition rather than event stream
**Why it happens:** Current system stores current-state lineage; OpenLineage captures events
**How to avoid:** Design for events first, then materialize current state as derived view
**Warning signs:** Schema has no run/event tables, only lineage relationships

### Pitfall 2: Incorrect Namespace Format

**What goes wrong:** Using database names as namespaces instead of connection URIs
**Why it happens:** Teradata assets are typically referenced by database.table.column
**How to avoid:** Namespace must be URI format: `teradata://{host}:{port}`
**Warning signs:** Namespace field contains "demo_user" instead of "teradata://host:1025"

### Pitfall 3: Losing Transformation Semantics

**What goes wrong:** Mapping all transformations to simple types, losing DIRECT/INDIRECT distinction
**Why it happens:** Current schema has transformation_type but not the subtype hierarchy
**How to avoid:** Map current types: DIRECT->DIRECT/IDENTITY, CALCULATION->DIRECT/TRANSFORMATION, AGGREGATION->DIRECT/AGGREGATION, JOIN->INDIRECT/JOIN
**Warning signs:** All lineage marked as DIRECT without subtype detail

### Pitfall 4: Breaking API Backward Compatibility

**What goes wrong:** Changing API response structure breaks frontend
**Why it happens:** Schema changes propagate to API without compatibility layer
**How to avoid:** Add OpenLineage-style endpoints alongside existing; transform internally
**Warning signs:** Frontend breaks after schema migration

### Pitfall 5: Ignoring Facet Schema URLs

**What goes wrong:** Storing facets without _schemaURL reference
**Why it happens:** Seems like overhead for internal use
**How to avoid:** Always include _schemaURL for spec compliance; enables validation
**Warning signs:** Facet data has no schema version tracking

## Code Examples

Verified patterns from official sources:

### OpenLineage RunEvent Structure
```json
// Source: https://openlineage.io/docs/spec/object-model
{
  "eventType": "COMPLETE",
  "eventTime": "2024-01-15T10:00:00.000Z",
  "run": {
    "runId": "01234567-89ab-cdef-0123-456789abcdef"
  },
  "job": {
    "namespace": "teradata://demo.teradata.com:1025",
    "name": "demo_user.ETL_CUSTOMER_LOAD"
  },
  "inputs": [
    {
      "namespace": "teradata://demo.teradata.com:1025",
      "name": "demo_user.SRC_CUSTOMER",
      "facets": {
        "schema": {
          "_producer": "https://lineage-app.example.com",
          "_schemaURL": "https://openlineage.io/spec/facets/1-1-1/SchemaDatasetFacet.json",
          "fields": [
            {"name": "customer_id", "type": "INTEGER"},
            {"name": "first_name", "type": "VARCHAR(100)"},
            {"name": "last_name", "type": "VARCHAR(100)"}
          ]
        }
      }
    }
  ],
  "outputs": [
    {
      "namespace": "teradata://demo.teradata.com:1025",
      "name": "demo_user.STG_CUSTOMER",
      "facets": {
        "schema": {
          "_producer": "https://lineage-app.example.com",
          "_schemaURL": "https://openlineage.io/spec/facets/1-1-1/SchemaDatasetFacet.json",
          "fields": [
            {"name": "customer_id", "type": "INTEGER"},
            {"name": "full_name", "type": "VARCHAR(201)"}
          ]
        },
        "columnLineage": {
          "_producer": "https://lineage-app.example.com",
          "_schemaURL": "https://openlineage.io/spec/facets/1-2-0/ColumnLineageDatasetFacet.json",
          "fields": {
            "customer_id": {
              "inputFields": [
                {
                  "namespace": "teradata://demo.teradata.com:1025",
                  "name": "demo_user.SRC_CUSTOMER",
                  "field": "customer_id",
                  "transformations": [
                    {"type": "DIRECT", "subtype": "IDENTITY"}
                  ]
                }
              ]
            },
            "full_name": {
              "inputFields": [
                {
                  "namespace": "teradata://demo.teradata.com:1025",
                  "name": "demo_user.SRC_CUSTOMER",
                  "field": "first_name",
                  "transformations": [
                    {"type": "DIRECT", "subtype": "TRANSFORMATION", "description": "CONCAT(first_name, ' ', last_name)"}
                  ]
                },
                {
                  "namespace": "teradata://demo.teradata.com:1025",
                  "name": "demo_user.SRC_CUSTOMER",
                  "field": "last_name",
                  "transformations": [
                    {"type": "DIRECT", "subtype": "TRANSFORMATION", "description": "CONCAT(first_name, ' ', last_name)"}
                  ]
                }
              ]
            }
          }
        }
      }
    }
  ],
  "producer": "https://lineage-app.example.com",
  "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json"
}
```

### Current to OpenLineage Transformation Type Mapping
```python
# Source: https://openlineage.io/docs/spec/facets/dataset-facets/column_lineage_facet

TRANSFORMATION_MAPPING = {
    # Current type -> (OpenLineage type, subtype)
    "DIRECT": ("DIRECT", "IDENTITY"),
    "CALCULATION": ("DIRECT", "TRANSFORMATION"),
    "AGGREGATION": ("DIRECT", "AGGREGATION"),
    "JOIN": ("INDIRECT", "JOIN"),
    "FILTER": ("INDIRECT", "FILTER"),
}

def map_transformation(current_type: str) -> dict:
    """Map current transformation type to OpenLineage format."""
    ol_type, ol_subtype = TRANSFORMATION_MAPPING.get(
        current_type.upper(), ("DIRECT", "TRANSFORMATION")
    )
    return {
        "type": ol_type,
        "subtype": ol_subtype
    }
```

### Migration Query: LIN_COLUMN_LINEAGE to OL_COLUMN_LINEAGE
```sql
-- Source: Schema mapping based on OpenLineage spec

INSERT INTO OL_COLUMN_LINEAGE (
    lineage_id,
    run_id,
    source_dataset_namespace,
    source_dataset_name,
    source_field_name,
    target_dataset_namespace,
    target_dataset_name,
    target_field_name,
    transformation_type,
    transformation_subtype,
    discovered_at,
    is_active
)
SELECT
    lineage_id,
    NULL as run_id,  -- Historical data has no run context
    'teradata://' || :host || ':' || :port as source_dataset_namespace,
    source_database || '.' || source_table as source_dataset_name,
    source_column as source_field_name,
    'teradata://' || :host || ':' || :port as target_dataset_namespace,
    target_database || '.' || target_table as target_dataset_name,
    target_column as target_field_name,
    CASE transformation_type
        WHEN 'DIRECT' THEN 'DIRECT'
        WHEN 'CALCULATION' THEN 'DIRECT'
        WHEN 'AGGREGATION' THEN 'DIRECT'
        WHEN 'JOIN' THEN 'INDIRECT'
        WHEN 'FILTER' THEN 'INDIRECT'
        ELSE 'DIRECT'
    END as transformation_type,
    CASE transformation_type
        WHEN 'DIRECT' THEN 'IDENTITY'
        WHEN 'CALCULATION' THEN 'TRANSFORMATION'
        WHEN 'AGGREGATION' THEN 'AGGREGATION'
        WHEN 'JOIN' THEN 'JOIN'
        WHEN 'FILTER' THEN 'FILTER'
        ELSE 'TRANSFORMATION'
    END as transformation_subtype,
    discovered_at,
    is_active
FROM LIN_COLUMN_LINEAGE;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom lineage schemas | OpenLineage standard | 2021 (spec v1.0) | Industry interoperability |
| Table-level lineage only | Column-level lineage facet | OpenLineage 0.7.0 | Fine-grained tracking |
| Static lineage | Event-driven with runs | OpenLineage design | Historical tracking |
| Single transformation type | Type + subtype + masking | OpenLineage 1.0 | Richer semantics |

**Deprecated/outdated:**
- Custom lineage schemas: Industry moving to OpenLineage for interoperability
- String-based transformation types without hierarchy: OpenLineage defines DIRECT/INDIRECT with subtypes

## Custom Facets for Teradata

Per user decision, Claude has discretion on Teradata-specific custom facets. Recommendation:

### Recommended Custom Facets

```json
// teradata_DbqlQueryRunFacet - Link runs to DBQL queries
{
  "_producer": "https://lineage-app.example.com",
  "_schemaURL": "https://lineage-app.example.com/spec/facets/TeradataDbqlQueryRunFacet.json",
  "queryId": "12345678",
  "procId": 1234,
  "userName": "etl_user",
  "statementType": "INSERT",
  "ampCpuTime": 1.234,
  "totalIoCount": 5678
}
```

**Namespace prefix:** `teradata_` (following OpenLineage custom facet naming convention)

**Rationale:** DBQL metadata is valuable for performance analysis and audit but not part of core lineage. Custom facet preserves this without polluting standard facets.

## Open Questions

Things that couldn't be fully resolved:

1. **Migration Strategy: Big Bang vs Incremental**
   - What we know: Both approaches viable; schema changes are significant
   - What's unclear: User preference on downtime vs complexity
   - Recommendation: Use incremental approach with both old and new tables during transition period; migrate data in batches; switch API when ready

2. **Event Storage Depth**
   - What we know: Full spec stores all events; system only needs materialized lineage
   - What's unclear: Whether to store raw events for future replay capability
   - Recommendation: Store events in OL_RUN_EVENT table but make it optional; primary value is materialized lineage

3. **Teradata Host/Port Configuration**
   - What we know: Namespace requires connection URI
   - What's unclear: How to handle multiple Teradata instances
   - Recommendation: Add TERADATA_HOST configuration for namespace; default to existing connection config

## Sources

### Primary (HIGH confidence)
- [OpenLineage Object Model](https://openlineage.io/docs/spec/object-model/) - Core entity definitions
- [OpenLineage Naming Convention](https://openlineage.io/docs/spec/naming) - Namespace/name patterns
- [Column Lineage Dataset Facet](https://openlineage.io/docs/spec/facets/dataset-facets/column_lineage_facet) - Field-level lineage spec
- [OpenLineage JSON Schema v2-0-2](https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.json) - Authoritative schema
- [OpenLineage GitHub Facets](https://github.com/OpenLineage/OpenLineage/tree/main/spec/facets) - All facet schemas
- [OpenLineage Releases](https://github.com/OpenLineage/OpenLineage/releases) - Version 1.43.0 latest

### Secondary (MEDIUM confidence)
- [Marquez Project](https://marquezproject.ai/) - Reference PostgreSQL implementation patterns
- [Marquez Database Migrations](https://github.com/MarquezProject/marquez) - Schema design inspiration

### Tertiary (LOW confidence)
- Community blog posts on OpenLineage adoption - General patterns only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official OpenLineage spec and releases verified
- Architecture: MEDIUM - Patterns adapted from Marquez; Teradata-specific needs validation
- Pitfalls: MEDIUM - Based on spec analysis and common migration patterns

**Research date:** 2026-01-29
**Valid until:** 2026-03-29 (OpenLineage spec is stable; 60-day validity)

---

## Appendix: Complete OpenLineage Facet Reference

### Dataset Facets (Common)
| Facet | Purpose | Priority for Phase 8 |
|-------|---------|---------------------|
| SchemaDatasetFacet | Field names/types | HIGH - maps to LIN_COLUMN |
| ColumnLineageDatasetFacet | Field-level lineage | HIGH - core requirement |
| OwnershipDatasetFacet | Dataset owners | MEDIUM - per user decision |
| DataQualityMetricsDatasetFacet | Quality metrics | MEDIUM - per user decision |
| DataQualityAssertionsDatasetFacet | Quality rules | MEDIUM - per user decision |
| DocumentationDatasetFacet | Description | LOW - comment_string exists |
| DatasourceDatasetFacet | Source info | LOW - implicit in namespace |
| LifecycleStateChangeDatasetFacet | Create/drop events | LOW - future enhancement |
| TagsDatasetFacet | Metadata tags | LOW - future enhancement |

### Job Facets
| Facet | Purpose | Priority for Phase 8 |
|-------|---------|---------------------|
| SQLJobFacet | SQL query text | MEDIUM - from LIN_QUERY |
| SourceCodeLocationJobFacet | Git location | LOW - not applicable |
| OwnershipJobFacet | Job owners | LOW - future enhancement |

### Run Facets
| Facet | Purpose | Priority for Phase 8 |
|-------|---------|---------------------|
| NominalTimeRunFacet | Scheduled time | LOW - not scheduling system |
| ParentRunFacet | Parent run link | LOW - future enhancement |
| ErrorMessageRunFacet | Failure details | LOW - future enhancement |

### Transformation Types Reference
| Type | Subtype | Description | Current Mapping |
|------|---------|-------------|-----------------|
| DIRECT | IDENTITY | Direct copy, no transformation | DIRECT |
| DIRECT | TRANSFORMATION | Value derived/computed | CALCULATION |
| DIRECT | AGGREGATION | Aggregated value | AGGREGATION |
| INDIRECT | JOIN | Affects via join condition | JOIN |
| INDIRECT | FILTER | Affects via filter condition | FILTER |
| INDIRECT | GROUP_BY | Affects via grouping | (new) |
| INDIRECT | SORT | Affects via ordering | (new) |
| INDIRECT | WINDOW | Affects via window function | (new) |
| INDIRECT | CONDITIONAL | Affects via CASE/IF | (new) |
