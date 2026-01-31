#!/usr/bin/env python3
"""
CTE Performance Benchmark Suite (Phase 17)

Measures performance of recursive CTE lineage queries at various depths.
Used to establish baseline metrics and measure optimization impact.

Test configurations:
- Depths: 5, 10, 15, 20 (per PERF-CTE-01)
- Directions: upstream, downstream
- Test datasets: CHAIN_TEST (linear), FANOUT10_TEST (wide), CYCLE5_TEST (cyclic)

Matches CTE patterns from openlineage_repo.go:
- POSITION(lineage_id IN path) = 0 for cycle detection
- VARCHAR(4000) for path column
- is_active = 'Y' filtering
"""

import teradatasql
import sys
import time
import argparse
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from contextlib import contextmanager

from db_config import CONFIG


@dataclass
class BenchmarkResult:
    """Result from a single benchmark run."""
    dataset: str
    direction: str
    depth: int
    times_ms: List[float]
    row_count: int
    max_depth_found: int
    path_bytes_avg: Optional[int] = None
    error: Optional[str] = None

    @property
    def min_time(self) -> float:
        return min(self.times_ms) if self.times_ms else 0.0

    @property
    def avg_time(self) -> float:
        return sum(self.times_ms) / len(self.times_ms) if self.times_ms else 0.0

    @property
    def max_time(self) -> float:
        return max(self.times_ms) if self.times_ms else 0.0


# Test configurations
TEST_DATASETS = {
    'CHAIN_TEST': {
        'dataset': 'demo_user.CHAIN_TEST',
        'field': 'col_a',
        'description': 'Linear chain (4 levels)',
        'pattern': 'linear',
        'directions': ['upstream'],  # Chain is upstream: E->D->C->B->A
    },
    'FANOUT10_TEST': {
        'dataset': 'demo_user.FANOUT10_TEST',
        'field': 'source',
        'description': 'Wide fan-out (1->10)',
        'pattern': 'wide',
        'directions': ['downstream'],  # Fan-out is downstream
    },
    'CYCLE5_TEST': {
        'dataset': 'demo_user.CYCLE5_TEST',
        'field': 'col_a',
        'description': '5-node cycle',
        'pattern': 'cyclic',
        'directions': ['downstream'],  # Test cycle termination
    },
    'FANIN10_TEST': {
        'dataset': 'demo_user.FANIN10_TEST',
        'field': 'target',
        'description': 'Wide fan-in (10->1)',
        'pattern': 'wide',
        'directions': ['upstream'],  # Fan-in is upstream
    },
    'NESTED_DIAMOND': {
        'dataset': 'demo_user.NESTED_DIAMOND',
        'field': 'col_g',
        'description': 'Nested diamond pattern',
        'pattern': 'diamond',
        'directions': ['upstream'],  # Diamond from sink
    },
}

BENCHMARK_DEPTHS = [5, 10, 15, 20]
ITERATIONS = 3
TIMEOUT_SECONDS = 30


def build_upstream_query(dataset: str, field: str, max_depth: int, count_only: bool = True) -> str:
    """Build upstream CTE query matching openlineage_repo.go pattern."""
    select_clause = """
        SELECT
            COUNT(*) AS row_count,
            MAX(depth) AS max_depth_found,
            AVG(CHARACTER_LENGTH(path)) AS avg_path_bytes
        FROM lineage_path
    """ if count_only else """
        SELECT *
        FROM lineage_path
        ORDER BY depth
    """

    return f"""
        WITH RECURSIVE lineage_path (
            lineage_id, source_dataset, source_field, target_dataset, target_field,
            depth, path
        ) AS (
            -- Base case: direct upstream of target
            SELECT
                l.lineage_id, l.source_dataset, l.source_field,
                l.target_dataset, l.target_field,
                1 AS depth,
                CAST(l.lineage_id AS VARCHAR(4000)) AS path
            FROM demo_user.OL_COLUMN_LINEAGE l
            WHERE l.target_dataset = '{dataset}'
              AND l.target_field = '{field}'
              AND l.is_active = 'Y'

            UNION ALL

            -- Recursive case: traverse upstream
            SELECT
                l.lineage_id, l.source_dataset, l.source_field,
                l.target_dataset, l.target_field,
                lp.depth + 1,
                lp.path || ',' || l.lineage_id
            FROM demo_user.OL_COLUMN_LINEAGE l
            INNER JOIN lineage_path lp
                ON l.target_dataset = lp.source_dataset
                AND l.target_field = lp.source_field
            WHERE l.is_active = 'Y'
                AND lp.depth < {max_depth}
                AND POSITION(l.lineage_id IN lp.path) = 0
        )
        {select_clause}
    """


