# Phase 9: View Expansion - Research

**Researched:** 2026-02-19
**Domain:** View definition retrieval and recursive wildcard expansion via Teradata DBC.TablesV
**Confidence:** HIGH

## Summary

Phase 9 extends the wildcard expansion infrastructure from Phases 7 and 8 to handle the case where a SQL query references a Teradata VIEW that itself contains a wildcard (`SELECT *`) in its definition. Without view expansion, wildcard lineage from queries that flow through views is silently incomplete: `INSERT INTO target SELECT * FROM my_view` cannot resolve columns unless the system knows what columns `my_view` exposes.

The core challenge is that views are not tables — they have no physical column storage in DBC.ColumnsJQV for the purposes of wildcard expansion. Instead, a view's column list is derived by parsing its definition SQL (stored in `DBC.TablesV.RequestText`) and recursively expanding any wildcards within that definition. This creates a two-layer problem: (1) detect that a table reference is actually a view, and (2) recursively expand that view's definition with a depth limit and cycle detection.

The good news is that the codebase already has all three required capabilities: `DBC.TablesV.TableKind = 'V'` detection is already used in `dataset_repository.py` (line 390) and `populate_lineage.py` (line 110); `DBC.TablesV.RequestText` retrieval is already implemented in `dataset_repository.py` (lines 486-520) with `RequestTxtOverFlow` handling and 12,500-character truncation detection; and `TeradataSQLParser._expand_cte_wildcard()` already implements recursive expansion with depth limit and cycle detection — the same pattern applies to views. Phase 9 extends `WildcardResolver` to recognize views, fetch their definitions, parse them with `TeradataSQLParser`, and cache the resulting column lists.

**Primary recommendation:** Extend `WildcardResolver.warm_cache()` to detect which table references are views (via batch query on `DBC.TablesV.TableKind`), fetch their `RequestText` definitions, parse the view SQL with `TeradataSQLParser` to derive the output column list, and cache the result under the view's `(database, table)` key. Apply a depth limit of 3 levels (separate from CTE's 5-level limit) and use the same set-based cycle detection pattern from `_expand_cte_wildcard()`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlglot | >=25.0.0 (current) | Parse view definition SQL retrieved from RequestText | Already in use. `parse_one(view_sql, dialect="teradata")` handles Teradata view syntax. `_extract_select_columns()` already handles wildcard expansion within parsed ASTs. |
| teradatasql | Current | Query `DBC.TablesV` for `TableKind` and `RequestText` | Already in use. Both columns already queried in `dataset_repository.py` lines 486-520. Same pattern applies to batch querying in `WildcardResolver`. |
| DBC.TablesV | Teradata system view | `TableKind` ('V' = view) + `RequestText` (view definition SQL) | Already queried in `dataset_repository.py` and `populate_lineage.py`. `TableKind` detects views. `RequestText` contains definition text (up to 12,500 chars). |
| DBC.ColumnsJQV | Teradata system view | Column metadata for non-view tables (unchanged from Phases 7-8) | Already in use via `WildcardResolver._warm_cache_batch()`. Views bypass this and use parsed `RequestText` instead. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| logging | Python stdlib | Structured audit logging for view expansion events | Log each view expansion: view name, column count, depth level, cycle detection events. Same pattern as qualified wildcard audit logging in Phase 8. |
| json | Python stdlib | Schema baseline persistence (already used in Phase 8) | Extended to include view-derived column counts in baseline. No new dependency. |
| typing | Python stdlib | Type hints for `Dict`, `Set`, `Optional`, `Tuple` | Already used throughout WildcardResolver and sql_parser.py. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parsing RequestText with SQLGlot | SHOW VIEW command per view | SHOW VIEW returns full definition without 12,500-char truncation BUT is a DDL command requiring one round-trip per view (N+1 trap). SQLGlot + RequestText can be batch-queried. Use SHOW VIEW as fallback for truncated definitions only. |
| WildcardResolver batch DBC.TablesV query | dataset_repository.py get_dataset_ddl() | dataset_repository.py is in lineage-api, not database/scripts/populate. WildcardResolver is the correct integration point for extraction-time view resolution. Don't import across subsystem boundaries. |
| In-memory view definition cache | File-based view cache | Views rarely change during a single extraction run. In-memory cache (same as table column cache) is sufficient for single-run lifetime. No new infrastructure. |
| Depth limit of 3 levels | Same 5-level limit as CTEs | Views referencing views are much less common than CTE nesting. 3 levels covers 99% of production patterns (view → base_view → table). Lower limit reduces risk of runaway expansion on pathological schemas. |

