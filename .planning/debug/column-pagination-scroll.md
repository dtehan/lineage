---
status: diagnosed
trigger: "Column pagination scroll position issue - when clicking Next, user has to manually scroll to find the table"
created: 2026-01-31T00:00:00Z
updated: 2026-01-31T00:05:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED - No scroll behavior implemented when fieldOffset changes
test: Code analysis of DatasetItem component complete
expecting: Root cause documented, ready to update UAT.md
next_action: Return diagnosis to orchestrator

## Symptoms

expected: When clicking Next on column pagination, the column list shows next 100 columns AND view scrolls to keep table at top of viewport
actual: Next set of columns appears but user must manually scroll to find the table again
errors: None reported
reproduction:
1. Open a dataset with >100 columns in AssetBrowser
2. Scroll down to see pagination controls
3. Click Next button
4. Observe: columns change but viewport stays scrolled down
started: Phase 10 implementation - always present (feature never implemented)

## Eliminated

## Evidence

- timestamp: 2026-01-31T00:01:00Z
  checked: AssetBrowser.tsx DatasetItem component (lines 274-379)
  found: Pagination control at line 365-374 calls `onPageChange={setFieldOffset}` which only updates state, no scroll logic
  implication: When fieldOffset changes, React re-renders with new paginatedFields but viewport position is unchanged

- timestamp: 2026-01-31T00:02:00Z
  checked: DatasetItem useEffect hooks
  found: Only one useEffect at lines 289-291, resets fieldOffset to 0 when dataset.id changes. No useEffect watching fieldOffset changes.
  implication: No side effects are triggered when user clicks Next/Previous pagination buttons

- timestamp: 2026-01-31T00:03:00Z
  checked: DOM structure and component hierarchy
  found: DatasetItem renders as `<li>` element (line 315), contains dataset header (line 316-335), column list (line 338-363), and pagination (line 365-374). No ref assigned to the dataset item element.
  implication: Even if we wanted to scroll to the dataset, there's no ref to target with scrollIntoView()

- timestamp: 2026-01-31T00:04:00Z
  checked: AssetBrowser outer container
  found: Root div at line 136 has `className="h-full overflow-auto"` - this is the scroll container
  implication: Need to either scroll this container to the dataset item, or scroll the dataset item itself into view

## Resolution

root_cause: No scroll behavior is implemented when column pagination state (fieldOffset) changes. When the user clicks Next on column pagination, React re-renders the column list with new data but the browser viewport remains at its current scroll position. The user must manually scroll up to see the dataset header and the new set of columns. This is a missing feature - there is no useEffect hook or callback to trigger scrollIntoView() or scrollTo() when fieldOffset changes.
fix: Add a useEffect hook in DatasetItem that watches fieldOffset changes and scrolls the dataset item into view. Requires adding a ref to the dataset item's outer <li> element and calling ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' }) when fieldOffset changes (excluding initial mount).
verification:
files_changed:
  - lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx
