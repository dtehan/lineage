# Phase 8: Open Lineage Standard Alignment - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform custom LIN_* database schema and associated data pipeline to conform to the Open Lineage standard (openlineage.io) for lineage metadata. This phase delivers interoperability with industry-standard lineage tools by aligning database structure, population scripts (populate_lineage.py, extract_dbql_lineage.py), API layer (Go backend), and GUI (React frontend) to the Open Lineage specification.

</domain>

<decisions>
## Implementation Decisions

### Standard Compliance Level
- **Full spec compliance** - Implement all defined Open Lineage facets and follow every spec recommendation
- **All facets with equal priority** - Schema facets (column-level schema/types), data quality facets (assertions, metrics, validation), ownership facets (stewards, teams, contacts), and all other spec-defined facets
- **Lock to current version** - Implement against a specific Open Lineage spec version (determine latest stable during research) and treat future spec changes as separate upgrade projects
- Spec version should be documented in database schema, API responses, and configuration

### Custom Extensions
- Claude's discretion on whether to allow custom facets for Teradata-specific metadata (DBQL query IDs, transformation logic details)
- If custom facets added, they must be properly namespaced/prefixed per Open Lineage extension guidelines
- Core entities (Run, Job, Dataset) and relationships must strictly follow spec

</decisions>

<specifics>
## Specific Ideas

No specific requirements provided - open to standard approaches for:
- Schema migration strategy (how to transition from LIN_* to Open Lineage schema)
- Data transformation approach (mapping existing lineage data to Open Lineage format)
- API compatibility (handling existing API consumers during transition)

These areas not discussed but will need to be addressed during research and planning.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 08-open-lineage-standard-alignment*
*Context gathered: 2026-01-29*
