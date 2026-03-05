#!/usr/bin/env python3
"""
Migration: Add OL_POPULATE_LOG table for incremental populate tracking.

This is a standalone migration script for existing deployments.
It creates OL_POPULATE_LOG only — does NOT drop or modify any existing tables.

For fresh installs, this table is already included in setup_lineage_schema.py.
Run this script on any existing deployment to add incremental tracking support.

Usage:
    python database/scripts/setup/migrate_add_populate_log.py
    python database/scripts/setup/migrate_add_populate_log.py --dry-run
"""

import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import teradatasql
from db_config import CONFIG

DATABASE = CONFIG["database"]

# DDL for OL_POPULATE_LOG
OL_POPULATE_LOG_DDL = f"""
CREATE MULTISET TABLE {DATABASE}.OL_POPULATE_LOG (
    source_name    VARCHAR(64)  NOT NULL,
    last_run_at    TIMESTAMP(0),
    rows_processed INTEGER,
    status         VARCHAR(20),
    updated_at     TIMESTAMP(0),
    PRIMARY KEY (source_name)
)
"""

# Teradata error code for "table already exists"
TERADATA_TABLE_EXISTS_ERROR = 3803


def migrate(dry_run: bool = False):
    """Create OL_POPULATE_LOG table if it does not already exist."""
    print("=" * 60)
    print("Migration: Add OL_POPULATE_LOG")
    print("=" * 60)
    print(f"Database: {DATABASE}")

    if dry_run:
        print("\n[DRY RUN] Would execute:")
        print(OL_POPULATE_LOG_DDL.strip())
        print("\n[DRY RUN] No changes made.")
        return 0

    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        return 1

    try:
        print(f"\nCreating {DATABASE}.OL_POPULATE_LOG...", end=" ")
        cursor.execute(OL_POPULATE_LOG_DDL)
        print("OK")
        print("\nMigration complete: OL_POPULATE_LOG created successfully.")
        return 0

    except teradatasql.DatabaseError as e:
        error_str = str(e)
        # Check for "table already exists" error (code 3803)
        if str(TERADATA_TABLE_EXISTS_ERROR) in error_str or "already exists" in error_str.lower():
            print("SKIPPED (table already exists)")
            print("\nMigration skipped: OL_POPULATE_LOG already present.")
            return 0
        else:
            print(f"FAILED: {e}")
            return 1

    except Exception as e:
        print(f"FAILED: {e}")
        return 1

    finally:
        try:
            cursor.close()
            conn.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(
        description="Migration: Add OL_POPULATE_LOG table for incremental populate tracking."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be done without making changes"
    )
    args = parser.parse_args()

    return migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