def build_downstream_query(dataset: str, field: str, max_depth: int, count_only: bool = True) -> str:
    """Build downstream CTE query matching openlineage_repo.go pattern."""
    select_clause = """
        SELECT
            COUNT(*) AS row_count,
            MAX(depth) AS max_depth_found,
            AVG(CHARACTER_LENGTH(path)) AS avg_path_bytes
        FROM lineage_path
    """ if count_only else """
        SELECT *
        FROM lineage_path
        ORDER BY depth
    """

    return f"""
        WITH RECURSIVE lineage_path (
            lineage_id, source_dataset, source_field, target_dataset, target_field,
            depth, path
        ) AS (
            -- Base case: direct downstream of source
            SELECT
                l.lineage_id, l.source_dataset, l.source_field,
                l.target_dataset, l.target_field,
                1 AS depth,
                CAST(l.lineage_id AS VARCHAR(4000)) AS path
            FROM demo_user.OL_COLUMN_LINEAGE l
            WHERE l.source_dataset = '{dataset}'
              AND l.source_field = '{field}'
              AND l.is_active = 'Y'

            UNION ALL

            -- Recursive case: traverse downstream
            SELECT
                l.lineage_id, l.source_dataset, l.source_field,
                l.target_dataset, l.target_field,
                lp.depth + 1,
                lp.path || ',' || l.lineage_id
            FROM demo_user.OL_COLUMN_LINEAGE l
            INNER JOIN lineage_path lp
                ON l.source_dataset = lp.target_dataset
                AND l.source_field = lp.target_field
            WHERE l.is_active = 'Y'
                AND lp.depth < {max_depth}
                AND POSITION(l.lineage_id IN lp.path) = 0
        )
        {select_clause}
    """


def build_locking_query(base_query: str) -> str:
    """Add LOCKING ROW FOR ACCESS hint to query."""
    # Insert locking hint before the WITH clause
    return base_query.replace(
        "WITH RECURSIVE",
        "LOCKING ROW FOR ACCESS\n        WITH RECURSIVE"
    )


@contextmanager
def query_timeout(cursor, seconds: int):
    """Context manager to handle query timeout via session setting."""
    try:
        # Set query timeout (Teradata uses seconds)
        cursor.execute(f"SET QUERY_BAND = 'QueryTimeout={seconds};' FOR SESSION")
        yield
    except Exception:
        yield  # Ignore if setting fails, proceed without timeout
    finally:
        try:
            cursor.execute("SET QUERY_BAND = NONE FOR SESSION")
        except Exception:
            pass


def run_benchmark(cursor, query: str, iterations: int = 3) -> Tuple[List[float], int, int, Optional[int]]:
    """
    Run a benchmark query multiple times and collect timing data.

    Returns:
        Tuple of (times_ms, row_count, max_depth_found, avg_path_bytes)
    """
    times_ms = []
    row_count = 0
    max_depth_found = 0
    avg_path_bytes = None

    for _ in range(iterations):
        start = time.perf_counter()
        cursor.execute(query)
        row = cursor.fetchone()
        elapsed = (time.perf_counter() - start) * 1000  # Convert to ms

        times_ms.append(elapsed)
        if row:
            row_count = row[0] or 0
            max_depth_found = row[1] or 0
            avg_path_bytes = int(row[2]) if row[2] else None

    return times_ms, row_count, max_depth_found, avg_path_bytes


def run_explain(cursor, query: str) -> str:
    """Run EXPLAIN on a query and return the plan."""
    try:
        explain_query = f"EXPLAIN {query}"
        cursor.execute(explain_query)
        rows = cursor.fetchall()
        return "\n".join(str(row[0]) for row in rows)
    except Exception as e:
        return f"EXPLAIN failed: {e}"