**Installation:**
No new dependencies required. All functionality uses existing infrastructure from Phases 7-8.

## Architecture Patterns

### Recommended Project Structure

```
database/scripts/populate/
├── wildcard_resolver.py          # MODIFIED: add view detection + definition fetching + recursive expansion
├── dbql_extractor.py             # UNCHANGED: resolver handles views transparently
└── test_wildcard_resolver.py     # MODIFIED: add TestViewExpansion class

lineage-api/utils/
└── sql_parser.py                 # UNCHANGED: _expand_wildcard() already works once resolver returns view columns
lineage-api/tests/
└── test_sql_parser_wildcards.py  # MODIFIED: add TestViewExpansion class for integration scenarios
```

### Pattern 1: View Detection via Batch DBC.TablesV Query

**What:** During `warm_cache()`, after collecting table references, batch-query `DBC.TablesV` to identify which references are views (`TableKind = 'V'`).

**When to use:** In `WildcardResolver.warm_cache()` before the existing `DBC.ColumnsJQV` batch query.

**Example:**
```python
def _identify_views(self, table_refs: List[Tuple[str, str]]) -> Set[Tuple[str, str]]:
    """Identify which table references are actually views."""
    if not table_refs:
        return set()

    conditions = " OR ".join(
        f"(DatabaseName = '{db}' AND TableName = '{tbl}')"
        for db, tbl in table_refs
    )

    self.cursor.execute(f"""
        SELECT TRIM(DatabaseName), TRIM(TableName)
        FROM DBC.TablesV
        WHERE ({conditions})
          AND TableKind = 'V'
    """)

    views = set()
    for row in self.cursor.fetchall():
        views.add((row[0], row[1]))

    logger.debug(f"Identified {len(views)} views out of {len(table_refs)} table references")
    return views
```

**Why this pattern:**
- Single batch query instead of per-table N+1 queries
- `TableKind = 'V'` is the standard Teradata view indicator (already used in populate_lineage.py line 110 and dataset_repository.py line 390)
- Returns only the subset of references that need view expansion treatment

**Source:** `dataset_repository.py` lines 371-390 (existing `TableKind` usage pattern)

### Pattern 2: View Definition Retrieval via RequestText

**What:** Fetch view SQL from `DBC.TablesV.RequestText` in a batch query, with awareness of the 12,500-character truncation limit.

**When to use:** After identifying views, fetch their SQL definitions for parsing.

**Example:**
```python
def _fetch_view_definitions(self, view_refs: Set[Tuple[str, str]]) -> Dict[Tuple[str, str], Optional[str]]:
    """Fetch view SQL definitions from DBC.TablesV.RequestText."""
    definitions = {}
    if not view_refs:
        return definitions

    view_list = list(view_refs)
    conditions = " OR ".join(
        f"(DatabaseName = '{db}' AND TableName = '{tbl}')"
        for db, tbl in view_list
    )

    # Try with RequestTxtOverFlow first (newer Teradata versions)
    # Fall back without it (older versions)
    try:
        self.cursor.execute(f"""
            SELECT TRIM(DatabaseName), TRIM(TableName), RequestText, RequestTxtOverFlow
            FROM DBC.TablesV
            WHERE ({conditions})
              AND TableKind = 'V'
        """)
        for row in self.cursor.fetchall():
            db, tbl = row[0], row[1]
            request_text = row[2]
            overflow = row[3]
            if overflow == 'Y':
                # Definition truncated - flag for SHOW VIEW fallback
                definitions[(db, tbl)] = None
                logger.warning(
                    "View %s.%s definition exceeds 12500 chars (RequestTxtOverFlow='Y'), "
                    "falling back to SHOW VIEW", db, tbl
                )
            else:
                definitions[(db, tbl)] = request_text.strip() if request_text else None
    except Exception:
        # RequestTxtOverFlow column not available, use length heuristic
        self.cursor.execute(f"""
            SELECT TRIM(DatabaseName), TRIM(TableName), RequestText
            FROM DBC.TablesV
            WHERE ({conditions})
              AND TableKind = 'V'
        """)
        for row in self.cursor.fetchall():
            db, tbl = row[0], row[1]
            request_text = row[2]
            if request_text:
                text = request_text.strip()
                if len(text) >= 12500:
                    # Likely truncated - flag for SHOW VIEW fallback
                    definitions[(db, tbl)] = None
                    logger.warning(
                        "View %s.%s definition may be truncated (%d chars), "
                        "falling back to SHOW VIEW", db, tbl, len(text)
                    )
                else:
                    definitions[(db, tbl)] = text

    return definitions

def _fetch_view_definition_show_view(self, database: str, table: str) -> Optional[str]:
    """Fallback: fetch full view definition via SHOW VIEW for truncated cases."""
    try:
        self.cursor.execute(f"SHOW VIEW {database}.{table}")
        rows = self.cursor.fetchall()
        if rows:
            return "\n".join(
                row[0] if isinstance(row[0], str) else str(row[0])
                for row in rows
            ).strip()
    except Exception as e:
        logger.warning(f"SHOW VIEW failed for {database}.{table}: {e}")
    return None
```

