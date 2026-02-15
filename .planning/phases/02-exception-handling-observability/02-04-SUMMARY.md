---
phase: 02-exception-handling-observability
plan: 04
subsystem: backend/logging
tags:
  - logging
  - observability
  - configuration
  - gap-closure
dependency_graph:
  requires:
    - 02-01-SUMMARY.md (logging_config.py module)
  provides:
    - Dual-sink logging (stdout + rotating file)
  affects:
    - All backend log output
tech_stack:
  added:
    - sys.stdout as loguru sink
    - Rotating file handler with compression
  patterns:
    - Dual-sink logging pattern
    - Log rotation and retention policy
key_files:
  created: []
  modified:
    - lineage-api/utils/logging_config.py (dual-sink configuration)
    - .gitignore (logs/ directory exclusion)
decisions:
  - Use sys.stdout directly instead of print() lambda for stdout sink
  - Configure identical JSON format for both stdout and file sinks
  - Set rotation at 100 MB with 30-day retention for disk space management
  - Apply gzip compression to rotated files to reduce storage footprint
  - Place logs/ directory at lineage-api/logs/ relative to working directory
metrics:
  duration_minutes: 1.0
  tasks_completed: 1
  files_modified: 2
  commits: 1
  completed_date: "2026-02-15"
---

# Phase 02 Plan 04: Dual-Sink Logging Summary

**One-liner:** Added dual-sink logging (stdout + rotating file) with 100 MB rotation and 30-day retention to replace single print()-based sink.

## Overview

This plan closed UAT gap #6 by implementing dual-sink logging configuration. Backend logs now flow to both stdout (for container environments) and a rotating log file (for local development and debugging). Both sinks use identical JSON format with structured logging support.

## What Was Built

### Dual-Sink Logging Configuration

**File:** `lineage-api/utils/logging_config.py`

**Changes:**
- **Replaced print() lambda with sys.stdout sink** — Direct stdout sink instead of lambda wrapper for cleaner implementation
- **Added rotating file sink** at `logs/lineage-api.log` with:
  - `rotation="100 MB"` — Rotate when file reaches 100 MB
  - `retention="30 days"` — Auto-delete rotated files older than 30 days
  - `compression="gz"` — Compress rotated files to save disk space
- **Identical JSON format** — Both sinks use `serialize=True` for consistent structured output
- **Updated docstrings** — Removed incorrect "stderr" references, documented dual-sink behavior

**File:** `.gitignore`

**Changes:**
- Added `logs/` entry under "Logs" section to prevent committing log files

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification checks passed:

1. ✅ `configure_logging()` creates exactly 2 handlers (stdout + file)
2. ✅ File sink configured with rotation="100 MB", retention="30 days", compression="gz"
3. ✅ No lambda sinks remain — sys.stdout used directly
4. ✅ Both sinks produce valid JSON output with identical format
5. ✅ logs/ directory automatically created when first log written
6. ✅ .gitignore includes logs/ directory
7. ✅ python_server.py requires zero changes (API unchanged)

**Test Output:**
```json
{"text": "2026-02-15T13:15:26.838316-0800 INFO Test log entry\n", "record": {"elapsed": {"repr": "0:00:00.058036", "seconds": 0.058036}, "exception": null, "extra": {"test": true}, "file": {"name": "<string>", "path": "<string>"}, "function": "<module>", "level": {"icon": "ℹ️", "name": "INFO", "no": 20}, "line": 13, "message": "Test log entry", "module": "<string>", "name": "__main__", "process": {"id": 95032, "name": "MainProcess"}, "thread": {"id": 8702308480, "name": "MainThread"}, "time": {"repr": "2026-02-15 13:15:26.838316-08:00", "timestamp": 1771190126.838316}}}
```

## Key Decisions

1. **sys.stdout over print() lambda** — Direct stdout sink is cleaner and avoids unnecessary function call overhead
2. **Identical format for both sinks** — Both use JSON serialization for consistent parsing by observability platforms
3. **100 MB rotation threshold** — Balances file size manageability with rotation frequency
4. **30-day retention** — Provides sufficient historical data for debugging while managing disk space
5. **gzip compression** — Reduces storage footprint for archived logs (typically 5-10x compression ratio)

## Testing Notes

- All 6 verification checks passed in automated test script
- Verified handler count: 2 (stdout + file)
- Verified JSON format: Valid JSON with all expected fields (text, record, level, message, time, etc.)
- Verified sys.stdout used directly (no lambda in source)
- Verified .gitignore contains logs/ entry

## Integration Impact

**Zero breaking changes:**
- `configure_logging()` function signature unchanged
- Return value unchanged (still returns logger instance)
- No changes required in `python_server.py` or any calling code
- Existing correlation ID binding via `contextualize()` works for both sinks (loguru handles this automatically)

## UAT Gap Closure

**UAT Gap #6:** "Logs should go to both stdout and file"

**Status:** ✅ CLOSED

**Evidence:**
- Stdout sink: `sys.stdout` with JSON serialization
- File sink: `logs/lineage-api.log` with JSON serialization, rotation, and compression
- Both sinks active simultaneously
- Identical JSON format ensures consistent parsing

## Files Modified

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `lineage-api/utils/logging_config.py` | +27/-7 | Added dual-sink configuration |
| `.gitignore` | +1 | Added logs/ directory exclusion |

## Commits

| Hash | Message |
|------|---------|
| `2ebb0b7` | feat(02-04): add dual-sink logging (stdout + rotating file) |

## Next Steps

This plan completes the gap closure work for Phase 02. The dual-sink logging configuration is now ready for:

1. **Runtime validation** — Start server and verify logs appear in both stdout and logs/lineage-api.log
2. **Rotation testing** — Verify file rotation occurs at 100 MB threshold
3. **Retention testing** — Verify rotated files are deleted after 30 days
4. **Compression testing** — Verify rotated files are gzipped

## Self-Check: PASSED

**Files Verified:**
- ✅ FOUND: lineage-api/utils/logging_config.py (modified)
- ✅ FOUND: .gitignore (modified)

**Commits Verified:**
- ✅ FOUND: 2ebb0b7 (feat(02-04): add dual-sink logging)

**Handler Count Verified:**
- ✅ PASSED: 2 handlers configured (stdout + file)

**JSON Format Verified:**
- ✅ PASSED: Valid JSON output with all required fields

**Code Quality Verified:**
- ✅ PASSED: No lambda sinks remain
- ✅ PASSED: sys.stdout used directly
- ✅ PASSED: logs/ in .gitignore

All claims in summary are verified and accurate.