def benchmark_dataset(cursor, dataset_name: str, config: Dict, depths: List[int],
                      iterations: int, capture_explain: bool = False) -> List[BenchmarkResult]:
    """Run benchmarks for a single dataset across all depths and directions."""
    results = []
    dataset = config['dataset']
    field = config['field']
    directions = config['directions']

    for direction in directions:
        for depth in depths:
            try:
                if direction == 'upstream':
                    query = build_upstream_query(dataset, field, depth)
                else:
                    query = build_downstream_query(dataset, field, depth)

                times_ms, row_count, max_depth_found, avg_path_bytes = run_benchmark(
                    cursor, query, iterations
                )

                result = BenchmarkResult(
                    dataset=dataset_name,
                    direction=direction,
                    depth=depth,
                    times_ms=times_ms,
                    row_count=row_count,
                    max_depth_found=max_depth_found,
                    path_bytes_avg=avg_path_bytes,
                )
                results.append(result)

                # Print progress
                print(f"  [{dataset_name}] {direction:10s} depth={depth:2d}: "
                      f"{result.avg_time:7.2f}ms (rows={row_count}, max_depth={max_depth_found})")

            except Exception as e:
                error_msg = str(e)[:50]
                result = BenchmarkResult(
                    dataset=dataset_name,
                    direction=direction,
                    depth=depth,
                    times_ms=[],
                    row_count=0,
                    max_depth_found=0,
                    error=error_msg,
                )
                results.append(result)
                print(f"  [{dataset_name}] {direction:10s} depth={depth:2d}: ERROR - {error_msg}")

    return results


def get_table_stats(cursor) -> Dict[str, int]:
    """Get record counts from OL_COLUMN_LINEAGE table."""
    stats = {}
    try:
        cursor.execute("SELECT COUNT(*) FROM demo_user.OL_COLUMN_LINEAGE")
        stats['total_records'] = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM demo_user.OL_COLUMN_LINEAGE WHERE lineage_id LIKE 'TEST_%'")
        stats['test_records'] = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM demo_user.OL_COLUMN_LINEAGE WHERE is_active = 'Y'")
        stats['active_records'] = cursor.fetchone()[0]
    except Exception as e:
        print(f"  Warning: Could not get table stats: {e}")
        stats = {'total_records': 0, 'test_records': 0, 'active_records': 0}

    return stats


def print_results_table(results: List[BenchmarkResult]) -> None:
    """Print results in markdown table format."""
    print("\n## Benchmark Results\n")
    print("| Dataset | Direction | Depth | Min (ms) | Avg (ms) | Max (ms) | Rows | Max Depth | Path Bytes |")
    print("|---------|-----------|-------|----------|----------|----------|------|-----------|------------|")

    for r in results:
        if r.error:
            print(f"| {r.dataset:15s} | {r.direction:9s} | {r.depth:5d} | ERROR | {r.error[:30]:30s} |")
        else:
            path_bytes = str(r.path_bytes_avg) if r.path_bytes_avg else "N/A"
            print(f"| {r.dataset:15s} | {r.direction:9s} | {r.depth:5d} | "
                  f"{r.min_time:8.2f} | {r.avg_time:8.2f} | {r.max_time:8.2f} | "
                  f"{r.row_count:4d} | {r.max_depth_found:9d} | {path_bytes:>10s} |")


def check_test_data_exists(cursor) -> bool:
    """Check if test data from insert_cte_test_data.py exists."""
    try:
        cursor.execute("""
            SELECT COUNT(*)
            FROM demo_user.OL_COLUMN_LINEAGE
            WHERE lineage_id LIKE 'TEST_%'
        """)
        count = cursor.fetchone()[0]
        return count > 0
    except Exception:
        return False