**Why this pattern:**
- `RequestText` is already read in `dataset_repository.py` lines 490-520 with identical fallback logic
- `RequestTxtOverFlow = 'Y'` is the Teradata-native indicator for truncated definitions (newer versions)
- `len(request_text) >= 12500` is the fallback heuristic for older Teradata versions (already in `dataset_repository.py` line 520)
- `SHOW VIEW` returns the complete definition without truncation but requires one round-trip per view — acceptable as a fallback only
- Graceful degradation: if definition unavailable, skip view expansion (return empty column list), never raise

**Source:** `dataset_repository.py` lines 485-520 (existing pattern — identical logic applied here)

### Pattern 3: Recursive View Expansion with Depth Limit and Cycle Detection

**What:** Parse view definition SQL, resolve its column list (recursively expanding any wildcards the view itself contains), cache the result.

**When to use:** After fetching view definitions, derive their effective column list.

**Example:**
```python
# New attributes added to WildcardResolver.__init__()
self._view_expansion_cache: Dict[Tuple[str, str], List[str]] = {}
self._view_expansion_depth: int = 0
self._view_expansion_path: Set[Tuple[str, str]] = set()
MAX_VIEW_EXPANSION_DEPTH = 3  # class constant

def _expand_view_columns(
    self,
    database: str,
    table: str,
    view_sql: str,
    all_view_definitions: Dict[Tuple[str, str], Optional[str]]
) -> List[str]:
    """Recursively expand a view's column list from its SQL definition."""
    key = (database, table)

    # Check cache first (view may already be expanded by a dependency)
    if key in self._view_expansion_cache:
        return self._view_expansion_cache[key]

    # Depth limit check (VIEW-03)
    if self._view_expansion_depth >= self.MAX_VIEW_EXPANSION_DEPTH:
        logger.warning(
            "View expansion depth limit reached (%d levels) for %s.%s",
            self.MAX_VIEW_EXPANSION_DEPTH, database, table
        )
        return []

    # Cycle detection (VIEW-05)
    if key in self._view_expansion_path:
        logger.error(
            "Circular view reference detected for %s.%s (path: %s)",
            database, table,
            " -> ".join(f"{d}.{t}" for d, t in self._view_expansion_path)
        )
        return []

    self._view_expansion_depth += 1
    self._view_expansion_path.add(key)

    try:
        # Create a resolver proxy for nested view expansion
        # The nested resolver pre-populates its cache with what we know
        nested_resolver = _ViewExpansionProxy(
            all_view_definitions=all_view_definitions,
            parent_resolver=self,
        )

        # Parse the view SQL
        import sqlglot
        from sqlglot import exp
        try:
            parsed = sqlglot.parse_one(view_sql, dialect="teradata")
        except Exception:
            parsed = sqlglot.parse_one(view_sql)

        if parsed is None:
            logger.warning("Failed to parse view definition for %s.%s", database, table)
            return []

        # Extract the SELECT from the view definition
        select_expr = None
        if isinstance(parsed, exp.Create):
            # CREATE VIEW name AS SELECT ...
            select_expr = parsed.expression
            if isinstance(select_expr, exp.Subquery):
                select_expr = select_expr.this
        elif isinstance(parsed, exp.Select):
            select_expr = parsed

        if not isinstance(select_expr, exp.Select):
            logger.warning("View %s.%s has no parseable SELECT expression", database, table)
            return []

        # Use existing parser infrastructure to get column list
        from utils.sql_parser import TeradataSQLParser
        parser = TeradataSQLParser(
            default_database=database,
            wildcard_resolver=nested_resolver
        )
        parser._table_aliases = {}
        parser._build_table_aliases(select_expr)
        col_refs = parser._extract_select_columns(select_expr)

        # Extract column names from ColumnReference objects
        columns = [
            ref.alias or ref.column
            for ref in col_refs
            if (ref.alias or ref.column)
        ]

        # Cache for reuse
        self._view_expansion_cache[key] = columns
        logger.info(
            "Expanded view %s.%s -> %d columns at depth %d",
            database, table, len(columns), self._view_expansion_depth
        )
        return columns

    finally:
        self._view_expansion_depth -= 1
        self._view_expansion_path.discard(key)
```

