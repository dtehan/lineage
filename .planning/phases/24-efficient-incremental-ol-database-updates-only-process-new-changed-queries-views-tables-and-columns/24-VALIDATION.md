---
phase: 24
slug: efficient-incremental-ol-database-updates-only-process-new-changed-queries-views-tables-and-columns
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-04
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python unittest (run_tests.py orchestrator) |
| **Config file** | none — see `database/tests/run_tests.py` |
| **Quick run command** | `cd database && python tests/run_tests.py` |
| **Full suite command** | `cd database && python tests/run_tests.py` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd database && python tests/run_tests.py`
- **After every plan wave:** Run `cd database && python tests/run_tests.py`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | WatermarkStore class + DDL | unit | `cd database && python -m pytest tests/test_watermark_store.py -v` | Plan 01 Task 2 | pending |
| 24-01-02 | 01 | 1 | WatermarkStore unit tests | unit | `cd database && python -m pytest tests/test_watermark_store.py -v` | Plan 01 Task 2 | pending |
| 24-02-01 | 02 | 2 | DBQL watermark auto-read/write | source inspection | AST verify in plan | N/A | pending |
| 24-02-02 | 02 | 2 | Changed-view detection + stale cleanup | source inspection | AST verify in plan | N/A | pending |
| 24-03-01 | 03 | 3 | AlterTimeStamp dataset/field filtering | integration | `cd database && python -m pytest tests/test_incremental_populate.py -v` | Plan 03 Task 3 | pending |
| 24-03-02 | 03 | 3 | CLI flags + watermark wiring | source inspection | AST verify in plan | N/A | pending |
| 24-03-03 | 03 | 3 | Integration tests for incremental populate | integration | `cd database && python -m pytest tests/test_incremental_populate.py -v` | Plan 03 Task 3 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `database/tests/test_watermark_store.py` — unit tests for WatermarkStore get/set (created by Plan 01 Task 2)
- [x] `database/tests/test_incremental_populate.py` — integration tests for changed-tables detection (created by Plan 03 Task 3)
- [x] `database/scripts/setup/migrate_add_populate_log.py` — migration script for existing deployments (created by Plan 01 Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end incremental populate on live Teradata | Full pipeline verification | Requires live DB with AlterTimeStamp | Run `populate_lineage.py` twice, verify second run processes fewer objects |
| `--reset-watermark` clears OL_POPULATE_LOG | Admin reset capability | Requires live DB state | Run `--reset-watermark datasets`, verify next run does full refresh |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
