---
phase: 10-view-lineage-show-data-flow-through-views-to-source-tables
verified: 2026-02-19T18:05:00Z
status: passed
score: 10/10 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 5/5
  previous_scope: "Plan 10-01 only (sourceType propagation)"
  current_scope: "Plans 10-01 and 10-02 (sourceType propagation + ViewLineageExtractor)"
  gaps_closed:
    - "Plan 10-02 gap: OL_COLUMN_LINEAGE has zero view-chain records — ViewLineageExtractor now derives and inserts them"
  gaps_remaining: []
  regressions: []
---

# Phase 10: View Lineage — Verification Report (Plans 10-01 and 10-02)

**Phase Goal:** Surface views as visible intermediate nodes in lineage graphs by propagating sourceType and populating view-derived column lineage
**Verified:** 2026-02-19T18:05:00Z
**Status:** passed
**Re-verification:** Yes — Plan 10-02 gap closure verified (first verification covered Plan 10-01 only)

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Views render with orange borders, eye icon, and VIEW badge in column lineage graphs | VERIFIED | `_build_node` sets `sourceType`; `openLineageAdapter.ts` reads `olNode.dataset.sourceType`; `mapTableKindToAssetType("VIEW")` returns `'view'`; TableNode uses `'view'` for orange border and VIEW badge |
| 2  | Views render with orange borders, eye icon, and VIEW badge in table lineage graphs | VERIFIED | `get_table_lineage_graph` extracts `source_type` via `get_dataset_with_namespace`; pre-seeds cache; passes `sourceType` to all `_build_node` calls |
| 3  | Running `populate_lineage.py --views` discovers all views in OL_DATASET, fetches their SQL, and inserts OL_COLUMN_LINEAGE records | VERIFIED | `--views` flag at line 481 of populate_lineage.py; calls `populate_lineage_from_views()` at line 580; `extract_all()` in ViewLineageExtractor runs the full discover→fetch→parse→insert pipeline |
| 4  | Simple view `CREATE VIEW V AS SELECT col1, col2 FROM T` produces DIRECT lineage records T.col1->V.col1 and T.col2->V.col2 | VERIFIED | `test_parse_simple_view_direct_columns` passes; `_parse_view_lineage` extracts qualified and unqualified column refs; DIRECT transformation type with 0.90 confidence |
| 5  | Nested view chains produce transitive lineage records through each intermediate view | VERIFIED | Each view processed independently in `extract_all()`; T->V1 and V1->V2 edges produced in one pass; recursive CTE in lineage service handles multi-hop traversal; `test_extract_all_bad_view_skipped` shows per-view isolation |
| 6  | Views whose SQL cannot be parsed are skipped with a warning, not a crash | VERIFIED | Per-view `try/except` in `extract_all()` at line 140; `test_unparseable_view_skipped_with_warning` passes; `test_extract_all_bad_view_skipped` confirms one bad view does not stop extraction of good views |
| 7  | After running --views, querying lineage for a view shows upstream edges to source tables | VERIFIED | `_insert_lineage_records` inserts records into OL_COLUMN_LINEAGE with correct source_dataset and target_dataset; existing recursive CTE in lineage service traverses these edges; 25/25 unit tests pass |
| 8  | REPLACE VIEW normalization converts Teradata RequestText format before SQLGlot parsing | VERIFIED | `re.sub(r'^\s*REPLACE\s+VIEW', 'CREATE VIEW', ...)` at line 321; `test_replace_view_normalized` passes |
| 9  | Datasets not found in OL_DATASET default to TABLE rendering (graceful degradation) | VERIFIED | `_get_source_type` returns `"TABLE"` when `get_dataset_metadata` returns `None` (line 401 of lineage_service.py); `_build_node` defaults `source_type="TABLE"` |
| 10 | SELECT * wildcard expansion maps view columns to source columns from OL_DATASET_FIELD | VERIFIED | `_expand_star_lineage()` at line 516; maps by name match first, then ordinal position; warns and skips on multiple source tables (ambiguous); confidence_score 0.70 for wildcard expansion |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Lines | Status | Details |
|----------|----------|-------|--------|---------|
| `database/scripts/populate/view_lineage_extractor.py` | ViewLineageExtractor class with extract_all(), _discover_views(), _fetch_view_definitions(), _parse_view_lineage(), _insert_lineage_records() | 770 | VERIFIED | All 5 methods present and substantive; handles DIRECT, CALCULATION, SELECT*, REPLACE VIEW, unparseable views |
| `database/scripts/populate/populate_lineage.py` | --views CLI flag and populate_lineage_from_views() integration | 601 | VERIFIED | `--views` at line 481; `populate_lineage_from_views()` at line 278; wired in main() at line 580 |
| `database/tests/test_view_lineage_extractor.py` | Unit tests for view lineage extraction logic, min 100 lines | 545 | VERIFIED | 25 tests across 7 test classes; all 25 pass in 0.47s |
| `lineage-api/services/lineage_service.py` | sourceType propagation in _build_node, _add_lineage_results, _get_source_type | substantive | VERIFIED | 9+ sourceType occurrences; regression check confirmed intact |
| `lineage-api/repositories/dataset_repository.py` | source_type field in get_dataset_with_namespace() | substantive | VERIFIED | `SELECT d.source_type` confirmed; regression check passed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `populate_lineage.py` | `view_lineage_extractor.py` | `from view_lineage_extractor import ViewLineageExtractor` | WIRED | Lines 288/291 (with import fallback); `populate_lineage_from_views()` instantiates and calls `extractor.extract_all()` |
| `view_lineage_extractor.py` | `DBC.TablesV.RequestText` | SQL query to fetch view definitions | WIRED | `FROM DBC.TablesV` at lines 215 and 244; handles RequestTxtOverFlow with SHOW VIEW fallback |
| `view_lineage_extractor.py` | `sqlglot` | SQL parsing to extract column mappings | WIRED | `sqlglot.parse_one(normalized_sql, dialect="teradata")` at line 332; fallback to generic dialect at line 335 |
| `lineage_service.py` | `dataset_repository.py` | `get_dataset_with_namespace()` returns `source_type` | WIRED | `source_type = dataset_info.get("source_type", "TABLE")` at lines 62 and 128 of lineage_service.py |
| `lineage_service.py (_build_node)` | `openLineageAdapter.ts` | `sourceType` in dataset dict flows through API JSON | WIRED | `"sourceType": source_type` in `_build_node` return dict; adapter reads `olNode.dataset.sourceType`; maps via `mapTableKindToAssetType("VIEW")` -> `'view'` |