**Why this pattern:**
- Mirrors `TeradataSQLParser._expand_cte_wildcard()` exactly (lines 725-768 in sql_parser.py) — same depth limit + cycle detection pattern, adapted for views
- Uses existing `TeradataSQLParser._extract_select_columns()` and `_build_table_aliases()` infrastructure — no new parsing logic
- Caches results under `(database, table)` key — same cache structure as table column cache
- Error logging on circular references (VIEW-05): `logger.error()` not `logger.warning()` because circular views are database corruption, not expected data variability
- Graceful degradation: returns empty list on any parsing failure

**Source:** `sql_parser.py` lines 725-768 (`_expand_cte_wildcard()` — same pattern)

### Pattern 4: View-Aware resolve_star() Integration

**What:** In `WildcardResolver.warm_cache()`, after identifying views and expanding their columns, populate `_column_cache` with view-derived column lists so that `resolve_star()` works transparently.

**When to use:** In `warm_cache()` after the `DBC.ColumnsJQV` batch query for regular tables.

**Example:**
```python
def warm_cache(self, table_refs: Set[Tuple[str, str]]) -> None:
    """Extended to handle view expansion."""
    # ... existing Phase 7 logic ...

    # Phase 9: View expansion
    normalized_refs = list(normalized_refs)  # already computed
    view_refs = self._identify_views(normalized_refs)   # VIEW-01

    if view_refs:
        # Fetch non-view table columns first (existing Phase 7 logic)
        table_only_refs = [r for r in normalized_refs if r not in view_refs]
        for batch_start in range(0, len(table_only_refs), self.BATCH_SIZE):
            batch = table_only_refs[batch_start:batch_start + self.BATCH_SIZE]
            self._warm_cache_batch(batch)

        # Fetch view definitions                           # VIEW-02
        view_definitions = self._fetch_view_definitions(view_refs)

        # Reset expansion state
        self._view_expansion_depth = 0
        self._view_expansion_path = set()
        self._view_expansion_cache = {}

        # Expand each view's columns and populate cache    # VIEW-03, VIEW-04
        for (db, tbl) in view_refs:
            view_sql = view_definitions.get((db, tbl))
            if view_sql is None:
                # Truncated or unavailable -- try SHOW VIEW fallback
                view_sql = self._fetch_view_definition_show_view(db, tbl)

            if view_sql:
                columns = self._expand_view_columns(db, tbl, view_sql, view_definitions)
                if columns:
                    self._column_cache[(db, tbl)] = columns
                    logger.info("Cached view %s.%s: %d columns", db, tbl, len(columns))
                else:
                    logger.warning("View %s.%s expansion yielded no columns", db, tbl)
            else:
                logger.warning("View %s.%s: no definition available, skipping", db, tbl)
    else:
        # No views -- existing Phase 7 batch query for all refs
        for batch_start in range(0, len(normalized_refs), self.BATCH_SIZE):
            batch = normalized_refs[batch_start:batch_start + self.BATCH_SIZE]
            self._warm_cache_batch(batch)

    # Phase 8 schema evolution detection (unchanged)
    if self._baseline_path:
        self._detect_schema_changes()
        self._save_baseline()
```

**Why this pattern:**
- `resolve_star()` is unchanged — it looks up `(db, table)` from `_column_cache` regardless of whether the columns came from `DBC.ColumnsJQV` or view parsing. Views become transparent to callers.
- `_identify_views()` separates views from tables before the `DBC.ColumnsJQV` batch query — views don't have ColumnsJQV entries for wildcard expansion purposes (they return data but may have NULL types in older Teradata)
- All existing Phase 7-8 logic (batch size limit, schema evolution detection, audit logging) applies unchanged

### Anti-Patterns to Avoid

