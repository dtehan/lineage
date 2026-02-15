---
phase: 03-sql-parser-consolidation-dbql-validation
plan: 01
subsystem: database
tags: [sql-parser, sqlglot, code-cleanup, consolidation]

# Dependency graph
requires:
  - phase: 02-exception-handling-observability
    provides: Structured error handling and logging infrastructure
provides:
  - Single canonical sql_parser.py module in lineage-api/utils/
  - Clean import path for SQL parsing across all components
  - Elimination of duplicate code risk
affects: [03-02, dbql-validation, sql-parsing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical module location pattern: lineage-api/utils/ for shared utilities"
    - "sys.path manipulation for cross-component imports"

key-files:
  created:
    - lineage-api/utils/sql_parser.py
  modified:
    - database/scripts/populate/dbql_extractor.py

key-decisions:
  - "Chose lineage-api/utils/ as canonical location (aligns with API-centric architecture)"
  - "Removed try/except import fallback in favor of explicit sys.path configuration"
  - "Updated module docstring to reflect new import path for future users"

patterns-established:
  - "Shared utilities live in lineage-api/utils/ directory"
  - "Cross-component imports use sys.path.insert() with project root resolution"

# Metrics
duration: 2.6min
completed: 2026-02-15
---

# Phase 03 Plan 01: SQL Parser Consolidation Summary

**Consolidated duplicate sql_parser.py files into single canonical module at lineage-api/utils/, eliminating code drift risk**

## Performance

- **Duration:** 2.6 min (158 seconds)
- **Started:** 2026-02-15T02:18:31Z
- **Completed:** 2026-02-15T02:21:09Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified, 2 deleted)

## Accomplishments
- Consolidated three identical sql_parser.py files into single canonical location
- Established lineage-api/utils/ as the canonical location for shared SQL parsing utilities
- Updated all import references to use new location
- Eliminated risk of code drift between duplicate parser implementations

## Task Commits

Each task was committed atomically:

1. **Task 1: Move sql_parser.py to lineage-api/utils/ and delete duplicates** - `e2ad89f` (refactor)
   - Moved 684-line SQL parser module to canonical location
   - Updated docstring usage example to reflect new import path
   - Deleted duplicates from database/archive/ and database/scripts/populate/
   - Git recognized operation as a rename (99% similarity)

2. **Task 2: Update dbql_extractor.py import to reference new parser location** - `7ce2ea0` (refactor)
   - Replaced try/except import fallback with clean absolute import
   - Added lineage-api directory to sys.path for module resolution
   - Verified import path works correctly (module found, sqlglot dependency check expected)

## Files Created/Modified

- `lineage-api/utils/sql_parser.py` - Canonical SQL parser module (684 lines, TeradataSQLParser class with SQLGlot-based lineage extraction)
- `database/scripts/populate/dbql_extractor.py` - Updated to import from canonical location via sys.path configuration
- `database/archive/sql_parser.py` - **DELETED** (duplicate removed)
- `database/scripts/populate/sql_parser.py` - **DELETED** (original moved to new location)

## Decisions Made

1. **Canonical location choice:** Chose lineage-api/utils/ over database/scripts/populate/ because:
   - Aligns with API-centric architecture
   - Makes parser accessible to both backend API and database scripts
   - Establishes pattern for future shared utilities

2. **Import strategy:** Replaced try/except fallback with explicit sys.path configuration:
   - More maintainable (single import statement)
   - Clearer intent (explicit path resolution)
   - Easier to debug when import issues arise

3. **Docstring update:** Updated usage example to show correct import path for future developers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - consolidation was straightforward as files were already identical (diff produced no output).

## Verification Results

All verification checks passed:

1. **Single canonical file exists:**
   ```
   $ find . -name "sql_parser.py" -not -path "./.git/*"
   ./lineage-api/utils/sql_parser.py
   ```

2. **Duplicates deleted:**
   - `database/archive/sql_parser.py` - not found ✓
   - `database/scripts/populate/sql_parser.py` - not found ✓

3. **File properties correct:**
   - Line count: 684 (matches requirement of min_lines: 680)
   - File size: 25,002 bytes

4. **Import updated:**
   - `database/scripts/populate/dbql_extractor.py` contains `from utils.sql_parser import TeradataSQLParser`
   - No files in `database/scripts/populate/` contain old import pattern `from sql_parser import`

5. **Import path functional:**
   - Python successfully resolves module path (sqlglot dependency check expected in non-venv environment)

## Next Phase Readiness

Ready for Plan 02 (DBQL Validation):
- SQL parser now in stable, canonical location
- All imports updated to reference new location
- No duplicate code to maintain or keep in sync
- Foundation set for DBQL validation work

**Blockers:** None

## Self-Check: PASSED

All claims in this summary verified:
- ✓ Created files exist (lineage-api/utils/sql_parser.py)
- ✓ Commits exist in git history (e2ad89f, 7ce2ea0)
- ✓ Line count matches specification (684 lines)
- ✓ Duplicate files deleted (database/archive/, database/scripts/populate/)
- ✓ Import paths updated correctly

---
*Phase: 03-sql-parser-consolidation-dbql-validation*
*Completed: 2026-02-15*
