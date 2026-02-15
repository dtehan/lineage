#!/usr/bin/env python3
"""
Regression validation script for OL_COLUMN_LINEAGE data integrity.

This script captures a baseline snapshot of OL_COLUMN_LINEAGE records and
validates that the data remains unchanged after parser consolidation or other
major refactorings. Supports CLEANUP-04 regression testing requirements.

Usage:
  # Before consolidation
  python scripts/validate_migration.py --capture baseline.json

  # After consolidation and re-population
  python scripts/validate_migration.py --validate baseline.json

  # Use custom database
  python scripts/validate_migration.py --capture baseline.json --database demo_user

The script captures:
  - Total count of active lineage records
  - Sample hashes of first 100 records (by lineage_id)
  - Timestamp of capture

Validation compares both counts and hashes, reporting PASS or FAIL with details.
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

import argparse
import hashlib
import json
from datetime import datetime
from typing import Dict, List

import teradatasql

from db_config import CONFIG


def capture_baseline(cursor, database: str) -> Dict:
    """
    Capture current state of OL_COLUMN_LINEAGE table.

    Args:
        cursor: Active Teradata cursor
        database: Database name containing OL_COLUMN_LINEAGE

    Returns:
        Dict with total_count, sample_hashes, and timestamp
    """
    print(f"Capturing baseline from {database}.OL_COLUMN_LINEAGE...")

    # Get total count of active lineage records
    cursor.execute(f"""
        SELECT COUNT(*)
        FROM {database}.OL_COLUMN_LINEAGE
        WHERE is_active = 'Y'
    """)
    total_count = cursor.fetchone()[0]
    print(f"  Total active records: {total_count}")

    # Get sample of records for hash comparison
    cursor.execute(f"""
        SELECT
            lineage_id,
            source_namespace,
            source_dataset,
            source_field,
            target_namespace,
            target_dataset,
            target_field,
            transformation_type
        FROM {database}.OL_COLUMN_LINEAGE
        WHERE is_active = 'Y'
        ORDER BY lineage_id
        FETCH FIRST 100 ROWS ONLY
    """)

    sample_rows = cursor.fetchall()
    sample_hashes = []

    for row in sample_rows:
        # Create deterministic string from record
        record_str = "|".join(str(val) if val else "" for val in row)
        # Hash the record
        record_hash = hashlib.sha256(record_str.encode()).hexdigest()
        sample_hashes.append(record_hash)

    print(f"  Sample records hashed: {len(sample_hashes)}")

    baseline = {
        "total_count": total_count,
        "sample_hashes": sample_hashes,
        "timestamp": datetime.utcnow().isoformat(),
        "database": database
    }

    return baseline


def validate_migration(cursor, database: str, baseline: Dict) -> bool:
    """
    Validate current state against baseline snapshot.

    Args:
        cursor: Active Teradata cursor
        database: Database name containing OL_COLUMN_LINEAGE
        baseline: Baseline dict from capture_baseline()

    Returns:
        True if validation passes, False otherwise
    """
    print(f"\nValidating against baseline from {baseline['timestamp']}...")
    print(f"  Baseline database: {baseline['database']}")
    print(f"  Current database: {database}")

    # Capture current state
    current = capture_baseline(cursor, database)

    # Compare total counts
    print("\n" + "="*60)
    print("VALIDATION RESULTS")
    print("="*60)

    count_match = current["total_count"] == baseline["total_count"]
    print(f"Total Count:")
    print(f"  Baseline: {baseline['total_count']}")
    print(f"  Current:  {current['total_count']}")
    print(f"  Status:   {'✓ PASS' if count_match else '✗ FAIL'}")

    # Compare sample hashes
    hash_match = current["sample_hashes"] == baseline["sample_hashes"]
    print(f"\nSample Hashes:")
    print(f"  Baseline: {len(baseline['sample_hashes'])} records")
    print(f"  Current:  {len(current['sample_hashes'])} records")
    print(f"  Status:   {'✓ PASS' if hash_match else '✗ FAIL'}")

    if not hash_match and len(current["sample_hashes"]) == len(baseline["sample_hashes"]):
        # Show which records differ
        mismatches = []
        for i, (baseline_hash, current_hash) in enumerate(zip(baseline["sample_hashes"], current["sample_hashes"])):
            if baseline_hash != current_hash:
                mismatches.append(i)

        if mismatches:
            print(f"  Mismatched records: {mismatches[:10]}")
            if len(mismatches) > 10:
                print(f"  ... and {len(mismatches) - 10} more")

    # Overall result
    print("\n" + "="*60)
    overall_pass = count_match and hash_match
    if overall_pass:
        print("RESULT: ✓ VALIDATION PASSED")
        print("Data integrity confirmed - no changes detected")
    else:
        print("RESULT: ✗ VALIDATION FAILED")
        print("Data has changed - review differences above")
    print("="*60)

    return overall_pass


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Validate OL_COLUMN_LINEAGE data integrity before/after migration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Capture baseline before consolidation
  python scripts/validate_migration.py --capture baseline.json

  # Validate after consolidation
  python scripts/validate_migration.py --validate baseline.json

  # Use custom database
  python scripts/validate_migration.py --capture baseline.json --database my_db
        """
    )

    parser.add_argument(
        "--capture",
        metavar="FILE",
        help="Capture baseline to JSON file"
    )
    parser.add_argument(
        "--validate",
        metavar="FILE",
        help="Validate against baseline JSON file"
    )
    parser.add_argument(
        "--database",
        default=CONFIG.get('database', 'demo_user'),
        help="Database containing OL_COLUMN_LINEAGE (default: from CONFIG)"
    )

    args = parser.parse_args()

    # Validate arguments
    if not args.capture and not args.validate:
        parser.error("Must specify either --capture or --validate")
    if args.capture and args.validate:
        parser.error("Cannot specify both --capture and --validate")

    # Connect to Teradata
    try:
        conn = teradatasql.connect(
            host=CONFIG['host'],
            user=CONFIG['user'],
            password=CONFIG['password'],
            database=args.database
        )
        cursor = conn.cursor()
        print(f"Connected to Teradata: {CONFIG['host']}")
    except Exception as e:
        print(f"Error connecting to Teradata: {e}", file=sys.stderr)
        return 1

    try:
        if args.capture:
            # Capture mode
            baseline = capture_baseline(cursor, args.database)

            # Write to file
            output_path = Path(args.capture)
            with open(output_path, 'w') as f:
                json.dump(baseline, f, indent=2)

            print(f"\nBaseline saved to: {output_path}")
            print("Run validation after consolidation using:")
            print(f"  python scripts/validate_migration.py --validate {args.capture}")
            return 0

        else:
            # Validate mode
            baseline_path = Path(args.validate)
            if not baseline_path.exists():
                print(f"Error: Baseline file not found: {baseline_path}", file=sys.stderr)
                return 1

            with open(baseline_path) as f:
                baseline = json.load(f)

            passed = validate_migration(cursor, args.database, baseline)
            return 0 if passed else 1

    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
