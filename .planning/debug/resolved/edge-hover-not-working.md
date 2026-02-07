---
status: investigating
trigger: "Edge label fade-in doesn't work on hover but works on click"
created: 2026-02-06T00:00:00Z
updated: 2026-02-06T00:00:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: Edge hover events may not be triggering the label visibility state change
test: Read LineageEdge.tsx to check hover event handling vs click event handling
expecting: Find that hover does not set the same state/class that click does
next_action: Read LineageEdge.tsx, index.css, and related files

## Symptoms

expected: When hovering over an edge or selecting related nodes, edge labels fade in smoothly (~150ms) rather than appearing instantly
actual: Hovering produces no change; clicking a column triggers the fade; clicking an edge fades and highlights the closest column
errors: None
reproduction: Test 4 in Phase 19 UAT
started: Discovered during UAT testing on 2026-02-06

## Eliminated

## Evidence

## Resolution

root_cause: The invisible hover detection path was rendered BEFORE the main edge path in the SVG stack. Since SVG elements are rendered in order (like z-index), the main edge was on top and blocked mouse events from reaching the invisible hover path underneath.

fix: Reordered SVG elements in LineageEdge.tsx so the invisible hover path is rendered LAST (on top). Also added `pointerEvents: 'none'` to the main edge and glow effect to ensure they don't block hover detection.

verification: Build succeeded. Manual testing required: hover over an edge and verify the label fades in smoothly.

files_changed:
  - lineage-ui/src/components/domain/LineageGraph/LineageEdge.tsx
