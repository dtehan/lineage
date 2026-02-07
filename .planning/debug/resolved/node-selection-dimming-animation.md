---
status: investigating
trigger: "Node selection doesn't trigger dimming animation but column selection does"
created: 2026-02-06T00:00:00Z
updated: 2026-02-06T00:00:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: Node-level selection may not set the same highlight state that column-level selection uses, so the dimming logic never activates for node clicks
test: Read highlight hook and selection handlers to compare node vs column selection paths
expecting: Different state updates for node click vs column click
next_action: Read TableNode.tsx, ColumnRow.tsx, useLineageHighlight hook, and lineage store

## Symptoms

expected: When selecting a node, unrelated nodes dim smoothly with a fade transition (~200ms)
actual: Dimming works when selecting a column within a node, but NOT when selecting a node itself
errors: None
reproduction: Click a node (table card) - no dimming. Click a column row - dimming occurs.
started: Discovered during Phase 19 UAT testing on 2026-02-06

## Eliminated

## Evidence

## Resolution

root_cause: The onNodeClick handler in LineageGraph.tsx explicitly ignores tableNode clicks (line 278), so clicking a table node doesn't set selectedAssetId. Only column clicks trigger selectedAssetId, which is what activates the dimming animation via highlightPath logic.

fix: Added onNodeClick callback to TableNodeHeader and TableNode that selects the first column when the table header is clicked. This triggers the same highlight/dimming logic as clicking a column.

verification: Build succeeded. Manual testing required: click a table node header and verify unrelated nodes dim with smooth fade animation.

files_changed:
  - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNodeHeader.tsx
  - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx
