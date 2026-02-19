---
status: complete
phase: 08-qualified-wildcards-schema-evolution
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md
started: 2026-02-19T15:59:08Z
updated: 2026-02-19T16:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Qualified Wildcard SQL Expansion
expected: In a query like SELECT t1.* FROM customers t1, the qualified wildcard (t1.*) expands to the actual columns of the customers table. Running the SQL parser on such a query (with a wildcard_resolver providing column metadata) produces lineage rows for each individual column — not a single wildcard entry. Expanded rows have confidence score 0.70.
result: pass

### 2. Multiple Qualified Wildcards in JOIN
expected: In a query like SELECT t1.*, t2.* FROM customers t1 JOIN orders t2 ON t1.id = t2.id, each alias resolves independently — t1.* expands to customers columns, t2.* expands to orders columns. The resulting lineage contains rows for all columns from both tables with correct ordinal positions.
result: pass

### 3. Unknown Alias Graceful Degradation
expected: When a qualified wildcard uses an alias that cannot be resolved (e.g., SELECT unk.* FROM foo unk where foo is not in the cache), the parser skips that wildcard and continues processing the rest of the query. No exception is raised. A warning is logged about the unknown alias.
result: pass

### 4. Positional ORDER BY Warning
expected: When a query combines wildcards with a positional ORDER BY (e.g., SELECT t1.* FROM t1 ORDER BY 1), a warning is logged indicating ambiguous column position mapping. The query still processes without crashing; the warning message references both "wildcard" and "positional order by".
result: pass

### 5. Schema Evolution Detection
expected: When WildcardResolver is initialized with a baseline_path and a table's column count has changed since the last run (e.g., customers had 5 columns, now has 6), a WARNING is logged indicating schema evolution (table name, old count, new count). get_schema_changes() returns the list of changed tables. get_stats() includes a schema_changes count > 0.
result: pass

### 6. Backward Compatibility — No Baseline Path
expected: WildcardResolver can be instantiated without a baseline_path (the original signature). No schema evolution checks run, no file I/O occurs, and all existing Phase 7 wildcard expansion behaviour works unchanged.
result: pass

### 7. Unit Test Suite Passes Without Database
expected: Running the Phase 8 test suite (cd lineage-api && python -m pytest tests/test_sql_parser_wildcards.py and cd database/scripts/populate && python -m pytest test_wildcard_resolver.py) produces 47 tests passing (26 + 21), 0 failures, without any Teradata database connection.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