- **Querying DBC.ColumnsJQV for views then failing:** ColumnsJQV returns columns for views, but wildcard expansion of a view requires knowing the SELECT list structure, not just column names. Use RequestText parsing to preserve the relationship between the view definition and its expansion logic.
- **SHOW VIEW for all views:** `SHOW VIEW` is one round-trip per view — N+1 trap for schemas with many views. Only use as fallback for truncated RequestText (>= 12,500 chars).
- **Infinite recursion without depth guard:** View A references View B references View A is valid in some Teradata systems (recursive views). Always enforce depth limit AND cycle detection before recursing.
- **Mutating parser state during nested expansion:** `TeradataSQLParser` maintains `_table_aliases` as instance state. The view expansion must save/restore or create a fresh parser instance to avoid state pollution across view expansion calls.
- **Treating view columns as direct source columns:** Columns from a wildcard-expanded view still need to trace through the view to their physical source tables. Phase 9 only solves the "what columns does this view expose" problem; transitive lineage (view column → base table column) is a different problem.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| View definition retrieval | Custom DBC query with different columns | `DBC.TablesV.RequestText` + `RequestTxtOverFlow` fallback | Already implemented in `dataset_repository.py` lines 485-520. Use same pattern. |
| SQL parsing of view definition | Regex to extract SELECT from CREATE VIEW | `sqlglot.parse_one(view_sql, dialect="teradata")` | Already used in `sql_parser.py` lines 143-147. Handles Teradata dialect quirks. |
| Recursive expansion depth/cycle tracking | Custom DFS with separate visited set | Mirror `_expand_cte_wildcard()` pattern (lines 725-768) | Already implemented, battle-tested in Phase 7 tests. Identical problem domain. |
| View column name extraction | Parse SELECT clause with regex | Existing `_extract_select_columns()` + `_build_table_aliases()` | Already handles qualified wildcards, CTEs, aliases. Complex logic tested in Phases 7-8. |
| Circular view detection | Graph traversal library (networkx) | Set-based path tracking (same as CTE cycle detection) | CTE cycle detection already implemented this way. Proven correct in Phase 7 tests. No new dependency. |

**Key insight:** This phase is structural plumbing, not new algorithms. Every required capability exists in the codebase. The work is connecting view retrieval (from `dataset_repository.py` pattern) to wildcard expansion (from Phases 7-8) through `WildcardResolver`.

## Common Pitfalls

### Pitfall 1: DBC.ColumnsJQV vs RequestText for View Column Resolution

**What goes wrong:** Developer queries `DBC.ColumnsJQV` for views the same way as tables, gets column names back, caches them. Works for `SELECT view.*` but fails silently for `SELECT * FROM view` in INSERT INTO — the columns are correct but the transitive source isn't tracked (the view's columns point back to the view, not the base tables).

**Why it happens:** ColumnsJQV does return columns for views. But for Phase 9's goal (wildcard expansion), we need to know what columns the view's SELECT clause produces, not just what columns the materialized view exposes. The difference matters for nested view expansion.

**How to avoid:** Identify views via `TableKind = 'V'` before the ColumnsJQV query. For views, use RequestText parsing. For tables, use ColumnsJQV. Two separate code paths in `warm_cache()`.

**Warning signs:**
- View expansion appears to work in simple cases but fails for views-on-views
- Column order in expanded results matches ColumnsJQV order (alphabetical) rather than SELECT list order

### Pitfall 2: RequestText 12,500-Character Truncation

**What goes wrong:** View definition is silently truncated at 12,500 characters. SQLGlot parse fails or produces partial AST. Wildcard expansion returns empty list or incorrect partial column list.

**Why it happens:** `DBC.TablesV.RequestText` is VARCHAR(12500) in Teradata. Views with complex definitions (multiple CTEs, long column expressions, many joins) can exceed this limit. `RequestTxtOverFlow = 'Y'` is the Teradata indicator for truncation (newer versions). Length heuristic (`len >= 12500`) covers older versions.

**How to avoid:**
- Check `RequestTxtOverFlow = 'Y'` (or `len >= 12500` fallback)
- Fall back to `SHOW VIEW database.table` which returns full definition without truncation
- Log warning with view name and definition length
- If `SHOW VIEW` also fails (permissions), log error and return empty list (graceful degradation)

**Warning signs:**
- SQLGlot parse errors on specific views only
- Views with complex definitions produce no columns; simple views work fine
- Log shows "definition may be truncated" for specific tables

**Source:** `dataset_repository.py` lines 500-520 (existing truncation detection pattern)

### Pitfall 3: Parser State Contamination Between View Expansions

**What goes wrong:** `TeradataSQLParser` is instantiated once and reused. When expanding view A (which references tables t1, t2), `_table_aliases` is populated as `{t1: ..., t2: ...}`. When then expanding view B (which references tables t3, t4), stale `_table_aliases` from view A bleeds in, causing incorrect column resolution.

**Why it happens:** `_table_aliases` is instance state in `TeradataSQLParser`. The existing `_expand_cte_wildcard()` saves and restores `_table_aliases` (lines 753-756), but this protection doesn't extend to external view expansion calls that create new parser instances.

**How to avoid:**
- Create a fresh `TeradataSQLParser` instance for each view expansion (not reuse)
- OR explicitly save and restore `_table_aliases` before/after view parsing
- The `_expand_cte_wildcard()` save/restore pattern is the correct template

