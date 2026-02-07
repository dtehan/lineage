---
status: investigating
trigger: "Detail panel opens on column click but not on node click"
created: 2026-02-06T00:00:00Z
updated: 2026-02-06T00:00:00Z
---

## Current Focus

hypothesis: Node click handler does not set state that triggers panel open
test: Read TableNode click handler and compare column vs node click paths
expecting: Find missing or different state update for node clicks
next_action: Read TableNode component, DetailPanel, and store code

## Symptoms

expected: Clicking a node or column opens the detail panel with slide animation
actual: Clicking a column opens the panel; clicking a node does NOT open the panel
errors: None reported
reproduction: Click on a table node header in the lineage graph - panel does not open
started: Discovered during Phase 19 UAT testing on 2026-02-06

## Eliminated

## Evidence

## Resolution

root_cause: Same as node-selection-dimming-animation issue. The detail panel opens via a useEffect that watches selectedAssetId (LineageGraph.tsx:254-271). Since table node clicks didn't set selectedAssetId, the panel never opened.

fix: Fixed by adding onNodeClick handler to table nodes (see node-selection-dimming-animation resolution). When a table header is clicked, it selects the first column, which triggers the useEffect and opens the panel.

verification: Build succeeded. Manual testing required: click a table node header and verify detail panel slides in from right.

files_changed:
  - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNodeHeader.tsx
  - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx
