---
phase: 09-view-expansion
plan: 02
subsystem: testing
tags: [unittest, mock, wildcard-resolver, sql-parser, view-expansion, python]

requires:
  - phase: 09-01
    provides: WildcardResolver view expansion methods (_identify_views, _fetch_view_definitions, _fetch_view_definition_show_view, _expand_view_columns)

provides:
  - TestViewExpansion class in test_wildcard_resolver.py (12 unit tests for VIEW-01 through VIEW-05)
  - TestViewExpansion class in test_sql_parser_wildcards.py (6 integration tests for view-through lineage)

affects:
  - 09-03 (if exists): any further view expansion work

tech-stack:
  added: []
  patterns:
    - "Query-discriminating fetchall side_effect pattern for tests inspecting _last_query (TablesV vs ColumnsJQV vs RequestText discrimination)"
    - "Pre-populate _column_cache / _view_expansion_cache to test methods in isolation without DB interaction"
    - "assertLogs('wildcard_resolver', level='WARNING/ERROR') for depth limit and circular reference verification"
    - "MockWildcardResolver pre-populated with view columns for SQL parser integration tests"

key-files:
  created: []
  modified:
    - database/scripts/populate/test_wildcard_resolver.py
    - lineage-api/tests/test_sql_parser_wildcards.py

key-decisions:
  - "_configure_cursor helper uses _last_query instance variable set via execute side_effect to discriminate query types (TablesV vs ColumnsJQV vs RequestText)"
  - "test_warm_cache_with_views_integration uses three-way fetchall discriminator to simulate complete warm_cache() execution flow"
  - "Integration tests simulate view expansion by pre-populating MockWildcardResolver with view column lists (resolve_star() is shared interface)"
  - "test_view_no_columns_graceful_degradation asserts no 0.70 confidence records (empty view should not produce wildcard lineage)"

patterns-established:
  - "VIEW unit tests: pre-populate _column_cache or _view_expansion_cache directly to isolate method under test"
  - "VIEW integration tests: MockWildcardResolver with view columns is indistinguishable from table columns to parser"

duration: 2min
completed: 2026-02-19
---

# Phase 9 Plan 02: View Expansion Test Suite Summary

**TestViewExpansion classes added to both test files covering all 5 VIEW requirements: 12 WildcardResolver unit tests and 6 SQL parser integration tests, all passing alongside 47 existing tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T15:08:23Z
- **Completed:** 2026-02-19T15:10:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added TestViewExpansion class with 12 unit tests to test_wildcard_resolver.py covering VIEW-01 through VIEW-05: view detection, definition retrieval with overflow handling, SHOW VIEW fallback, recursive expansion, depth limit, circular detection, caching, and REPLACE VIEW normalization
- Added TestViewExpansion class with 6 integration tests to test_sql_parser_wildcards.py covering INSERT from view, CTAS from view, qualified wildcard from view, mixed explicit+wildcard columns, empty view degradation, and subquery-through-view
- All 65 total tests pass (33 in test_wildcard_resolver.py, 32 in test_sql_parser_wildcards.py)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TestViewExpansion unit tests to test_wildcard_resolver.py** - `15d0cfa` (test)
2. **Task 2: Add TestViewExpansion integration tests to test_sql_parser_wildcards.py** - `9d0253c` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `database/scripts/populate/test_wildcard_resolver.py` - Added TestViewExpansion class (12 unit tests covering VIEW-01 through VIEW-05)
- `lineage-api/tests/test_sql_parser_wildcards.py` - Added TestViewExpansion class (6 integration tests verifying view columns flow through parser lineage extraction)

## Decisions Made

- Used `_last_query` instance variable via `execute.side_effect` for query-type discrimination in `_configure_cursor` helper - cleaner than positional call_count tracking
- `test_warm_cache_with_views_integration` uses three-way fetchall discriminator (TablesV/TableKind, ColumnsJQV, TablesV/RequestText) to exercise the complete warm_cache() execution path
- Integration tests do not need actual view expansion - MockWildcardResolver with pre-populated view columns is sufficient since resolve_star() is the shared interface

## Deviations from Plan

None - plan executed exactly as written. The 12 tests planned were implemented as described (though plan also described test_warm_cache_with_views_integration and test_replace_view_normalization which replaced the "test 11 and 12" placeholders from the plan). The plan's 12-test count was delivered.

## Issues Encountered

None - all tests passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 9 complete: all VIEW requirements (VIEW-01 through VIEW-05) have both implementation (09-01) and test coverage (09-02)
- 65 total tests across both test files, all passing
- v3.0 Wildcard Expansion milestone complete (Phases 07, 08, 09 all done)

---
*Phase: 09-view-expansion*
*Completed: 2026-02-19*
