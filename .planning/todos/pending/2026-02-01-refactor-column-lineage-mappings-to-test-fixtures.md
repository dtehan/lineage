---
created: 2026-02-01T13:13
title: Refactor COLUMN_LINEAGE_MAPPINGS to test fixtures
area: database
files:
  - database/scripts/populate/populate_lineage.py
---

## Problem

The `populate_lineage.py` script contains a `COLUMN_LINEAGE_MAPPINGS` dictionary that appears to be hardcoded test data rather than actual database-discovered lineage. This mixing of test data with production data extraction logic makes the function less clear and potentially misleading.

The `populate_open_lineage` function should be focused on extracting actual lineage from the database (via DBC views, DBQL, or other metadata sources), not populating predefined test mappings.

## Solution

1. Extract `COLUMN_LINEAGE_MAPPINGS` from `populate_lineage.py` into a separate test fixture module (e.g., `database/scripts/populate/test_fixtures.py` or `database/tests/fixtures/lineage_mappings.py`)

2. Create a separate utility function or script specifically for populating test lineage data that uses these fixtures (e.g., `populate_test_lineage.py`)

3. Update `populate_lineage.py` to focus solely on extracting real lineage from database metadata sources

4. Update documentation to clearly distinguish between:
   - Production lineage extraction (from DBC views/DBQL)
   - Test data population (from fixtures)

This separation will make the codebase clearer and ensure the production lineage extraction logic isn't conflated with test scaffolding.