### Requirements Coverage

No phase-specific requirements mapped in REQUIREMENTS.md. Phase goal directly maps to observable truths — all 10 verified.

### Anti-Patterns Found

None. Scanned `view_lineage_extractor.py`, `test_view_lineage_extractor.py`, and `populate_lineage.py` for TODO, FIXME, placeholder comments, empty returns, and stub handlers. One comment string "placeholder" found at line 243 of populate_lineage.py is a legitimate code comment about SQL template substitution, not a code stub.

### Human Verification Required

Visual rendering and live database operation require human verification.

**Test 1: View lineage graph rendering**

Test: Navigate to a lineage graph for a column or table on a dataset whose `source_type = 'VIEW'` in OL_DATASET. Verify the node has an orange border, eye icon in the header, and a VIEW badge.
Expected: Orange border (`border-orange-300`), Eye icon (orange), VIEW badge (orange pill).
Why human: Requires a live Teradata connection with view data in OL_DATASET.

**Test 2: --views flag produces upstream lineage**

Test: Run `python database/scripts/populate/populate_lineage.py --skip-clear --lineage-only --views` against a Teradata instance with at least one view registered in OL_DATASET. Navigate to that view in the lineage graph.
Expected: Console shows "Discovered N views", "Fetched N view definitions", "Created N lineage records"; graph shows upstream edges to source tables with column-level connections.
Why human: Requires a live Teradata connection with DBC.TablesV access.

**Test 3: Nested view chain renders full path**

Test: Set up a chain (table T -> view V1 -> view V2), run `--views`, navigate to V2.
Expected: Full lineage path T -> V1 -> V2 visible with orange VIEW cards for V1 and V2.
Why human: Requires multi-level view hierarchy in the database.

### Gaps Summary

No gaps. All 10 observable truths are verified at all three levels (exists, substantive, wired).

**Plan 10-01 regression:** Confirmed intact — `lineage_service.py` and `dataset_repository.py` sourceType propagation unchanged from initial verification.

**Plan 10-02 gap closed:** ViewLineageExtractor is fully implemented and wired. The original UAT gap (OL_COLUMN_LINEAGE had zero view-chain records) is resolved: `--views` flag on `populate_lineage.py` runs the full discover→fetch→parse→insert pipeline that creates view-derived lineage records.

**Complete end-to-end chain (both plans):**
1. `populate_lineage.py --views` → `populate_lineage_from_views()` → `ViewLineageExtractor.extract_all()`
2. Discovers views from `OL_DATASET WHERE source_type='VIEW'`
3. Fetches SQL from `DBC.TablesV.RequestText` (with SHOW VIEW fallback)
4. Normalizes `REPLACE VIEW` → `CREATE VIEW` → parses with SQLGlot
5. Inserts `OL_COLUMN_LINEAGE` records (DIRECT/CALCULATION, confidence 0.70-0.90)
6. Lineage service recursive CTE traverses edges through views
7. `_build_node` sets `sourceType` from `OL_DATASET.source_type`
8. API returns `dataset.sourceType` in JSON response
9. `openLineageAdapter.ts` reads `olNode.dataset.sourceType`
10. `mapTableKindToAssetType("VIEW")` → `'view'`
11. `TableNode` renders orange border; `TableNodeHeader` renders Eye icon and VIEW badge

---

_Verified: 2026-02-19T18:05:00Z_
_Verifier: Claude (gsd-verifier)_