def main():
    """Run CTE performance benchmarks."""
    parser = argparse.ArgumentParser(
        description='CTE Performance Benchmark Suite',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python benchmark_cte.py                    # Run all benchmarks
  python benchmark_cte.py --depths 5 10      # Test specific depths
  python benchmark_cte.py --datasets CHAIN_TEST CYCLE5_TEST
  python benchmark_cte.py --explain          # Capture EXPLAIN plans
  python benchmark_cte.py --iterations 5     # More iterations for accuracy
        """
    )
    parser.add_argument('--depths', type=int, nargs='+', default=BENCHMARK_DEPTHS,
                        help=f'Depths to test (default: {BENCHMARK_DEPTHS})')
    parser.add_argument('--datasets', type=str, nargs='+',
                        choices=list(TEST_DATASETS.keys()),
                        help='Datasets to test (default: all)')
    parser.add_argument('--iterations', type=int, default=ITERATIONS,
                        help=f'Number of iterations per benchmark (default: {ITERATIONS})')
    parser.add_argument('--explain', action='store_true',
                        help='Capture EXPLAIN plans for analysis')
    parser.add_argument('--locking', action='store_true',
                        help='Test with LOCKING ROW FOR ACCESS hint')
    parser.add_argument('--output', type=str,
                        help='Write results to file (markdown format)')

    args = parser.parse_args()

    print("=" * 60)
    print("CTE PERFORMANCE BENCHMARK SUITE (Phase 17)")
    print("=" * 60)
    print(f"Depths: {args.depths}")
    print(f"Iterations per test: {args.iterations}")
    print(f"Capture EXPLAIN: {args.explain}")

    # Connect
    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"\nERROR: Failed to connect to database: {e}")
        print("Cannot run benchmarks without database connection.")
        return 1

    # Check for test data
    if not check_test_data_exists(cursor):
        print("\nWARNING: Test data not found!")
        print("Run: cd database && python insert_cte_test_data.py")
        print("Continuing with available data...")

    # Get table statistics
    print("\n--- Table Statistics ---")
    stats = get_table_stats(cursor)
    print(f"  Total records: {stats['total_records']}")
    print(f"  Test records: {stats['test_records']}")
    print(f"  Active records: {stats['active_records']}")

    # Select datasets to test
    datasets_to_test = args.datasets if args.datasets else list(TEST_DATASETS.keys())

    # Run benchmarks
    print("\n--- Running Benchmarks ---")
    all_results = []

    for dataset_name in datasets_to_test:
        if dataset_name not in TEST_DATASETS:
            print(f"  Skipping unknown dataset: {dataset_name}")
            continue

        config = TEST_DATASETS[dataset_name]
        print(f"\n[{dataset_name}] {config['description']} ({config['pattern']} pattern)")

        results = benchmark_dataset(
            cursor, dataset_name, config,
            args.depths, args.iterations, args.explain
        )
        all_results.extend(results)

        # Capture EXPLAIN for depth=10 if requested
        if args.explain:
            for direction in config['directions']:
                if direction == 'upstream':
                    query = build_upstream_query(config['dataset'], config['field'], 10)
                else:
                    query = build_downstream_query(config['dataset'], config['field'], 10)

                explain_output = run_explain(cursor, query)
                print(f"\n  EXPLAIN ({direction}, depth=10):")
                for line in explain_output.split('\n')[:20]:  # First 20 lines
                    print(f"    {line}")
                if explain_output.count('\n') > 20:
                    print(f"    ... ({explain_output.count(chr(10)) - 20} more lines)")

    # Print results table
    print_results_table(all_results)

    # Write to file if requested
    if args.output:
        try:
            with open(args.output, 'w') as f:
                f.write("# CTE Benchmark Results\n\n")
                f.write(f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"**Host:** {CONFIG['host']}\n")
                f.write(f"**Iterations:** {args.iterations}\n\n")

                f.write("## Results\n\n")
                f.write("| Dataset | Direction | Depth | Min (ms) | Avg (ms) | Max (ms) | Rows | Max Depth | Path Bytes |\n")
                f.write("|---------|-----------|-------|----------|----------|----------|------|-----------|------------|\n")

                for r in all_results:
                    if r.error:
                        f.write(f"| {r.dataset} | {r.direction} | {r.depth} | ERROR | {r.error} |\n")
                    else:
                        path_bytes = str(r.path_bytes_avg) if r.path_bytes_avg else "N/A"
                        f.write(f"| {r.dataset} | {r.direction} | {r.depth} | "
                                f"{r.min_time:.2f} | {r.avg_time:.2f} | {r.max_time:.2f} | "
                                f"{r.row_count} | {r.max_depth_found} | {path_bytes} |\n")

            print(f"\nResults written to: {args.output}")
        except Exception as e:
            print(f"\nWarning: Could not write to {args.output}: {e}")

    # Summary statistics
    print("\n--- Summary ---")
    successful = [r for r in all_results if not r.error]
    if successful:
        avg_times = [r.avg_time for r in successful]
        print(f"  Tests run: {len(all_results)}")
        print(f"  Successful: {len(successful)}")
        print(f"  Errors: {len(all_results) - len(successful)}")
        print(f"  Overall avg time: {sum(avg_times) / len(avg_times):.2f}ms")
        print(f"  Fastest: {min(avg_times):.2f}ms")
        print(f"  Slowest: {max(avg_times):.2f}ms")

        # Performance by depth
        print("\n  Performance by depth:")
        for depth in sorted(set(r.depth for r in successful)):
            depth_results = [r for r in successful if r.depth == depth]
            depth_avg = sum(r.avg_time for r in depth_results) / len(depth_results)
            print(f"    Depth {depth:2d}: {depth_avg:7.2f}ms avg")

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Benchmark complete!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