**Warning signs:**
- View expansion correct in isolation but incorrect when multiple views expanded sequentially
- Column from view A appears in view B's expansion

### Pitfall 4: Circular View References Are Database Errors, Not Data Variation

**What goes wrong:** Circular view reference A → B → A causes infinite recursion. If treated as a warning (like multi-table wildcard skips), the extraction appears to succeed but silently drops lineage.

**Why it happens:** Circular views are not supposed to exist in Teradata (the database prevents creating them). However, in metadata extraction contexts (e.g., views exported/imported from other systems), the schema may contain circular definitions.

**How to avoid:**
- Use `logger.error()` not `logger.warning()` for circular view detection (VIEW-05)
- Include the full expansion path in the error message: `"A.VIEW1 -> A.VIEW2 -> A.VIEW1"`
- Return empty list (graceful degradation) but log at ERROR level
- Count circular views detected and include in extraction summary

**Warning signs:**
- RecursionError during test if depth limit not enforced before cycle check
- Same view name appearing in multiple extraction errors

### Pitfall 5: View Expansion Depth Limit vs CTE Depth Limit Confusion

**What goes wrong:** CTE expansion uses `_expansion_depth` / `_expansion_path` on `TeradataSQLParser`. View expansion introduces its own depth counter on `WildcardResolver`. If they share state or interfere, depth tracking breaks.

**Why it happens:** The two expansion contexts are separate: CTE expansion happens within `TeradataSQLParser` during SQL parsing; view expansion happens within `WildcardResolver` during metadata pre-fetching. They should not share state.

**How to avoid:**
- View expansion state (`_view_expansion_depth`, `_view_expansion_path`) lives on `WildcardResolver`, not on `TeradataSQLParser`
- CTE expansion state (`_expansion_depth`, `_expansion_path`) lives on `TeradataSQLParser`
- The two depth limits are independent: CTE depth = 5 levels (existing), view depth = 3 levels (new)
- Reset view expansion state at start of each `warm_cache()` call

**Warning signs:**
- Depth limit triggers too early (shared counter prematurely filled)
- View and CTE cycle detection interfering

## Code Examples

Verified patterns from the existing codebase applied to Phase 9:

### View Detection (VIEW-01)

```python
# In WildcardResolver._identify_views()
# Pattern from dataset_repository.py lines 371-390 and populate_lineage.py line 110
def _identify_views(self, table_refs: List[Tuple[str, str]]) -> Set[Tuple[str, str]]:
    """Identify which table references are views via DBC.TablesV.TableKind."""
    if not table_refs:
        return set()

    conditions = " OR ".join(
        f"(DatabaseName = '{db}' AND TableName = '{tbl}')"
        for db, tbl in table_refs
    )

    self.cursor.execute(f"""
        SELECT TRIM(DatabaseName), TRIM(TableName)
        FROM DBC.TablesV
        WHERE ({conditions})
          AND TableKind = 'V'
    """)

    return {(row[0], row[1]) for row in self.cursor.fetchall()}
```

**Source:** `dataset_repository.py` line 390, `populate_lineage.py` line 110

### View Definition Retrieval (VIEW-02)

```python
# In WildcardResolver._fetch_view_definitions()
# Pattern from dataset_repository.py lines 485-520 (identical logic)
try:
    cursor.execute("""
        SELECT TRIM(DatabaseName), TRIM(TableName), RequestText, RequestTxtOverFlow
        FROM DBC.TablesV
        WHERE (conditions)
          AND TableKind = 'V'
    """)
    for row in cursor.fetchall():
        overflow = row[3]
        if overflow == 'Y':
            definitions[(row[0], row[1])] = None  # Signal SHOW VIEW needed
        else:
            definitions[(row[0], row[1])] = row[2].strip() if row[2] else None
except Exception:
    # Fallback: no RequestTxtOverFlow column
    cursor.execute("""
        SELECT TRIM(DatabaseName), TRIM(TableName), RequestText
        FROM DBC.TablesV WHERE (conditions) AND TableKind = 'V'
    """)
    for row in cursor.fetchall():
        text = row[2].strip() if row[2] else None
        if text and len(text) >= 12500:
            definitions[(row[0], row[1])] = None   # Likely truncated
        else:
            definitions[(row[0], row[1])] = text
```

**Source:** `dataset_repository.py` lines 485-520

### Depth Limit + Cycle Detection (VIEW-03, VIEW-05)

