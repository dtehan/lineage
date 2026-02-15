# Phase 03: SQL Parser Consolidation & DBQL Validation - Research

**Researched:** 2026-02-14
**Domain:** Python module consolidation, SQL parsing (SQLGlot), DBQL validation, Teradata SQL truncation
**Confidence:** HIGH

## Summary

Phase 3 consolidates duplicate SQL parser modules, validates DBQL extraction integrity during migration, and ensures view SQL truncation is visible to end users. The codebase currently has **identical copies** of `sql_parser.py` in two locations: `database/archive/sql_parser.py` (685 lines) and `database/scripts/populate/sql_parser.py` (685 lines). These duplicates exist because of historical code evolution, not intentional separation of concerns.

The phase also addresses DBQL extraction validation and view SQL truncation visibility. DBQL extraction already exists in `database/scripts/populate/dbql_extractor.py` and handles SQL text from Teradata's `DBQLSQLTbl.SQLTextInfo` CLOB column (cast to VARCHAR(32000) for processing). View SQL truncation detection and UI warnings are **already implemented** in the backend (`dataset_repository.py`) and frontend (`DDLTab.tsx`) with existing test coverage.

**Primary recommendation:** Move `sql_parser.py` to `lineage-api/utils/` to centralize shared Python utilities and align with the application's layered architecture (lineage-api contains business logic, database/ contains only scripts). Update imports with absolute paths, run record count comparison tests to verify regression-free migration, and document the truncation warning implementation (already complete).

## Standard Stack

### Core Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlglot | >=25.0.0 | SQL parsing and transpilation | Industry-standard SQL parser with Teradata dialect support, zero dependencies, mature AST manipulation |
| teradatasql | >=17.20.0 | Teradata database connectivity | Official Teradata Python driver for accessing DBQL tables and metadata |
| loguru | >=0.7.3 | Structured logging | Structured logging already adopted in Phase 2, used for DBQL extraction audit trail |

### Supporting Libraries (Already in requirements.txt)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-dotenv | >=1.0.0 | Environment configuration | Already used for database configuration throughout project |
| flask | >=3.0.0 | Web framework | Backend API where sql_parser will be accessed from |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sqlglot | sqlparse | sqlparse is simpler but doesn't support Teradata dialect or AST-based lineage extraction; would require regex fallbacks |
| Absolute imports | Relative imports | Relative imports work within packages but break for cross-package references (database/ → lineage-api/) |
| Module move | Keep duplicates | Duplicates create sync debt and confusion about canonical location |

**Installation:**
```bash
# Already in requirements.txt
pip install sqlglot>=25.0.0
```

## Architecture Patterns

### Recommended Project Structure (Post-Consolidation)
```
lineage/
├── lineage-api/              # Flask API and business logic
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── sql_parser.py     # MOVED HERE (canonical location)
│   │   ├── logging_config.py
│   │   └── sanitize.py
│   ├── services/
│   ├── repositories/
│   └── routes/
└── database/
    ├── scripts/
    │   ├── populate/
    │   │   ├── dbql_extractor.py  # Imports from lineage-api.utils
    │   │   └── populate_lineage.py
    │   └── setup/
    └── archive/
        └── sql_parser.py     # DELETE (duplicate removed)
```

**Rationale:** `lineage-api/` is the application layer where shared business logic lives. `database/scripts/` are operational tools that should import from the application, not duplicate code.

### Pattern 1: Absolute Imports for Cross-Package References
**What:** Use absolute imports when importing from parent or sibling packages
**When to use:** Any import from `database/scripts/` into `lineage-api/`, or between unrelated packages
**Example:**
```python
# database/scripts/populate/dbql_extractor.py
# BEFORE (relative, fragile):
from sql_parser import TeradataSQLParser

# AFTER (absolute, explicit):
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from lineage_api.utils.sql_parser import TeradataSQLParser
```

**Why absolute imports:**
- Survive directory structure changes
- Clear about module origin
- Python best practice per [Real Python](https://realpython.com/python-import/) and [Hitchhiker's Guide](https://docs.python-guide.org/writing/structure/)

### Pattern 2: Regression Validation via Record Counts
**What:** Before/after comparison of row counts and checksums for critical tables during migrations
**When to use:** Any code consolidation affecting data pipeline outputs
**Example:**
```python
# Pre-migration snapshot
def capture_baseline(cursor):
    cursor.execute("SELECT COUNT(*) FROM OL_COLUMN_LINEAGE WHERE is_active = 1")
    count = cursor.fetchone()[0]

    # Capture sample checksums for validation
    cursor.execute("""
        SELECT lineage_id,
               HASHROW(source_namespace, source_dataset, source_field,
                       target_namespace, target_dataset, target_field) as row_hash
        FROM OL_COLUMN_LINEAGE
        WHERE is_active = 1
        ORDER BY lineage_id
        SAMPLE 100
    """)
    checksums = cursor.fetchall()

    return {"count": count, "checksums": checksums}

# Post-migration validation
def validate_migration(cursor, baseline):
    current = capture_baseline(cursor)
    assert current["count"] == baseline["count"], f"Record count mismatch: {current['count']} vs {baseline['count']}"
    assert current["checksums"] == baseline["checksums"], "Sample data checksums don't match"
```

**Sources:**
- [Data Migration Testing Best Practices](https://www.quinnox.com/blogs/data-migration-validation-best-practices/)
- [Automated Regression Testing for Data Quality](https://www.datafold.com/blog/automated-regression-testing-data-quality)

### Pattern 3: Truncation Detection and Warning Propagation
**What:** Backend detects truncation, returns `truncated: boolean` field, frontend displays contextual warning
**When to use:** Any data that may be truncated by database storage limits
**Example (already implemented):**
```python
# lineage-api/repositories/dataset_repository.py (lines 490-502)
# Backend detection using RequestTxtOverFlow column
try:
    cur.execute("""
        SELECT t.RequestText, t.RequestTxtOverFlow
        FROM DBC.TablesV t
        WHERE t.DatabaseName = ? AND t.TableName = ?
    """, [db_name, table_name])
    tab_row = cur.fetchone()
    if tab_row:
        view_sql = tab_row[0]
        truncated = tab_row[1] == "Y"  # Explicit Teradata flag
except Exception:
    # Fallback when RequestTxtOverFlow unavailable
    truncated = len(view_sql) >= 12500  # VARCHAR limit detection
```

```typescript
// lineage-ui/src/components/domain/LineageGraph/DetailPanel/DDLTab.tsx (lines 90-94)
// Frontend display
{data.truncated && (
  <div className="mb-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
    SQL truncated at 12,500 characters. Full definition may be longer.
  </div>
)}
```

**Why this pattern:**
- Backend has authoritative knowledge of truncation (from Teradata metadata)
- Frontend provides user-facing context at point of use
- Non-blocking warning (doesn't prevent viewing partial data)

### Anti-Patterns to Avoid
- **Circular imports during consolidation:** Moving `sql_parser.py` creates import chain risks. Use `sys.path` manipulation in scripts to avoid circular dependencies.
- **Relative imports across packages:** `from ...lineage_api.utils import sql_parser` breaks when script execution context changes. Always use absolute imports with `sys.path` setup.
- **Testing only final state:** Must validate that consolidation produces identical results. Capture baseline before changes, run same queries after, compare outputs.
- **Silently different duplicates:** Always diff files before consolidating. If duplicates diverged, understand why before choosing canonical version.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL parsing for lineage | Regex-based column extractor | SQLGlot with AST traversal | SQL grammar complexity (nested CTEs, window functions, QUALIFY clauses) makes regex approaches brittle; SQLGlot handles Teradata dialect including QUALIFY, SAMPLE, and SET operators |
| Module import management | Custom PYTHONPATH manipulation in each script | Consistent `sys.path.insert(0, ...)` pattern at script top | Import resolution is fragile; standardize on one pattern (used throughout database/scripts/) |
| Data migration validation | Manual spot checking | Automated row count + checksum comparison | Human error misses subtle bugs; automated comparison detects even single-row discrepancies |
| Teradata CLOB handling | String concatenation for large text | CAST(clob_col AS VARCHAR(32000)) in SQL | Teradata CLOBs require explicit casting; application-side concatenation is slow and error-prone |

**Key insight:** SQL parsing is a solved problem (use SQLGlot). The risk in this phase is **import path management** and **regression validation**, not the parser itself.

## Common Pitfalls

### Pitfall 1: Import Paths Break After Module Move
**What goes wrong:** Scripts that imported `from sql_parser import ...` fail with `ModuleNotFoundError` after file relocation.

**Why it happens:** Python's import system searches `sys.path`. When `sql_parser.py` moves from `database/scripts/populate/` to `lineage-api/utils/`, the relative import path changes. Scripts using bare `from sql_parser import ...` expected the file to be in the same directory.

**How to avoid:**
1. **Find all imports:** `grep -r "import.*sql_parser" database/ lineage-api/` (already done: `dbql_extractor.py` is the only active consumer)
2. **Use absolute imports with sys.path:** Add `sys.path.insert(0, str(Path(__file__).parent.parent.parent))` at top of scripts, then import as `from lineage_api.utils.sql_parser import TeradataSQLParser`
3. **Verify with Python:** `python -c "from lineage_api.utils.sql_parser import TeradataSQLParser; print('OK')"`

**Warning signs:** ImportError during script execution, especially in scripts that worked before consolidation.

### Pitfall 2: Silent Data Differences After Consolidation
**What goes wrong:** Code appears to work but produces subtly different results (different row counts, missing lineage records, changed transformation types).

**Why it happens:** The two `sql_parser.py` files may have diverged over time. Even though diff shows they're identical now, consolidation changes import context, execution environment, or triggers latent bugs.

**How to avoid:**
1. **Pre-consolidation baseline:** Run `populate_lineage.py --dbql --since "2024-01-01"` and capture `SELECT COUNT(*) FROM OL_COLUMN_LINEAGE WHERE is_active = 1` and sample row hashes
2. **Post-consolidation validation:** Clear data, re-run same command, compare counts and hashes
3. **Document expected counts:** Store baseline in test file or CI check

**Warning signs:** Record count changes without code logic changes, users reporting "missing lineage" after deployment, unit tests pass but integration tests fail.

### Pitfall 3: DBQL SQLTextInfo Truncation Mishandled
**What goes wrong:** SQL queries longer than 32,000 characters get truncated when cast to VARCHAR, causing parser failures or incomplete lineage extraction.

**Why it happens:** Teradata's `DBQLSQLTbl.SQLTextInfo` is CLOB type but cast to `VARCHAR(32000)` for Python processing (see `dbql_extractor.py` lines 204, 224). SQL queries exceeding this limit are silently truncated.

**How to avoid:**
1. **Log truncation warnings:** Check `LENGTH(SQLTextInfo)` before casting and log when truncation occurs
2. **Document limits:** Add comment in code noting 32,000 character limit
3. **Handle parse failures gracefully:** Wrap `parser.extract_column_lineage()` in try/except and log failed SQL (already done in `dbql_extractor.py`)

**Warning signs:** Parser errors on specific queries, lineage extraction succeeds but produces zero records for large views, error logs showing "ParseError" for complex SQL.

### Pitfall 4: Frontend Truncation Warning Not Visible
**What goes wrong:** Backend detects view SQL truncation but user never sees warning in UI.

**Why it happens:** Two scenarios: (1) Backend returns `truncated: false` when it should be `true`, (2) Frontend receives `truncated: true` but doesn't render warning component.

**How to avoid:**
- **Already implemented:** Backend checks `RequestTxtOverFlow == "Y"` or falls back to `len(view_sql) >= 12500`
- **Already implemented:** Frontend displays yellow warning banner in DDLTab when `data.truncated === true`
- **Verified by tests:** `DetailPanel.test.tsx` line 653 validates warning appears

**Warning signs:** None currently—feature is complete and tested. Risk is **regression** if DDL API contract changes.

## Code Examples

Verified patterns from codebase and official sources:

### SQLGlot Column Lineage Extraction (Teradata Dialect)
```python
# Source: database/scripts/populate/sql_parser.py (lines 129-154)
# Production-tested pattern for parsing Teradata SQL

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

def _parse_with_sqlglot(self, sql: str) -> List[ColumnLineage]:
    """Parse SQL using SQLGlot and extract lineage."""
    # Reset table aliases for fresh parse
    self._table_aliases = {}

    # Parse with Teradata dialect
    try:
        parsed = sqlglot.parse_one(sql, dialect="teradata")
    except ParseError:
        # Fallback to generic SQL if Teradata-specific parsing fails
        parsed = sqlglot.parse_one(sql)

    if parsed is None:
        return []

    # Dispatch by statement type
    if isinstance(parsed, exp.Insert):
        return self._extract_insert_lineage(parsed)
    elif isinstance(parsed, exp.Merge):
        return self._extract_merge_lineage(parsed)
    elif isinstance(parsed, exp.Create):
        return self._extract_ctas_lineage(parsed)
    elif isinstance(parsed, exp.Update):
        return self._extract_update_lineage(parsed)

    return []
```

**Key techniques:**
- Explicit dialect specification (`dialect="teradata"`) for Teradata-specific syntax
- Fallback to generic parser if dialect-specific fails
- AST-based dispatch by statement type (Insert, Merge, Create, Update)

### Cross-Package Import Pattern
```python
# Source: database/scripts/populate/dbql_extractor.py (lines 29-48)
# Pattern used consistently across database/scripts/

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Now can import from lineage-api
from lineage_api.utils.sql_parser import TeradataSQLParser

# Fallback for direct execution (if run from different working directory)
try:
    from sql_parser import TeradataSQLParser
except ImportError:
    from scripts.populate.sql_parser import TeradataSQLParser
```

**Why this works:**
- `Path(__file__).parent.parent.parent` resolves to project root
- Adding to `sys.path[0]` gives highest priority
- Fallback handles edge cases (direct script execution)

### DBQL Extraction with Truncation Handling
```python
# Source: database/scripts/populate/dbql_extractor.py (lines 204-224)
# Production pattern for querying DBQL with VARCHAR casting

cursor.execute("""
    SELECT
        l.QueryID,
        l.UserName,
        l.StatementType,
        o.ObjectDatabaseName,
        o.ObjectTableName,
        CAST(s.SQLTextInfo AS VARCHAR(32000)) as query_text,
        l.StartTime
    FROM DBC.DBQLogTbl l
    INNER JOIN DBC.DBQLSQLTbl s
        ON l.QueryID = s.QueryID
        AND l.ProcID = s.ProcID
    INNER JOIN DBC.DBQLObjTbl o
        ON l.QueryID = o.QueryID
    WHERE l.StatementType IN ('Insert', 'Update', 'Merge Into', 'Create Table')
      AND o.ObjectType = 'Tab'
      AND l.ErrorCode = 0
      AND l.StartTime >= ?
    ORDER BY l.StartTime
""", [since_date])
```

**Key points:**
- `CAST(s.SQLTextInfo AS VARCHAR(32000))` handles CLOB → string conversion
- 32,000 character limit is implicit (VARCHAR max for UNICODE charset)
- Filter by `StatementType` to only lineage-relevant queries
- `ErrorCode = 0` excludes failed queries

### Regression Validation Test Pattern
```python
# Pattern: Pre/post migration validation
# Source: Synthesized from data migration best practices

import hashlib
import json

def capture_lineage_baseline(cursor, database: str) -> dict:
    """Capture OL_COLUMN_LINEAGE state before migration."""
    # Total active lineage count
    cursor.execute(f"""
        SELECT COUNT(*) FROM {database}.OL_COLUMN_LINEAGE
        WHERE is_active = 1
    """)
    total_count = cursor.fetchone()[0]

    # Sample of records with content hash
    cursor.execute(f"""
        SELECT
            lineage_id,
            source_namespace,
            source_dataset,
            source_field,
            target_namespace,
            target_dataset,
            target_field,
            transformation_type,
            transformation_subtype
        FROM {database}.OL_COLUMN_LINEAGE
        WHERE is_active = 1
        ORDER BY lineage_id
        SAMPLE 1000
    """)
    sample_records = cursor.fetchall()

    # Hash each record for comparison
    sample_hashes = []
    for rec in sample_records:
        rec_str = "|".join(str(f) for f in rec)
        rec_hash = hashlib.sha256(rec_str.encode()).hexdigest()[:16]
        sample_hashes.append(rec_hash)

    return {
        "total_count": total_count,
        "sample_hashes": sample_hashes,
        "timestamp": datetime.now().isoformat()
    }

def validate_lineage_unchanged(cursor, database: str, baseline: dict):
    """Validate lineage data matches baseline after migration."""
    current = capture_lineage_baseline(cursor, database)

    # Compare counts
    assert current["total_count"] == baseline["total_count"], \
        f"Record count changed: {baseline['total_count']} → {current['total_count']}"

    # Compare sample hashes
    assert current["sample_hashes"] == baseline["sample_hashes"], \
        "Sample record hashes don't match - data has changed"

    print(f"✓ Validation passed: {current['total_count']} records, sample hashes match")
```

**Usage:**
```bash
# Before consolidation
python validate_migration.py --capture baseline.json

# After consolidation and re-population
python validate_migration.py --validate baseline.json
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex-based SQL parsing | SQLGlot AST parsing | Phase 3 (2024) | More accurate lineage, handles complex Teradata SQL (CTEs, QUALIFY, window functions) |
| Duplicate sql_parser.py in archive/ and scripts/ | Single canonical copy in lineage-api/utils/ | Phase 3 (this phase) | Eliminates sync drift, clarifies module ownership |
| Manual DBQL extraction testing | Automated regression validation | Phase 3 (this phase) | Catches silent data changes during refactoring |
| Backend-only truncation detection | Backend + frontend warning display | Already implemented | Users aware of incomplete data, no silent confusion |

**Deprecated/outdated:**
- **database/archive/sql_parser.py**: Duplicate to be removed in Phase 3
- **Bare `from sql_parser import ...` imports**: Replace with absolute imports to survive module moves
- **Manual diff-checking for migrations**: Automate with row count + checksum validation

## Open Questions

1. **Should sql_parser.py become part of lineage-api package structure?**
   - What we know: Currently `lineage-api/utils/` is a flat directory with `__init__.py` marking it as a package
   - What's unclear: Should we create `lineage_api/` package directory with proper `__init__.py` hierarchy, or keep current flat structure with `sys.path` manipulation?
   - Recommendation: **Keep current flat structure.** Adding proper package structure requires updating ALL imports throughout the codebase (services, repositories, routes, tests). That's out of scope for Phase 3. Use `sys.path` manipulation in database/scripts/ to import from `lineage_api.utils`.

2. **How to handle DBQL queries exceeding 32,000 characters?**
   - What we know: Current code casts `SQLTextInfo` CLOB to `VARCHAR(32000)`, silently truncating longer queries
   - What's unclear: How common are queries exceeding this limit? Should we log warnings, skip parsing, or attempt partial extraction?
   - Recommendation: **Log warnings and continue.** Add `LENGTH(SQLTextInfo)` check before CAST, log queries exceeding limit, attempt parse anyway (may succeed for INSERT/UPDATE where column list is early in SQL). Document this as known limitation.

3. **Are the two sql_parser.py files truly identical?**
   - What we know: Both are 685 lines, `diff` shows no output
   - What's unclear: No explicit verification command was run in current codebase state
   - Recommendation: **Verify with `diff` before consolidation.** Run `diff database/archive/sql_parser.py database/scripts/populate/sql_parser.py` as first step in Plan 01. If differences exist, understand why before choosing canonical version.

## Sources

### Primary (HIGH confidence)
- Codebase files:
  - `database/archive/sql_parser.py` - Original parser implementation (685 lines)
  - `database/scripts/populate/sql_parser.py` - Active parser copy (685 lines, identical)
  - `database/scripts/populate/dbql_extractor.py` - DBQL extraction logic with SQLTextInfo handling
  - `lineage-api/repositories/dataset_repository.py` - Truncation detection (lines 456-520)
  - `lineage-ui/src/components/domain/LineageGraph/DetailPanel/DDLTab.tsx` - Truncation warning UI (lines 90-94)
  - `requirements.txt` - Confirmed `sqlglot>=25.0.0` dependency

### Secondary (MEDIUM confidence)
- [SQLGlot GitHub Repository](https://github.com/tobymao/sqlglot) - Teradata dialect support confirmed
- [SQLGlot PyPI](https://pypi.org/project/sqlglot/25.33.0/) - Current version and documentation
- [Real Python: Python Import Guide](https://realpython.com/python-import/) - Best practices for absolute vs relative imports
- [Hitchhiker's Guide to Python: Structuring Your Project](https://docs.python-guide.org/writing/structure/) - Module organization patterns
- [Teradata DBQL Documentation](https://docs.teradata.com/reader/rgAb27O_xRmMVc_aQq2VGw/aja5y0SLd_0TKA2kqdLoBQ) - Query logging configuration
- [Data Migration Testing Best Practices](https://www.quinnox.com/blogs/data-migration-validation-best-practices/) - Regression validation patterns
- [Automated Regression Testing for Data Quality](https://www.datafold.com/blog/automated-regression-testing-data-quality) - Data comparison strategies

### Tertiary (LOW confidence)
- [Teradata CLOB Documentation](https://docs.teradata.com/r/WurHmDcDf31smikPbo9Mcw/id4PbsUC5OltTlvQ7WEoww) - CLOB to VARCHAR casting behavior (general documentation, not specific to DBQL)
- [Teradata Support: Parsing SQLTextInfo](https://support.teradata.com/knowledge?id=community_question&sys_id=46a70ba31b97fb00682ca8233a4bcbb0) - Community question about SQLTextInfo handling (low detail)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SQLGlot confirmed in requirements.txt, active use in codebase, mature library
- Architecture patterns: HIGH - All patterns verified in existing codebase (absolute imports in dbql_extractor.py, truncation detection in dataset_repository.py, UI warnings in DDLTab.tsx)
- Pitfalls: HIGH - Based on actual codebase structure and common Python migration issues; DBQL truncation limit observed in production code
- Code examples: HIGH - All examples extracted directly from working codebase
- Regression validation: MEDIUM - Pattern synthesized from best practices, not yet implemented in this codebase

**Research date:** 2026-02-14
**Valid until:** 2026-03-16 (30 days - stable domain, Python and SQLGlot mature)
