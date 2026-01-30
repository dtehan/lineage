# Phase 5: DBQL Error Handling - Research

**Researched:** 2026-01-29
**Domain:** Python Error Handling, ETL Pipeline Resilience, DBQL Extraction
**Confidence:** HIGH

## Summary

This phase implements comprehensive error handling for the DBQL lineage extraction scripts (`database/extract_dbql_lineage.py` and `database/populate_lineage.py`). The current implementation has basic error handling but lacks: (1) clear detection and messaging for missing DBQL access, (2) graceful handling of malformed SQL queries that allows extraction to continue, (3) detailed error context for failed extractions, and (4) summary reporting of extraction outcomes.

The existing code already has foundational error handling patterns - `check_dbql_access()` method, try/except blocks around query parsing, and verbose mode warnings. The primary work is enhancing these patterns to meet the requirements: better user messaging for DBQL access issues, continue-on-failure semantics for malformed queries, structured error context logging, and extraction summary statistics.

Python's standard `logging` module is the recommended approach for structured logging in ETL scripts. The existing code uses `print()` statements which should be migrated to the logging module for proper severity levels, consistent formatting, and potential log aggregation.

**Primary recommendation:** Enhance `extract_dbql_lineage.py` with Python's `logging` module, implement continue-on-failure pattern for query parsing, add structured error context tracking, and provide extraction summary with success/failure/skip counts.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| logging | Python stdlib | Structured logging | Standard library since Python 2.3; configurable handlers, formatters, levels |
| teradatasql | Already in use | Teradata database connectivity | Already used throughout the codebase; DatabaseError for error detection |
| sqlglot | >=25.0.0 | SQL parsing | Already used by sql_parser.py; ParseError for malformed query detection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dataclasses | Python stdlib | Structured error records | If error context needs object representation |
| json | Python stdlib | JSON log formatting | If log aggregation requires JSON output |
| traceback | Python stdlib | Stack trace formatting | For detailed debugging in verbose mode |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| logging | loguru | External dependency; simpler API but not standard library |
| logging | structlog | Better structured logging but adds dependency; overkill for CLI scripts |
| print() | Keep as-is | Inconsistent severity levels; harder to filter/aggregate |

**Installation:**
No additional installation needed - all required libraries are either Python standard library or already in requirements.txt.

## Architecture Patterns

### Recommended Project Structure
```
database/
├── extract_dbql_lineage.py  # Enhanced with logging and error tracking
├── populate_lineage.py      # Updated to handle DBQL extraction errors
├── sql_parser.py            # Already has try/except for ParseError
├── db_config.py             # Credential validation (Phase 2 complete)
└── run_tests.py             # Existing test runner
```

### Pattern 1: Continue-on-Failure with Error Tracking
**What:** Process all queries, collect errors, continue execution
**When to use:** Batch processing where individual failures should not stop the pipeline
**Example:**
```python
# Source: ETL pipeline patterns
class ExtractionStats:
    """Track extraction outcomes."""
    def __init__(self):
        self.processed = 0
        self.succeeded = 0
        self.failed = 0
        self.skipped = 0
        self.errors: List[Dict] = []

    def record_success(self):
        self.processed += 1
        self.succeeded += 1

    def record_failure(self, query_id: str, table_name: str, error_type: str, error_msg: str):
        self.processed += 1
        self.failed += 1
        self.errors.append({
            'query_id': query_id,
            'table_name': table_name,
            'error_type': error_type,
            'error_message': error_msg
        })

    def record_skip(self, reason: str):
        self.processed += 1
        self.skipped += 1

    def summary(self) -> str:
        return f"{self.succeeded} succeeded, {self.failed} failed, {self.skipped} skipped"
```

### Pattern 2: DBQL Access Detection with Clear Guidance
**What:** Detect missing DBQL access and provide actionable fallback guidance
**When to use:** At extraction startup before processing queries
**Example:**
```python
# Source: Current extract_dbql_lineage.py enhanced
def check_dbql_access(self) -> tuple[bool, str]:
    """
    Verify access to DBQL tables.

    Returns:
        Tuple of (has_access: bool, message: str)
    """
    logger.info("Checking DBQL access...")
    try:
        self.cursor.execute("SELECT TOP 1 1 FROM DBC.DBQLogTbl")
        logger.info("DBQL access confirmed")
        return True, "DBQL access confirmed"
    except teradatasql.DatabaseError as e:
        error_str = str(e)
        if "3523" in error_str or "access" in error_str.lower():
            message = (
                "No access to DBQL tables.\n\n"
                "This may indicate:\n"
                "  1. DBQL logging is not enabled on this Teradata system\n"
                "  2. Your user lacks SELECT privileges on DBC.DBQLogTbl\n"
                "  3. Your Teradata environment doesn't support DBQL\n\n"
                "Fallback: Use manual lineage mappings instead:\n"
                "  python populate_lineage.py --manual\n\n"
                "To enable DBQL access, contact your DBA to grant:\n"
                "  GRANT SELECT ON DBC.DBQLogTbl TO your_user;\n"
                "  GRANT SELECT ON DBC.DBQLSQLTbl TO your_user;"
            )
            logger.warning("No DBQL access: %s", e)
            return False, message
        else:
            logger.error("DBQL check failed: %s", e)
            return False, f"DBQL check failed: {e}"
```