```python
# In WildcardResolver._expand_view_columns()
# Mirror of TeradataSQLParser._expand_cte_wildcard() (sql_parser.py lines 725-768)
MAX_VIEW_EXPANSION_DEPTH = 3  # Class constant (separate from CTE's 5)

if self._view_expansion_depth >= self.MAX_VIEW_EXPANSION_DEPTH:
    logger.warning("View expansion depth limit reached (%d) for %s.%s",
                   self.MAX_VIEW_EXPANSION_DEPTH, database, table)
    return []

if key in self._view_expansion_path:
    logger.error("Circular view reference: %s.%s (path: %s)",
                 database, table,
                 " -> ".join(f"{d}.{t}" for d, t in self._view_expansion_path))
    return []

self._view_expansion_depth += 1
self._view_expansion_path.add(key)
try:
    # ... expansion logic ...
    return columns
finally:
    self._view_expansion_depth -= 1
    self._view_expansion_path.discard(key)
```

**Source:** `sql_parser.py` lines 725-768 (`_expand_cte_wildcard()`)

### Test Pattern: View Expansion with MockCursor

```python
# In test_wildcard_resolver.py TestViewExpansion class
# Pattern from existing tests in test_wildcard_resolver.py (mock-based, no DB)

class MockCursor:
    """Mock cursor supporting both DBC.ColumnsJQV and DBC.TablesV queries."""
    def __init__(self, view_responses, column_responses):
        self._view_responses = view_responses   # TableKind queries
        self._column_responses = column_responses  # ColumnsJQV queries
        self._last_query = None

    def execute(self, query, params=None):
        self._last_query = query

    def fetchall(self):
        if 'TableKind' in self._last_query:
            return self._view_responses
        return self._column_responses

class TestViewExpansion(unittest.TestCase):
    def test_simple_view_wildcard_expansion(self):
        """VIEW-01 + VIEW-02 + VIEW-03: simple view SELECT * expansion."""
        # View: CREATE VIEW my_view AS SELECT * FROM base_table
        # Test that warm_cache detects my_view as view, parses definition,
        # and resolver returns base_table columns for my_view
        ...
```

**Source:** Existing mock pattern in `test_wildcard_resolver.py` (TestSchemaEvolution class, lines 242+)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skip views entirely in wildcard expansion | Detect views via TableKind + expand via RequestText | OpenLineage 1.x (2023+) for lineage-through-views | Views no longer opaque to wildcard expansion. Transitive lineage through views enabled. |
| SHOW VIEW per view (N+1) | Batch RequestText query + SHOW VIEW only for overflow | DataHub Teradata connector 2024 | O(n) queries reduced to O(1) batch + selective fallback. |
| Single depth limit for all recursive expansion | Separate CTE depth (5) and view depth (3) | Common pattern in production lineage tools | Views-on-views are rarer than CTE nesting. Tighter limit reduces risk without impacting coverage. |

**Deprecated/outdated:**
- **DBC.ColumnsJQV only for view wildcards:** Returns column names but loses SELECT structure needed for recursive expansion. Phase 9 uses RequestText for view wildcard expansion.
- **Global shared depth counter for CTEs and views:** Phases 7-8 use parser-level depth tracking. Phase 9 adds resolver-level depth tracking. Two separate counters, two separate limits.

## Open Questions

1. **Should view expansion happen at warm_cache() time or lazily at resolve_star() time?**
   - What we know: `warm_cache()` is called once before all query processing. Eager expansion at warm_cache() time means all view definitions are pre-fetched in one database round-trip. Lazy expansion at resolve_star() time means views are expanded on first access (potentially during query parsing).
   - What's unclear: Whether all views in `table_refs` will actually need wildcard expansion, or just a subset. Lazy expansion avoids fetching definitions for views that have no `SELECT *` queries against them.
   - Recommendation: Eager expansion at `warm_cache()` time. Consistent with Phase 7's philosophy (pre-fetch all metadata upfront). The batch query overhead is negligible vs the risk of on-demand expansion during parsing (breaks the clean two-phase design).

2. **What to do when a view definition contains CTEs?**
   - What we know: Views can contain CTEs: `CREATE VIEW v AS WITH cte AS (SELECT ...) SELECT * FROM cte`. `TeradataSQLParser` already handles CTEs in `_parse_with_sqlglot()` (lines 152-159). The CTE definitions are collected into `_cte_definitions` dict before expansion.
   - What's unclear: When expanding a view's `SELECT * FROM cte`, the parser needs the CTE context. The current design creates a new parser for each view — the CTE collection should happen automatically via `_parse_with_sqlglot()`.
   - Recommendation: Parse the full view SQL through `TeradataSQLParser._parse_with_sqlglot()` to collect CTEs before calling `_extract_select_columns()`. The CTE collection code (lines 152-159) runs automatically as part of parsing.

