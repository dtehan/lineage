#!/usr/bin/env python3
"""
Collect Statistics on OpenLineage Tables

Runs COLLECT STATISTICS on indexed columns to inform Teradata optimizer.
Per RESEARCH.md: Use NO SAMPLE for small tables (<1M rows).
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import teradatasql
from db_config import CONFIG

DATABASE = CONFIG["database"]

STATISTICS_STATEMENTS = [
    # Composite index statistics (critical for join optimization)
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE INDEX (target_dataset, target_field)",
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE INDEX (source_dataset, source_field)",

    # Column-level statistics for optimizer cardinality estimates
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (is_active)",
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (lineage_id)",
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (transformation_type)",

    # Existing single-column index statistics
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (source_dataset)",
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (source_field)",
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (target_dataset)",
    f"COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (target_field)",
]

def main():
    print("=" * 60)
    print("Collecting Statistics on OpenLineage Tables")
    print("=" * 60)

    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print(f"Connected to {CONFIG['host']}")

        for i, stmt in enumerate(STATISTICS_STATEMENTS, 1):
            print(f"\n[{i}/{len(STATISTICS_STATEMENTS)}] {stmt[:80]}...")
            try:
                cursor.execute(stmt)
                print("  ✓ Complete")
            except Exception as e:
                print(f"  ✗ Error: {e}")

        # Validate statistics collected
        print("\n--- Validation ---")
        cursor.execute(f"HELP STATISTICS {DATABASE}.OL_COLUMN_LINEAGE")
        stats = cursor.fetchall()
        print(f"  Statistics collected: {len(stats)} column/index combinations")

        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("Statistics collection complete!")
        print("=" * 60)
        return 0

    except Exception as e:
        print(f"\nERROR: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
