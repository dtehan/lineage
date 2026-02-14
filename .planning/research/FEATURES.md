# Feature Landscape: Impact Analysis & Error Handling

**Domain:** Column-level data lineage application for Teradata
**Researched:** 2026-02-13

## Table Stakes

Features users expect from data lineage tools with impact analysis. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Downstream Impact List** | Core impact analysis deliverable — shows what breaks when you change something | Low | Already partially implemented (ImpactAnalysis.tsx exists). Needs API integration with existing lineage graph traversal |
| **Direct vs Indirect Dependencies** | Standard in dependency analysis tools (94% of codebases have transitive dependencies) | Low | Visual distinction (badges/colors), depth calculation already in ImpactedAsset type |
| **Column-Level Impact** | Differentiator for column-level lineage tools — table-level is insufficient for schema changes | Medium | Leverage existing OL_COLUMN_LINEAGE recursive CTEs, extend to count affected columns per table |
| **Affected Asset Count Summary** | Users need blast radius quantification before taking action | Low | Aggregate nodes/edges from lineage graph response, group by database/table/column |
| **Error State Handling** | Modern web apps require graceful degradation when APIs fail | Low | Already implemented in DDLTab.tsx (lines 33-50), needs replication across components |
| **Retry Mechanism** | Standard UX for transient failures (network, DB locks, timeouts) | Low | Already in DDLTab.tsx, pattern should be standardized |
| **Inline Warning Notifications** | Non-blocking warnings (truncation, missing metadata) shown in context | Low | Already implemented for view SQL truncation (DDLTab.tsx lines 90-94) |
| **Loading States with Context** | Users need to know what's happening during long queries (CTEs on large graphs) | Low | LoadingSpinner exists, add contextual messages ("Traversing lineage graph...") |

## Differentiators

Features that set product apart from basic lineage tools. Not expected, but highly valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Depth-Based Filtering** | Control blast radius scope — "show me only 2 hops downstream" | Low | maxDepth already in API (/api/v2/openlineage/lineage), add UI slider control |
| **What-If Analysis Preview** | Simulate impact before making changes — "what if I drop this column?" | High | Requires computation over lineage graph without persisting changes, read-only mode on existing traversal |
| **Transformation Type Breakdown** | Show HOW data flows (IDENTITY, AGGREGATION, JOIN) not just that it flows | Medium | transformation_type already in OL_COLUMN_LINEAGE, group edges by type in impact summary |
| **Export Impact Report** | Stakeholder communication for change approval (PDF, CSV) | Medium | Export graph data with summary statistics, use existing edge/node data |
| **Real-Time Lineage Sync** | Reflect schema changes immediately vs periodic refresh | High | Out of scope for milestone — requires change detection on DBC views |
| **Impact Severity Scoring** | Classify assets as CRITICAL/MEDIUM/LOW based on downstream consumer count | Medium | Count consumers per node, threshold-based classification (>10=critical, 5-10=medium, <5=low) |
| **Change History Tracking** | "Show me what changed last week" for lineage drift detection | High | Out of scope — requires historical OL_COLUMN_LINEAGE snapshots |
| **Affected Job/Process Identification** | Map lineage to OL_JOB/OL_RUN to show which ETL jobs break | Medium | Join lineage graph with OL_RUN_INPUT/OUTPUT, show affected job names |
| **Impact on Business Glossary Terms** | Business impact beyond technical dependencies | High | Out of scope — requires business metadata layer not in OpenLineage schema |
| **Collaborative Annotations** | Team can comment on lineage nodes ("known issue", "migration planned") | High | Out of scope — requires user management and comment storage |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Auto-Fix Recommendations** | Dangerous in production data pipelines — false positives cause data loss | Provide impact information only; let humans decide fixes |
| **Real-Time Change Detection** | Requires polling DBC views or event streams — performance/permission issues on Teradata | Manual refresh button; assume lineage is populated periodically |
| **Cross-Database Lineage** | Out of scope — assumes single Teradata instance via OL_NAMESPACE | Document limitation; multi-namespace support is future work |
| **AI-Powered Impact Prediction** | Overpromising without ML training data — users expect accuracy | Show deterministic graph traversal results only |
| **Inline Schema Editing** | Scope creep — this is a lineage viewer, not a schema management tool | Link to external tools (DBeaver, Teradata Studio) |
| **Custom Lineage Overrides** | Breaks trust in automated lineage — users won't know what's real vs manual | Surface data quality issues; fix at source (populate_lineage.py) |
| **Permission-Based Lineage Filtering** | Complex RBAC layer on top of Teradata permissions — double security model | Inherit Teradata user permissions via DB connection; no additional auth layer |

## Feature Dependencies

