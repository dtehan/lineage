---
status: resolved
trigger: "Database scripts have 'demo_user' hardcoded instead of using the TERADATA_DATABASE environment variable from .env"
created: 2026-02-01T00:00:00Z
updated: 2026-02-01T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Scripts were hardcoding "demo_user" in SQL strings
test: All SQL statements updated to use DATABASE variable from CONFIG["database"]
expecting: Scripts now use TERADATA_DATABASE environment variable
next_action: Archive debug session

## Symptoms

expected: All database scripts should use the TERADATA_DATABASE environment variable (defined in .env) instead of hardcoding "demo_user"
actual: Multiple database scripts have "demo_user" hardcoded throughout the codebase
errors: No errors, but this creates configuration inflexibility and violates DRY principle
reproduction: Search for "demo_user" in database scripts and documentation
started: Initial implementation - needs refactoring

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-02-01T00:00:00Z
  checked: db_config.py
  found: CONFIG["database"] is properly read from TERADATA_DATABASE env var with fallback to "demo_user"
  implication: The config infrastructure is already in place; scripts just need to use it

- timestamp: 2026-02-01T00:00:00Z
  checked: grep for demo_user in database/scripts
  found: Multiple files with hardcoded demo_user in SQL strings and data
  implication: Need to update scripts to use CONFIG["database"] instead

## Resolution

root_cause: Scripts hardcode "demo_user" in SQL strings instead of using CONFIG["database"] from db_config.py. The infrastructure to use the environment variable (TERADATA_DATABASE) already exists in db_config.py but is not being utilized in the SQL statements.

fix: Update all database scripts to use f-strings with CONFIG["database"] instead of hardcoded "demo_user" in SQL statements. This includes:
1. setup_lineage_schema.py - DDL statements and index creation
2. setup_test_data.py - DDL and DML statements
3. populate_lineage.py - SQL queries and COLUMN_LINEAGE_MAPPINGS data
4. populate_test_metadata.py - SQL queries and TEST_DATASETS definitions
5. insert_cte_test_data.py - CTE_TEST_INSERTS SQL statements
6. benchmark_cte.py - SQL queries and TEST_DATASETS
7. tests/run_tests.py - DBC.ColumnsV queries

verification: Verified - grep for "demo_user" in database/scripts returns only documentation (docstrings). All SQL statements now use CONFIG["database"] through a DATABASE module variable.

files_changed:
- database/scripts/setup/setup_lineage_schema.py - Updated DDL templates and SQL to use {DATABASE} placeholder with .format()
- database/scripts/setup/setup_test_data.py - Updated DDL/DML templates to use {DATABASE} placeholder with .format()
- database/scripts/populate/populate_lineage.py - Updated SQL queries and COLUMN_LINEAGE_MAPPINGS to use {DATABASE}
- database/scripts/populate/populate_test_metadata.py - Updated SQL queries and TEST_DATASETS to use {DATABASE}
- database/scripts/utils/insert_cte_test_data.py - Updated CTE_TEST_INSERTS SQL to use {DATABASE} with .format()
- database/scripts/utils/benchmark_cte.py - Updated SQL queries and TEST_DATASETS to use {DATABASE}
- database/tests/run_tests.py - Updated all SQL queries to use f-strings with {DATABASE}
- database/tests/test_correctness.py - Updated SQL queries to use f-strings with {DATABASE}