### Pattern 3: Structured Error Logging with Context
**What:** Log errors with query ID, table name, error type for debugging
**When to use:** Every query processing failure
**Example:**
```python
# Source: Python logging best practices
def process_query(self, query_id: str, query_text: str, default_database: str) -> bool:
    """
    Process a single query for lineage extraction.

    Returns:
        True if successful, False if failed
    """
    try:
        # Set context for parsing
        self.parser.default_database = default_database.strip() if default_database else self.default_database

        records = self.parser.extract_column_lineage(query_text)

        if records:
            self._store_lineage(records, query_id)
            logger.debug("Extracted %d lineage records from query %s", len(records), query_id)
            return True
        else:
            logger.debug("No lineage found in query %s", query_id)
            return True  # Not a failure, just no lineage

    except Exception as e:
        # Extract table name from query text for context
        table_name = self._extract_target_table(query_text) or "UNKNOWN"
        error_type = type(e).__name__

        logger.warning(
            "Failed to extract lineage: query_id=%s, table=%s, error_type=%s, error=%s",
            query_id, table_name, error_type, str(e)
        )

        self.stats.record_failure(
            query_id=str(query_id),
            table_name=table_name,
            error_type=error_type,
            error_msg=str(e)[:200]  # Truncate long error messages
        )
        return False
```

### Pattern 4: Extraction Summary Reporting
**What:** Report extraction statistics at completion
**When to use:** End of extraction run
**Example:**
```python
# Source: ETL pipeline patterns
def print_summary(self):
    """Print extraction summary with success/failure breakdown."""
    print("\n" + "=" * 60)
    print("EXTRACTION SUMMARY")
    print("=" * 60)
    print(f"  Queries processed:     {self.stats.processed}")
    print(f"  Succeeded:             {self.stats.succeeded}")
    print(f"  Failed:                {self.stats.failed}")
    print(f"  Skipped:               {self.stats.skipped}")

    if self.stats.failed > 0:
        print(f"\n  Failed queries logged for review")
        logger.info("Extraction completed: %s", self.stats.summary())

        # Log detailed error summary if verbose
        if self.verbose and self.stats.errors:
            print("\n  Failed Query Details:")
            for i, err in enumerate(self.stats.errors[:10]):  # Show first 10
                print(f"    {i+1}. Query {err['query_id']}: {err['error_type']} on {err['table_name']}")
            if len(self.stats.errors) > 10:
                print(f"    ... and {len(self.stats.errors) - 10} more")
```

### Pattern 5: Data Completeness Validation
**What:** Validate DBQL data completeness before processing
**When to use:** After fetching queries, before processing
**Example:**
```python
# Source: Data pipeline validation patterns
def validate_dbql_data(self, queries: List[Tuple]) -> bool:
    """
    Validate DBQL data completeness and report anomalies.

    Returns:
        True if data is valid for processing
    """
    if not queries:
        logger.warning("No queries found in DBQL for the specified time range")
        return True  # Empty is valid, just nothing to process

    # Check for null query text
    null_count = sum(1 for q in queries if not q[2])  # query_text is index 2
    if null_count > 0:
        logger.warning(
            "DBQL data anomaly: %d of %d queries have NULL query_text (%.1f%%)",
            null_count, len(queries), 100 * null_count / len(queries)
        )

    # Check for very short queries (likely truncated)
    short_count = sum(1 for q in queries if q[2] and len(q[2]) < 20)
    if short_count > len(queries) * 0.1:  # More than 10%
        logger.warning(
            "DBQL data anomaly: %d queries have very short query_text (<20 chars)",
            short_count
        )

    return True
```

### Anti-Patterns to Avoid
- **Fail-fast on first error:** Don't let one malformed query stop the entire extraction
- **Silent failures:** Always log errors with context (query_id, table, error type)
- **Raw exception messages to users:** Use user-friendly messages with actionable guidance
- **Unbounded error collection:** Limit stored error details to prevent memory issues
- **No summary reporting:** Always report what happened at the end

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Logging framework | Custom print wrapper | Python logging module | Proper levels, handlers, formatters built-in |
| Error categorization | String matching on messages | Teradata error codes | Error 3523 is specific to access denied |
| SQL parsing errors | Custom regex | sqlglot.errors.ParseError | Already used by sql_parser.py |
| Progress tracking | Manual counters scattered | Dedicated stats class | Cleaner code, easier to extend |

