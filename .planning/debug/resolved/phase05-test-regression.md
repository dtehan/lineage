---
status: resolved
trigger: "Test Files 6 failed | 29 passed (35), Tests 35 failed | 540 passed (575). 2 fewer passing tests than baseline (540 vs 542)"
created: 2026-02-16T00:00:00Z
updated: 2026-02-16T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED - Test regression was caused by commit 04365d9 (Feb 7), not Phase 05 changes
test: Root cause found - test has wrong prop name after refactor
expecting: N/A - diagnosis complete
next_action: Update UAT.md with findings

## Symptoms

expected: All 542 tests passing (Phase 05 baseline)
actual: 540 tests passing, 34 failing (1 test regressed - not 2!)
errors: DetailPanel test "resets to Columns tab when selectedColumn changes" - Unable to find accessible element with role "tab" and name `/columns/i`
reproduction: Run npm test in lineage-ui directory
started: After Phase 05 changes (Worker, Profiler, CSS changes)

## Eliminated

## Evidence

- timestamp: 2026-02-16T00:01:00Z
  checked: npm test output
  found: 34 failed tests (not 35 as reported), 541 passing (not 540). Report said "2 fewer passing" but baseline was 542, current is 541 = 1 regression
  implication: Only 1 test regressed, not 2. Need to identify which test was passing before Phase 05 but is now failing

- timestamp: 2026-02-16T00:02:00Z
  checked: Test failure details
  found: DetailPanel test failing - "Unable to find an accessible element with the role 'tab' and name `/columns/i`". Panel shows "Edge details" dialog with "No item selected" message, but no tabs rendered
  implication: Test expects tab navigation but tabs are not being rendered. Possibly related to conditional rendering or CSS changes hiding the tabs

- timestamp: 2026-02-16T00:03:00Z
  checked: DetailPanel test code (line 952)
  found: Test has typo - passes `selectedColumn={newColumn}` (singular) instead of `selectedColumns={[newColumn]}` (plural array)
  implication: Because wrong prop name is passed, component receives undefined/empty selectedColumns array, so it shows "No item selected" and doesn't render tabs. This is a PRE-EXISTING bug in the test, NOT a Phase 05 regression!

- timestamp: 2026-02-16T00:04:00Z
  checked: Git history for DetailPanel.tsx and DetailPanel.test.tsx
  found: Neither file was modified during Phase 05. Last changes were in earlier phases (19, 21, 22)
  implication: If the code didn't change, this test was likely already failing in the baseline. Need to verify if this test was in the 33 baseline failures

- timestamp: 2026-02-16T00:05:00Z
  checked: Git commit 04365d9 "fix(19): show table details when clicking table node" (Feb 7, 2026)
  found: This commit changed DetailPanel props from `selectedColumn` (singular) to `selectedColumns` (array). Commit message says "Updated test file to use selectedColumns array" but TC-PANEL-07 test's rerender (line 952) still uses old `selectedColumn` prop name
  implication: This is an incomplete refactor - the test's initial render was updated but the rerender inside TC-PANEL-07 was missed

- timestamp: 2026-02-16T00:06:00Z
  checked: Chronology - Phase 05 UAT (Jan 29) vs commit 04365d9 (Feb 7) vs current UAT (Feb 16)
  found: Commit 04365d9 happened AFTER Phase 05 was originally completed, but BEFORE the current UAT re-run
  implication: Phase 05 did NOT cause this regression. Commit 04365d9 broke the test. This is NOT a Phase 05 issue!

- timestamp: 2026-02-16T00:07:00Z
  checked: Applied fix and ran full test suite
  found: Tests now show 32 failed / 543 passed (575 total). DetailPanel.test.tsx shows all 50 tests passing.
  implication: Fix confirmed. 543 passing is 1 MORE than baseline 542, proving Phase 05 introduced no regressions. The "2 fewer passing tests" was entirely due to commit 04365d9's incomplete refactor.

## Resolution

root_cause: Commit 04365d9 (Feb 7, 2026) "fix(19): show table details when clicking table node" changed DetailPanel props from `selectedColumn` to `selectedColumns` array. The refactor updated most of DetailPanel.test.tsx but missed line 952 in TC-PANEL-07 test's rerender call, which still passes `selectedColumn={newColumn}` instead of `selectedColumns={[newColumn]}`. This causes the component to receive undefined/empty selectedColumns, triggering "No item selected" instead of rendering tabs. This regression occurred AFTER Phase 05 was completed (Jan 29) and is NOT caused by Phase 05 changes.
fix: Change line 952 in DetailPanel.test.tsx from `selectedColumn={newColumn}` to `selectedColumns={[newColumn]}`
verification: ✓ VERIFIED - Tests now show 32 failed / 543 passed (575 total). This is 1 MORE passing test than baseline (543 vs 542), confirming the fix resolved the regression and Phase 05 did not introduce any test failures.
files_changed: ["lineage-ui/src/components/domain/LineageGraph/DetailPanel.test.tsx"]
