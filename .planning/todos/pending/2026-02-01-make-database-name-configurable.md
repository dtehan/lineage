---
created: 2026-02-01T12:56
title: Make database name configurable in database scripts
area: database
files:
  - database/scripts/setup/setup_lineage_schema.py
  - database/scripts/setup/setup_test_data.py
  - database/scripts/populate/populate_lineage.py
  - database/db_config.py
---

## Problem

Database scripts currently hardcode `demo_user` as the database name in various places. This prevents users from deploying the lineage tables to a different database without modifying the scripts.

While `TERADATA_DATABASE` exists as an environment variable (default: `demo_user`), the scripts may not consistently use it, or there may be hardcoded references that bypass the configuration.

## Solution

Audit all database scripts to ensure they use the `TERADATA_DATABASE` environment variable from `db_config.py` instead of hardcoded `demo_user` strings. Update any hardcoded database references to use the configuration system consistently.

Consider adding validation to ensure the configured database exists before attempting operations.