```
Core Dependencies (existing features):
- Lineage Graph Traversal (OL_COLUMN_LINEAGE CTEs) → Impact Analysis
- OpenLineage Schema (OL_DATASET, OL_DATASET_FIELD) → Metadata Display
- React Flow Visualization → Impact Graph Visualization (optional)

New Feature Dependencies:
- Downstream Impact List (table stakes) → Everything else builds on this
- Error State Handling → Retry Mechanism → Structured Logging
- Direct vs Indirect Dependencies → Depth-Based Filtering
- Affected Asset Count → Impact Severity Scoring
- Transformation Type Breakdown → Export Impact Report
```

## Error Handling & Logging Features

Users expect visibility into system behavior, especially for failures.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Structured Error Messages** | Generic "Error 500" is useless; users need actionable context | Low | Replace bare Exception with custom exception classes (LineageError, DBConnectionError) |
| **Partial Success Handling** | Statistics API may fail but lineage succeeds — show both outcomes | Low | Don't fail entire request; return statistics: null with error flag |
| **Timeout Warnings** | Long-running CTEs (10+ seconds) need progress indication | Medium | Backend timeout detection, frontend polling for status |
| **Permission Error Clarity** | DBC view access denied → explain which permission is missing | Medium | Catch Teradata error codes, map to user-friendly messages ("Requires SELECT on DBC.TablesV") |
| **Truncation Visibility** | View SQL truncated at 12,500 chars — user must know data is incomplete | Low | Already implemented (DDLTab.tsx); ensure consistency across all truncation scenarios |
| **Database Connection Status** | Frontend should detect backend unavailability before user action | Low | Health check endpoint /health already exists; poll periodically from UI |
| **Query Performance Metrics** | Power users want to know "why did this take 30 seconds?" | Medium | Log CTE execution time in backend, optionally surface in UI detail panel |

## Error Notification Patterns

Based on industry best practices (Carbon Design System, React notification libraries).

| Scenario | Pattern | Why | Complexity |
|----------|---------|-----|-----------|
| **Critical Errors (Backend Down)** | Modal dialog | Blocks workflow until acknowledged | Low |
| **Recoverable Errors (Query Failed)** | Inline error with Retry button | Keeps user in context, actionable | Low |
| **Transient Warnings (Statistics Unavailable)** | Toast notification (auto-dismiss) | Non-blocking, informational | Low |
| **Data Quality Warnings (Truncation)** | Inline banner (persistent) | Critical to interpretation, must be visible while viewing data | Low |
| **System Notifications (Refresh Available)** | Toast with action button | Non-urgent, user-initiated | Medium |

**Key Principle:** Toasts for system-generated messages; inline for context-specific issues; modals only for blocking errors.

## MVP Recommendation

### Phase 1: Core Impact Analysis (Week 1-2)

**Prioritize:**
1. **Downstream Impact List** — Use existing lineage API, render in ImpactAnalysis.tsx
2. **Direct vs Indirect Dependencies** — Add depth calculation and badges
3. **Affected Asset Count Summary** — Aggregate graph data (count nodes by database)
4. **Column-Level Impact** — Extend table lineage to show affected columns per table

**Defer:**
- What-If Analysis (needs separate graph computation)
- Export Impact Report (nice-to-have, not blocking)
- Impact Severity Scoring (requires heuristics design)

### Phase 2: Error Handling Improvements (Week 2)

**Prioritize:**
1. **Structured Exception Classes** — LineageError, DBConnectionError (backend)
2. **Inline Error States** — Standardize DDLTab.tsx pattern across all API calls
3. **Retry Mechanism** — Add to all GET endpoints with idempotent queries
4. **Partial Success Handling** — Statistics failures don't break page loads

**Defer:**
- Query Performance Metrics (nice-to-have)
- Timeout Warnings (requires backend streaming or polling)

### Phase 3: Error Visibility (Week 3)

**Prioritize:**
1. **Truncation Warnings** — Ensure consistent display across all SQL views
2. **Permission Error Clarity** — Map Teradata error codes to helpful messages
3. **Toast Notification System** — Add react-hot-toast for non-blocking warnings

**Defer:**
- Database Connection Status Polling (low ROI)

## Implementation Notes

### Impact Analysis Data Flow

```
Frontend Request → GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}?direction=downstream&maxDepth=5
                ↓
Backend CTE     → Traverse OL_COLUMN_LINEAGE recursively with cycle detection
                ↓
Graph Response  → { nodes: [...], edges: [...] }
                ↓
Frontend Parse  → Calculate depth, classify direct/indirect, aggregate counts
                ↓
UI Render       → ImpactSummary + ImpactedAssets table
```

**Key Insight:** All computation happens in Teradata CTE; frontend is presentation layer.

### Error Handling Data Flow

```
Backend Exception → Catch at route handler
                  ↓
Log Structured    → logger.error("Statistics query failed", extra={"datasetId": ..., "error": ...})
                  ↓
Return 500        → {"error": "Failed to fetch statistics", "details": "Permission denied on DBC.TableSizeV"}
                  ↓
Frontend Catch    → useQuery onError handler
                  ↓
Display Inline    → <ErrorState message={error.details} onRetry={refetch} />
```

**Key Insight:** Don't leak stack traces; provide actionable context.

### Truncation Warning Pattern

```typescript
// Backend: Check RequestTxtOverFlow flag
truncated = tab_row[3] == "Y" if tab_row[3] else False

// Frontend: Persistent inline warning
{data.truncated && (
  <div className="mb-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded">
    SQL truncated at 12,500 characters. Full definition may be longer.
  </div>
)}
```

**Key Insight:** Truncation is a data quality issue, not a transient error — must be persistent and in-context.

## Existing Features to Leverage

The application already has strong foundations:

1. **Lineage Graph Traversal** — Recursive CTEs in python_server.py handle upstream/downstream with cycle detection
2. **OpenLineage Schema** — Full metadata in OL_DATASET, OL_DATASET_FIELD, OL_COLUMN_LINEAGE
3. **React Flow Visualization** — Can render impact graphs if needed (optional)
4. **Error Handling Pattern** — DDLTab.tsx shows best practice (retry, inline errors, loading states)
5. **Type Safety** — ImpactedAsset, ImpactSummary types already defined in types/index.ts
6. **API Structure** — RESTful OpenLineage v2 API with consistent response formats

**Strategy:** Extend existing patterns rather than reinventing.

## Dependencies on Existing Features

| New Feature | Depends On | Status |
|-------------|-----------|--------|
| Impact Analysis UI | Lineage Graph API | ✅ Implemented (/api/v2/openlineage/lineage/{datasetId}/{fieldName}) |
| Column-Level Impact | OL_COLUMN_LINEAGE table | ✅ Populated by populate_lineage.py |
| Direct/Indirect Classification | Recursive CTE depth tracking | ✅ Implemented (depth field in CTE) |
| Transformation Type Display | OL_COLUMN_LINEAGE.transformation_type | ✅ Populated (DIRECT/INDIRECT + subtypes) |
| Error Retry Mechanism | TanStack Query refetch | ✅ Used in DDLTab.tsx (useDatasetDDL hook) |
| Truncation Warning | DBC.TablesV.RequestTxtOverFlow | ✅ Queried in get_dataset_ddl endpoint |
| Affected Job Tracking | OL_JOB, OL_RUN tables | ⚠️ Schema exists but not fully utilized |

## Complexity Assessment

| Category | Low (1-2 days) | Medium (3-5 days) | High (1-2 weeks) |
|----------|---------------|------------------|-----------------|
| **Impact Analysis** | Affected Asset Count, Direct/Indirect badges | Column-Level Impact, Transformation Breakdown | What-If Analysis, Change History |
| **Error Handling** | Structured Exceptions, Inline Error States, Retry | Permission Error Mapping, Timeout Detection | Real-Time Health Monitoring |
| **UI Patterns** | Toast Notifications, Loading States | Export Reports, Depth Filtering | Collaborative Annotations |

## Sources

This research is based on:

### Industry Best Practices (2026)
- [How Data Lineage & Impact Analysis Work | 2026 Guide](https://atlan.com/know/data-lineage-impact-analysis/)
- [Best Data Lineage Tools Compared 2026: Features and Factors](https://www.alation.com/blog/data-lineage-tools/)
- [Data Lineage Best Practices for 2026: Ensure Accuracy & Compliance](https://www.ovaledge.com/blog/data-lineage-best-practices)
- [9 Best Data Lineage Tools in 2026](https://atlan.com/data-lineage-tools/)

### Impact Analysis & Blast Radius
- [Collibra Data Lineage Features](https://productresources.collibra.com/docs/collibra/latest//Content/CollibraDataLineage/co_collibra-data-lineage.htm)
- [Atlan + GitHub Integration for Impact Analysis](https://atlan.com/features/github-dbt-integration/)
- [Direct vs. Transitive Dependencies Analysis](https://www.arnica.io/blog/direct-vs-transitive-dependencies-navigating-package-management-in-software-composition-analysis-sca)

### Error Handling & UI Patterns
- [Error Messages UX — Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/error-messages-ux/)
- [Carbon Design System - Notification Pattern](https://carbondesignsystem.com/patterns/notification-pattern/)
- [Toast UI Design: Best Practices](https://mobbin.com/glossary/toast)
- [Top 9 React Notification Libraries in 2026](https://knock.app/blog/the-top-notification-libraries-for-react)

### Data Lineage Technical Guidance
- [Data Lineage Tracking: Complete Guide for 2026](https://atlan.com/know/data-lineage-tracking/)
- [What Is Data Lineage? How It Works, Benefits & Tools 2026](https://atlan.com/data-lineage-explained/)

### Codebase Analysis
- Existing implementation in `lineage-ui/src/components/domain/ImpactAnalysis/ImpactAnalysis.tsx`
- Type definitions in `lineage-ui/src/types/index.ts` and `openlineage.ts`
- Backend API in `lineage-api/python_server.py` (lines 686-1447)
- Error handling pattern in `lineage-ui/src/components/domain/LineageGraph/DetailPanel/DDLTab.tsx`
