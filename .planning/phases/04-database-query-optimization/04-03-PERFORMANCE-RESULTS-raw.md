# CTE Benchmark Results

**Date:** 2026-02-15 17:19:44
**Host:** test-sad3sstx4u4llczi.env.clearscape.teradata.com
**Iterations:** 5

## Results

| Dataset | Direction | Depth | Min (ms) | Avg (ms) | Max (ms) | Rows | Max Depth | Path Bytes |
|---------|-----------|-------|----------|----------|----------|------|-----------|------------|
| CHAIN_TEST | upstream | 5 | 104.13 | 133.78 | 147.25 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 10 | 104.81 | 121.60 | 126.54 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 15 | 103.60 | 129.66 | 147.37 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 20 | 125.91 | 142.98 | 188.71 | 4 | 4 | 36 |
| FANOUT10_TEST | downstream | 5 | 84.00 | 105.16 | 146.57 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 10 | 82.62 | 87.97 | 104.37 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 15 | 83.26 | 100.80 | 126.35 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 20 | 83.62 | 100.96 | 126.19 | 10 | 1 | 17 |
| CYCLE5_TEST | downstream | 5 | 125.87 | 146.84 | 188.95 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 10 | 145.80 | 192.61 | 250.14 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 15 | 126.42 | 188.68 | 354.66 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 20 | 125.37 | 138.79 | 168.26 | 5 | 5 | 47 |
| FANIN10_TEST | upstream | 5 | 82.56 | 99.81 | 125.77 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 10 | 83.56 | 104.73 | 146.35 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 15 | 84.44 | 105.87 | 129.79 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 20 | 83.73 | 105.19 | 126.71 | 10 | 1 | 16 |
| NESTED_DIAMOND | upstream | 5 | 104.66 | 213.62 | 481.87 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 10 | 102.86 | 133.66 | 167.14 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 15 | 104.25 | 138.68 | 168.54 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 20 | 125.94 | 138.58 | 166.94 | 12 | 4 | 67 |
