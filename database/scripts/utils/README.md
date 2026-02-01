# Utility Scripts

Testing and performance utilities for database operations.

## Scripts

### insert_cte_test_data.py
Inserts test lineage patterns directly into OL_COLUMN_LINEAGE for edge case testing.

**Usage:**
```bash
python scripts/utils/insert_cte_test_data.py
```

**Test patterns:**
- **Cycles**: 5-node, 10-node, 20-node cycles (tests cycle detection)
- **Chains**: 50-node, 100-node linear chains (tests depth handling)
- **Fan-out**: 1→10, 1→25, 1→100 wide spreads (tests breadth)
- **Fan-in**: 10→1, 25→1, 100→1 convergence (tests merging)
- **Diamonds**: Multiple paths to same target (tests deduplication)
- **Combined**: Mixed patterns (tests complex scenarios)
- **Inactive**: Filtered lineage (tests is_active='N')

After running, execute `populate_test_metadata.py` to register the test tables.

### benchmark_cte.py
Performance benchmark suite for recursive CTE lineage queries.

**Usage:**
```bash
python scripts/utils/benchmark_cte.py              # Run all benchmarks
python scripts/utils/benchmark_cte.py --depth 10   # Test specific depth
python scripts/utils/benchmark_cte.py --upstream   # Upstream only
python scripts/utils/benchmark_cte.py --export     # Export results
```

**Measures:**
- Query execution time at depths 5, 10, 15, 20
- Upstream vs downstream performance
- Different graph patterns (linear, fan-out, cycles)
- Memory usage and path column size

Used to establish baseline metrics and validate optimization efforts.
