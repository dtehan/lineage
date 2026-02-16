# CTE Benchmark Results

**Date:** 2026-02-15 17:06:27
**Host:** test-sad3sstx4u4llczi.env.clearscape.teradata.com
**Iterations:** 3

## Results

| Dataset | Direction | Depth | Min (ms) | Avg (ms) | Max (ms) | Rows | Max Depth | Path Bytes |
|---------|-----------|-------|----------|----------|----------|------|-----------|------------|
| CHAIN_TEST | upstream | 5 | 124.59 | 146.14 | 167.79 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 10 | 126.86 | 146.99 | 166.94 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 15 | 126.08 | 146.53 | 167.65 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 20 | 125.86 | 146.87 | 167.64 | 4 | 4 | 36 |
| FANOUT10_TEST | downstream | 5 | 84.25 | 111.55 | 125.78 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 10 | 83.97 | 111.80 | 126.02 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 15 | 84.25 | 111.88 | 126.21 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 20 | 84.01 | 112.46 | 126.87 | 10 | 1 | 17 |
| CYCLE5_TEST | downstream | 5 | 125.52 | 153.37 | 168.41 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 10 | 124.91 | 152.72 | 166.92 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 15 | 126.23 | 154.15 | 168.12 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 20 | 126.17 | 154.05 | 168.34 | 5 | 5 | 47 |
| FANIN10_TEST | upstream | 5 | 104.87 | 126.24 | 147.88 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 10 | 83.53 | 118.46 | 146.53 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 15 | 83.56 | 111.73 | 126.65 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 20 | 83.75 | 111.58 | 125.58 | 10 | 1 | 16 |
| NESTED_DIAMOND | upstream | 5 | 125.87 | 153.54 | 168.80 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 10 | 126.53 | 153.54 | 167.90 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 15 | 126.34 | 146.17 | 166.92 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 20 | 147.07 | 174.42 | 188.45 | 12 | 4 | 67 |