3. **How to handle REPLACE VIEW vs CREATE VIEW in RequestText?**
   - What we know: Teradata stores view definitions as `REPLACE VIEW database.view_name AS SELECT ...` in `RequestText`, not as `CREATE VIEW`. SQLGlot may parse REPLACE VIEW differently from CREATE VIEW.
   - What's unclear: Whether SQLGlot's Teradata dialect handles `REPLACE VIEW` the same as `CREATE VIEW` for exp.Create node detection.
   - Recommendation: Normalize `REPLACE VIEW` to `CREATE VIEW` before parsing (simple string replacement: `re.sub(r'^REPLACE\s+VIEW', 'CREATE VIEW', view_sql, count=1, flags=re.IGNORECASE)`). Test this assumption in unit tests with mock RequestText containing `REPLACE VIEW`.

4. **Depth limit of 3 — is it sufficient?**
   - What we know: Phase 7 uses 5 levels for CTE nesting. Views-on-views are less common. 3 levels covers: query → view_1 → view_2 → base_table.
   - What's unclear: Whether production Teradata schemas have 4+ level view hierarchies.
   - Recommendation: Start at 3. Log at WARNING when depth limit hit (not ERROR) — depth exceeded is operational, not a schema error. Monitor in production. Expose as `MAX_VIEW_EXPANSION_DEPTH` class constant for easy adjustment.

5. **Does the view expansion proxy (nested resolver) need full WildcardResolver functionality?**
   - What we know: When expanding a view's SQL, the nested resolver only needs `resolve_star()` — the view expansion proxy provides column lists for base tables and other views.
   - What's unclear: Whether a simple dict-backed proxy is sufficient, or whether a full WildcardResolver with database access is needed for nested views.
   - Recommendation: Dict-backed proxy for simplicity. Populate it with already-known table columns from `_column_cache` and already-expanded views from `_view_expansion_cache`. Only call back to `_expand_view_columns()` for not-yet-expanded nested views. This avoids re-entering the database during nested expansion.

## Sources

### Primary (HIGH confidence)

- **Existing codebase:**
  - `lineage-api/repositories/dataset_repository.py` lines 371-390: `TableKind = 'V'` detection pattern
  - `lineage-api/repositories/dataset_repository.py` lines 478-531: `RequestText`/`RequestTxtOverFlow` retrieval with 12,500-char truncation detection and SHOW VIEW fallback
  - `lineage-api/utils/sql_parser.py` lines 725-768: `_expand_cte_wildcard()` — depth limit + cycle detection pattern to mirror
  - `database/scripts/populate/wildcard_resolver.py` lines 108-174: `warm_cache()` integration point
  - `database/scripts/populate/populate_lineage.py` line 110: `TableKind = 'V'` usage in batch query
- **Phase 7 RESEARCH.md** — batch metadata query patterns, graceful degradation philosophy
- **Phase 8 RESEARCH.md** — qualified wildcard expansion pattern, schema evolution detection
- **IBM APAR JR55495, JR63602** — confirms 12,500-character RequestText limit is documented Teradata behavior

### Secondary (MEDIUM confidence)

- [DataHub blog: Extracting Column-Level Lineage from SQL](https://datahub.com/blog/extracting-column-level-lineage-from-sql/) — schema-aware view expansion patterns
- [SQLGlot Lineage API](https://sqlglot.com/sqlglot/lineage.html) — `sources` parameter for view expansion; confirms CREATE VIEW is parseable

### Tertiary (LOW confidence)

- [Teradata Community: DBC.TABLES truncated view definition](https://support.teradata.com/community?id=community_question&sys_id=45d68bef1b57fb00682ca8233a4bcb63) — confirms `SHOW VIEW` as the fallback approach for full definitions
- [Dataedo: List views with scripts](https://dataedo.com/kb/query/teradata/list-views-with-their-scripts) — confirms `RequestText` is the standard column for view scripts in DBC.TablesV

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already in production use. `DBC.TablesV.RequestText` + `RequestTxtOverFlow` already used in `dataset_repository.py`. SQLGlot view parsing uses same entry point as existing SQL parsing. Zero new dependencies.
- Architecture: HIGH — All integration points exist and are verified in the codebase. `_expand_cte_wildcard()` provides the exact recursive pattern to follow. `WildcardResolver.warm_cache()` is the right integration point.
- Pitfalls: HIGH — RequestText truncation limit (12,500 chars) confirmed by IBM APARs. Parser state contamination issue identified from existing `_expand_cte_wildcard()` save/restore code. Circular view detection mirrors CTE cycle detection, already battle-tested.

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days — stable Teradata system catalog schema, SQL parsing patterns don't change rapidly)
