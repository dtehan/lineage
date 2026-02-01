# Database Test Suite

Comprehensive test suite for validating database schema, lineage queries, and error handling.

## Test Files

### run_tests.py
Main test runner that executes all database validation tests (73 tests total).

**Usage:**
```bash
python tests/run_tests.py
```

**Test categories:**
- Schema validation (OL_* table structure)
- Data integrity (foreign keys, constraints)
- Lineage traversal (recursive CTE correctness)
- Edge cases (cycles, diamonds, fan-out/in)
- Active filtering (is_active='Y')
- Depth limiting
- OpenLineage spec compliance

### test_correctness.py
CTE correctness validation tests that verify recursive lineage algorithms handle complex patterns.

**Tests:**
- Cycle detection (path tracking prevents infinite loops)
- Diamond deduplication (no duplicate nodes)
- Fan-out completeness (all targets included)
- Fan-in completeness (all sources included)
- Combined pattern handling
- Depth limiting
- Active record filtering

Uses the same CTE pattern as the Go backend for consistency.

### test_credential_validation.py
Tests credential validation in db_config.py and python_server.py.

**Tests:**
- Missing password detection
- Fail-fast behavior on invalid credentials
- Error message clarity

Uses subprocess to test module import behavior in isolation.

### test_dbql_error_handling.py
Tests DBQL error handling in extract_dbql_lineage.py.

**Tests:**
- Missing DBQL access handling
- Malformed query handling
- Error logging completeness
- Data validation and reporting

Uses pytest and mocking for isolated testing.

## Running Tests

**All tests:**
```bash
cd database && python tests/run_tests.py
```

**Specific test:**
```bash
cd database && python tests/test_correctness.py
```

**Note:** Some tests may be skipped in ClearScape Analytics due to DBQL/index limitations (29 skipped tests in demo environments).
