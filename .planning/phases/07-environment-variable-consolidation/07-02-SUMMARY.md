---
phase: 07
plan: 02
subsystem: configuration
tags: [go, viper, environment-variables, backwards-compatibility]

dependency-graph:
  requires: [07-01]
  provides: [go-legacy-fallback-config]
  affects: [07-03]

tech-stack:
  added: []
  patterns: [legacy-fallback-binding]

key-files:
  created: []
  modified:
    - lineage-api/internal/infrastructure/config/config.go

decisions:
  - id: 07-02-01
    choice: "bindLegacyFallback helper function for conditional env var binding"
    reason: "Clean separation of fallback logic, reusable for all variable pairs"
  - id: 07-02-02
    choice: "Check primary empty AND legacy non-empty before binding"
    reason: "Only use legacy when primary is truly unset, not when primary is empty string"
  - id: 07-02-03
    choice: "Place fallback bindings after defaults, before Config struct assignment"
    reason: "Ensures defaults are set before fallback logic runs, and fallbacks applied before values read"

metrics:
  duration: 1 min
  completed: 2026-01-30
---

# Phase 7 Plan 2: Go Server Legacy Fallback Support Summary

Go server config now accepts TD_* and PORT as legacy fallbacks with API_PORT as primary.

## What Changed

### Files Modified

**lineage-api/internal/infrastructure/config/config.go**
- Added `bindLegacyFallback` helper function that conditionally binds legacy env var to primary
- Changed port default from PORT to API_PORT
- Added 6 legacy fallback bindings: TD_HOST, TD_USER, TD_PASSWORD, TD_DATABASE, TD_PORT, PORT
- Updated Config struct to read from API_PORT

## Technical Details

### bindLegacyFallback Function

```go
func bindLegacyFallback(primary, legacy string) {
    if os.Getenv(primary) == "" && os.Getenv(legacy) != "" {
        viper.BindEnv(primary, legacy)
    }
}
```

This function:
1. Checks if primary env var is unset (empty string)
2. Checks if legacy env var IS set (non-empty)
3. If both conditions met, binds legacy value to primary key in Viper

### Legacy Fallback Mappings

| Primary Variable | Legacy Fallback |
|-----------------|-----------------|
| TERADATA_HOST | TD_HOST |
| TERADATA_USER | TD_USER |
| TERADATA_PASSWORD | TD_PASSWORD |
| TERADATA_DATABASE | TD_DATABASE |
| TERADATA_PORT | TD_PORT |
| API_PORT | PORT |

### Backwards Compatibility

Existing deployments using TD_* or PORT variables will continue to work:
- If only TD_HOST is set, it becomes TERADATA_HOST
- If both TERADATA_HOST and TD_HOST are set, TERADATA_HOST takes precedence
- If only PORT is set, it becomes API_PORT
- If both API_PORT and PORT are set, API_PORT takes precedence

## Verification Results

- Go package builds successfully: `go build ./internal/infrastructure/config/`
- Full API builds successfully: `go build ./...`
- No test files exist for config package (expected - config is integration-tested)
- API_PORT appears 3 times in config.go (default, fallback binding, GetString)
- bindLegacyFallback appears 8 times (function definition, doc comment, 6 calls)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| dffe1f2 | feat | add bindLegacyFallback helper function |
| a519451 | feat | integrate legacy fallbacks and API_PORT |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **bindLegacyFallback helper function** - Clean separation of fallback logic that is reusable for all variable pairs
2. **Check primary empty AND legacy non-empty** - Only use legacy when primary is truly unset
3. **Fallback bindings placed after defaults** - Ensures proper Viper initialization order

## Next Phase Readiness

Ready to proceed with 07-03: documentation updates. The Go server now supports:
- TERADATA_* as primary variables
- TD_* as legacy fallbacks
- API_PORT as primary port variable
- PORT as legacy port fallback
