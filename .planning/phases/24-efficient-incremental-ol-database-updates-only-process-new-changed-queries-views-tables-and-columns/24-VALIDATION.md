---
phase: 24
slug: efficient-incremental-ol-database-updates-only-process-new-changed-queries-views-tables-and-columns
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 24-01-01 | 01 | 0 | WatermarkStore unit tests | unit | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 0 | Incremental populate tests | integration | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | WatermarkStore get/set | unit | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |
| 24-01-04 | 01 | 1 | Incremental dataset skips unchanged | unit | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |
| 24-01-05 | 01 | 1 | New tables processed | integration | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |
| 24-01-06 | 01 | 2 | Stale view lineage deletion | unit | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |
| 24-01-07 | 01 | 2 | DBQL watermark auto-read | unit | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |
| 24-01-08 | 01 | 2 | Full-refresh bypasses watermarks | unit | `cd database && python tests/run_tests.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `database/tests/test_watermark_store.py` — unit tests for WatermarkStore get/set
- [ ] `database/tests/test_incremental_populate.py` — integration tests for changed-tables detection
- [ ] `database/scripts/setup/migrate_add_populate_log.py` — migration script for existing deployments

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end incremental populate on live Teradata | Full pipeline verification | Requires live DB with AlterTimeStamp | Run `populate_lineage.py` twice, verify second run processes fewer objects |
| `--reset-watermark` clears OL_POPULATE_LOG | Admin reset capability | Requires live DB state | Run `--reset-watermark datasets`, verify next run does full refresh |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