**Key insight:** The existing code has the right structure (`check_dbql_access`, try/except blocks, stats dictionary), it just needs enhancement with better logging, error context, and reporting.

## Common Pitfalls

### Pitfall 1: Stopping Extraction on First Malformed Query
**What goes wrong:** One bad query in DBQL stops processing thousands of valid queries
**Why it happens:** Default Python exception handling propagates up
**How to avoid:** Wrap query processing in try/except, record failure, continue loop
**Warning signs:** Extraction reports 0 lineage records when DBQL has valid data

### Pitfall 2: Generic "DBQL not available" Message
**What goes wrong:** User doesn't know how to resolve the issue
**Why it happens:** Error message doesn't explain cause or provide alternatives
**How to avoid:** Detect specific error codes, provide actionable guidance
**Warning signs:** Users filing tickets asking "what does DBQL not available mean?"

### Pitfall 3: Logging Entire Query Text
**What goes wrong:** Logs become huge, potentially expose sensitive data
**Why it happens:** Logging query_text without truncation
**How to avoid:** Log query_id and table_name; only log truncated query text in debug mode
**Warning signs:** Log files growing rapidly, SQL with data literals in logs

### Pitfall 4: Missing Query ID in Error Messages
**What goes wrong:** Cannot correlate errors with specific DBQL entries
**Why it happens:** Logging error message without context
**How to avoid:** Always include query_id in error logs
**Warning signs:** Support says "extraction failed" but can't identify which query

### Pitfall 5: Silent Data Quality Issues
**What goes wrong:** DBQL has truncated/corrupted data but extraction reports "success"
**Why it happens:** Not validating data completeness before processing
**How to avoid:** Check for null query_text, unusual row counts, truncation indicators
**Warning signs:** Lineage graph missing expected relationships despite "successful" extraction

## Code Examples

Verified patterns adapted for this codebase:

### Configure Python Logging
```python
# Source: Python logging documentation
import logging
import sys

def configure_logging(verbose: bool = False) -> logging.Logger:
    """Configure logging for DBQL extraction."""
    logger = logging.getLogger('dbql_extractor')

    # Set level based on verbose flag
    level = logging.DEBUG if verbose else logging.INFO
    logger.setLevel(level)

    # Console handler with appropriate format
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    # Format: timestamp - level - message
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)

    # Avoid duplicate handlers on repeated calls
    if not logger.handlers:
        logger.addHandler(handler)

    return logger
```

### Enhanced Query Processing with Continue-on-Failure
```python
# Source: Adapted from current extract_dbql_lineage.py
def extract_lineage(self, since: Optional[datetime] = None, full: bool = False) -> bool:
    """Extract lineage with continue-on-failure semantics."""

    # Fetch queries
    queries = self.fetch_queries(since)

    if not queries:
        logger.info("No queries to process")
        return True

    # Validate data completeness
    self.validate_dbql_data(queries)

    logger.info("Processing %d queries", len(queries))

    for i, (query_id, stmt_type, query_text, query_time, default_db) in enumerate(queries):
        # Progress logging every 1000 queries
        if (i + 1) % 1000 == 0:
            logger.info("Progress: %d/%d queries (%.1f%%)", i + 1, len(queries), 100 * (i + 1) / len(queries))

        # Skip null query text
        if not query_text:
            self.stats.record_skip("null query_text")
            continue

        # Process with error handling
        try:
            success = self._process_single_query(query_id, stmt_type, query_text, default_db)
            if success:
                self.stats.record_success()
            # Failure already recorded in _process_single_query
        except Exception as e:
            # Catch-all for unexpected errors
            logger.error(
                "Unexpected error processing query %s: %s",
                query_id, str(e)
            )
            self.stats.record_failure(
                query_id=str(query_id),
                table_name="UNKNOWN",
                error_type="UnexpectedError",
                error_msg=str(e)[:200]
            )
            # Continue processing - don't stop

    return self.stats.failed == 0 or self.stats.succeeded > 0
```

### Test for Missing DBQL Access
```python
# Source: Test patterns for error handling
import unittest
from unittest.mock import Mock, patch

class TestDBQLErrorHandling(unittest.TestCase):
    """Test DBQL error handling scenarios."""

    def test_missing_dbql_access_provides_guidance(self):
        """DBQL-01: Missing access provides clear fallback guidance."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.cursor = Mock()

        # Simulate access denied error
        extractor.cursor.execute.side_effect = teradatasql.DatabaseError(
            "[Error 3523] User does not have SELECT access to DBC.DBQLogTbl"
        )

        has_access, message = extractor.check_dbql_access()

        self.assertFalse(has_access)
        self.assertIn("populate_lineage.py --manual", message)
        self.assertIn("GRANT SELECT", message)

    def test_malformed_query_continues_extraction(self):
        """DBQL-02: Malformed queries logged and skipped."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.connect()  # Assumes mock connection

        # Mix of valid and invalid queries
        mock_queries = [
            (1, 'Insert', 'INSERT INTO t1 SELECT * FROM t2', datetime.now(), 'demo_user'),
            (2, 'Insert', 'INVALID SQL {{{{', datetime.now(), 'demo_user'),  # Malformed
            (3, 'Insert', 'INSERT INTO t3 SELECT * FROM t4', datetime.now(), 'demo_user'),
        ]

        extractor.fetch_queries = Mock(return_value=mock_queries)
        extractor.extract_lineage()

        # Should process all 3, with 1 failure
        self.assertEqual(extractor.stats.processed, 3)
        self.assertEqual(extractor.stats.failed, 1)
        self.assertGreater(extractor.stats.succeeded, 0)

    def test_error_log_includes_context(self):
        """DBQL-03: Error logs include query ID, table, error type."""
        extractor = DBQLLineageExtractor(verbose=True)

        # Process a failing query
        with self.assertLogs('dbql_extractor', level='WARNING') as log:
            extractor._process_single_query(
                query_id="12345",
                stmt_type="Insert",
                query_text="INVALID SQL",
                default_db="demo_user"
            )

        log_output = '\n'.join(log.output)
        self.assertIn("12345", log_output)
        self.assertIn("error_type", log_output.lower() or "ParseError" in log_output)

    def test_extraction_reports_summary(self):
        """DBQL-04: Extraction reports success/failure/skip counts."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.stats.succeeded = 100
        extractor.stats.failed = 5
        extractor.stats.skipped = 2
        extractor.stats.processed = 107

        summary = extractor.stats.summary()

        self.assertIn("100", summary)
        self.assertIn("5", summary)
        self.assertIn("2", summary)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| print() for output | logging module with levels | Long-established | Proper severity, filtering, handlers |
| Fail-fast on errors | Continue-on-failure with tracking | ETL best practices | Partial success better than total failure |
| Generic error messages | Error codes + actionable guidance | UX patterns | Users can self-resolve common issues |
| Ad-hoc stats | Structured stats class | Code organization | Cleaner, testable, extensible |

**Deprecated/outdated:**
- Using `print()` for everything (use `logging` with appropriate levels)
- Bare `except:` clauses (catch specific exceptions)

## Open Questions

Things that couldn't be fully resolved:

1. **Error log persistence**
   - What we know: Errors are logged to stdout/stderr
   - What's unclear: Whether errors should be written to a file for later review
   - Recommendation: Log to console by default; add `--log-file` option if needed later

2. **DBQL access error codes**
   - What we know: Error 3523 indicates access denied
   - What's unclear: Full list of Teradata error codes for DBQL issues
   - Recommendation: Handle 3523 explicitly; log other errors with full message for future enhancement

3. **Retry semantics**
   - What we know: Current code doesn't retry failed queries
   - What's unclear: Whether transient errors should trigger retries
   - Recommendation: Don't add retry logic yet; most SQL parsing errors are not transient

## Sources

### Primary (HIGH confidence)
- [Python Logging HOWTO](https://docs.python.org/3/howto/logging.html) - Official Python documentation for logging
- Current codebase: `/Users/Daniel.Tehan/Code/lineage/database/extract_dbql_lineage.py` - Existing error handling patterns
- Current codebase: `/Users/Daniel.Tehan/Code/lineage/database/sql_parser.py` - ParseError handling in SQLGlot

### Secondary (MEDIUM confidence)
- [Better Stack Python Logging Best Practices](https://betterstack.com/community/guides/logging/python/python-logging-best-practices/) - Production logging patterns
- [Building Reliable Data Pipelines: Error Handling Patterns](https://n9ine.com/blog/reliable-data-pipelines-error-handling-patterns) - Continue-on-failure pattern
- [Error Handling and Logging in Data Pipelines](https://medium.com/towards-data-engineering/error-handling-and-logging-in-data-pipelines-ensuring-data-reliability-227df82ba782) - ETL error handling

### Tertiary (LOW confidence)
- WebSearch results for Python ETL error handling - General patterns, validated against codebase context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Python stdlib logging already well-known; existing code has teradatasql patterns
- Architecture: HIGH - Continue-on-failure is established ETL pattern; existing code structure supports it
- Pitfalls: HIGH - Based on current code analysis and documented requirements
- Code examples: HIGH - Adapted directly from current codebase with documented enhancements

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - stable domain, mature patterns)
