# Phase 1: Draggable Minimap Viewport - Research

**Researched:** 2026-02-21
**Domain:** React Flow (@xyflow/react) MiniMap interactivity — pannable/zoomable viewport
**Confidence:** HIGH

## Summary

The lineage app already has a working MiniMap component rendered in three graph components (`LineageGraph.tsx`, `DatabaseLineageGraph.tsx`, `AllDatabasesLineageGraph.tsx`). The MiniMap is toggled on/off via a button, and when visible it renders a static overview of the graph. Users cannot currently interact with the minimap viewport indicator to navigate the graph.

The critical finding is that **@xyflow/react 12.10.0 (installed) already ships built-in `pannable` and `zoomable` props on `<MiniMap />`**. These are opt-in (default `false`). Enabling `pannable={true}` allows users to drag the viewport indicator in the minimap to pan the main graph canvas. Enabling `zoomable={true}` allows scroll-to-zoom on the minimap. No additional libraries are needed — this is a pure prop addition.

The implementation scope is minimal: add `pannable={true}` (and optionally `zoomable={true}`) to all three `<MiniMap />` usages, optionally enhance the mask/viewport indicator styling to signal interactivity, and update or add tests. There is no backend involvement.

**Primary recommendation:** Add `pannable={true}` and `zoomable={true}` to all three `<MiniMap />` instances. Optionally add `maskStrokeColor` and `maskStrokeWidth` to visually distinguish the draggable viewport region. No new libraries, no custom drag logic needed.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | 12.10.0 (installed) | React Flow — provides `<MiniMap />` with built-in pannable/zoomable | Already installed, MiniMap ships with all interactivity needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.300.0 (installed) | Icon for minimap toggle button | Already used for Map, ChevronUp, ChevronDown icons |
| Tailwind CSS | ^3.4.0 (installed) | Styling for minimap container/button | Already used throughout the codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in `pannable` prop | Custom drag handler on SVG | Built-in is correct — handles coordinate transforms, zoom state, translate extent. Custom is unnecessary complexity. |
| Built-in `zoomable` prop | Custom wheel handler | Same — built-in integrates with React Flow's internal panZoom instance. |

**Installation:**
```bash
# No new packages needed — @xyflow/react already installed at 12.10.0
```

## Architecture Patterns

### Recommended Project Structure

No new files needed. Changes are confined to existing files:

```
lineage-ui/src/components/domain/LineageGraph/
├── LineageGraph.tsx            # Add pannable/zoomable to <MiniMap />
├── DatabaseLineageGraph.tsx    # Add pannable/zoomable to <MiniMap />
├── AllDatabasesLineageGraph.tsx # Add pannable/zoomable to <MiniMap />
├── LineageGraph.test.tsx       # Update/add minimap interaction tests
├── DatabaseLineageGraph.test.tsx # Update/add minimap interaction tests
└── AllDatabasesLineageGraph.test.tsx # Update/add minimap interaction tests
```

### Pattern 1: MiniMap pannable prop

**What:** Set `pannable={true}` on `<MiniMap />` inside `<ReactFlow>`. When the user drags the viewport mask (the lighter rectangular region), it pans the main canvas in real time. The XYMinimap internal instance handles coordinate translation via the stored `panZoom` reference.

**When to use:** Always — this is the core feature of this phase.

**Example:**
```tsx
// Source: Verified from @xyflow/react 12.10.0 source at
// node_modules/@xyflow/react/dist/esm/additional-components/MiniMap/types.d.ts
{showMinimap && (
  <MiniMap
    pannable={true}
    zoomable={true}
    nodeColor={(node) => '#94a3b8'}
    maskColor="rgba(0, 0, 0, 0.1)"
    maskStrokeColor="#3b82f6"
    maskStrokeWidth={2}
    style={{ bottom: 56 }}
  />
)}
```

### Pattern 2: inversePan for natural pan direction

**What:** The `inversePan` prop (boolean) reverses the pan direction. Without it, dragging the viewport indicator in the minimap moves the canvas in the same direction as the drag. With `inversePan={true}`, dragging right pans the canvas left (like dragging a map). This is a UX preference.

**When to use:** Evaluate during implementation — test with real users. Default (`inversePan` omitted, which is `false`) is typical for most tools. Leave it out initially.

**Example:**
```tsx
// inversePan not recommended by default — omit unless user feedback requests it
<MiniMap pannable={true} zoomable={true} />
```

### Pattern 3: Visual hint on the viewport indicator

**What:** The viewport indicator (mask) in the minimap is the "hole" in the `react-flow__minimap-mask` SVG path. Currently rendered with `maskColor="rgba(0, 0, 0, 0.1)"`. To signal draggability, add a visible stroke border around the viewport indicator using `maskStrokeColor` and `maskStrokeWidth`. Adding a CSS `cursor: grab` on the minimap SVG when `pannable` is true would complete the hint.

**When to use:** Always when enabling `pannable={true}` — important accessibility/UX signal.

**Example:**
```tsx
<MiniMap
  pannable={true}
  zoomable={true}
  maskColor="rgba(0, 0, 0, 0.08)"
  maskStrokeColor="#3b82f6"
  maskStrokeWidth={2}
  style={{ bottom: 56 }}
  className="react-flow__minimap--pannable"
/>
```
```css
/* In global CSS or via Tailwind's arbitrary class */
.react-flow__minimap--pannable .react-flow__minimap-svg {
  cursor: grab;
}
.react-flow__minimap--pannable .react-flow__minimap-svg:active {
  cursor: grabbing;
}
```

**Note:** The `maskStrokeWidth` prop value is multiplied by `viewScale` internally (verified in the source). A value of `2` renders as approximately `2 * viewScale` pixels on the minimap SVG. For typical graph sizes, `1` or `2` works well visually.

### Pattern 4: zoomStep for scroll-to-zoom

**What:** The `zoomStep` prop controls how many zoom levels change per scroll tick on the minimap. Default is `1` (per the built source; the types.d.ts says `10` but the implementation shows `zoomStep = 1`).

**When to use:** Leave at default unless users find scroll-zoom too slow/fast.

### Anti-Patterns to Avoid

- **Implementing custom drag logic on the minimap SVG:** React Flow already handles this via the internal `XYMinimap` instance and `panZoom`. Custom drag would conflict with React Flow's transform state and cause desynced viewports.
- **Using `onClick` to jump to position instead of drag:** The `onClick` prop exists for click-to-navigate, but this phase is about dragging, not clicking. Both can coexist but don't confuse them.
- **Adding `pannable` without visual indication:** Users won't know the minimap is interactive unless the cursor changes and the viewport indicator has a distinct border.
- **Putting the MiniMap outside `<ReactFlow>`:** The `<MiniMap />` uses `useStoreApi()` and `useStore()` internally and must be a child of the ReactFlow component.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Viewport dragging in minimap | Custom SVG mousemove/mousedown handlers + React Flow transform sync | `pannable={true}` prop on `<MiniMap />` | Built-in integrates with React Flow's internal `XYMinimap` and `panZoom` instance — handles coordinate transforms, translate extent clamping, and viewport state sync automatically |
| Scroll-to-zoom on minimap | Custom wheel event handler + `setViewport` calls | `zoomable={true}` prop on `<MiniMap />` | Same internal integration — avoids zoom desyncing between minimap and main canvas |
| Viewport position indicator | Custom overlay div tracking viewport coordinates | The existing `react-flow__minimap-mask` SVG path | React Flow already renders the viewport indicator as an SVG cutout |

**Key insight:** The `pannable`/`zoomable` features were specifically added to `@xyflow/react` to solve the coordination problem between minimap interactions and the main canvas transform. Any custom implementation would need to replicate the `XYMinimap` coordinate mapping (SVG pointer → flow coordinates) and the `panZoom.setViewport` calls — this is non-trivial and already done correctly by the library.

## Common Pitfalls

### Pitfall 1: maskStrokeWidth Scale Confusion

**What goes wrong:** Setting `maskStrokeWidth={10}` expecting a 10px border, but the stroke appears much thicker because the value is multiplied by `viewScale` internally.

**Why it happens:** The minimap renders in SVG viewBox coordinates that are scaled relative to the full graph bounding box. A value of `1` or `2` is usually correct.

**How to avoid:** Set `maskStrokeWidth` to small values (1–3) and test visually. Check the source: `maskStrokeWidth-props: typeof maskStrokeWidth === 'number' ? maskStrokeWidth * viewScale : undefined`.

**Warning signs:** The stroke looks excessively thick or obscures the viewport area.

### Pitfall 2: Three Files to Update (Code Duplication)

**What goes wrong:** Only updating `LineageGraph.tsx` and forgetting `DatabaseLineageGraph.tsx` and `AllDatabasesLineageGraph.tsx`. Each graph component has its own independent `<MiniMap />` instance.

**Why it happens:** The three graph components are separate and not sharing a minimap sub-component. The `showMinimap` state is local to each component.

**How to avoid:** Search for `<MiniMap` in the codebase to find all instances. Currently three: `LineageGraph.tsx:810`, `DatabaseLineageGraph.tsx:498`, `AllDatabasesLineageGraph.tsx:631`.

**Warning signs:** Minimap works in column lineage but not database lineage view.

### Pitfall 3: No Cursor Feedback

**What goes wrong:** `pannable={true}` is set but no cursor change occurs on hover, making the feature invisible to users.

**Why it happens:** React Flow does not automatically set `cursor: grab` on the minimap SVG when `pannable` is true (verified in built source — no cursor style added in `MiniMapComponent`).

**How to avoid:** Add CSS cursor styling either via Tailwind's `[&_.react-flow__minimap-svg]:cursor-grab` or a custom CSS class on the minimap.

**Warning signs:** Users don't discover the draggable minimap through organic exploration.

### Pitfall 4: zoomStep Default Discrepancy

**What goes wrong:** The TypeScript type declares `zoomStep` default as `10`, but the actual implementation default is `1`. This matters if you were planning to test zoom-step behavior.

**Why it happens:** Type definition and implementation are out of sync in this library version.

**How to avoid:** Don't rely on type-declared defaults — check the runtime source. For `zoomStep`, the implementation is: `zoomStep = 1`.

**Warning signs:** Zoom behavior doesn't match documentation expectations.

## Code Examples

Verified patterns from official sources (installed library source):

### Enabling Pannable and Zoomable MiniMap
```tsx
// Source: Verified from @xyflow/react 12.10.0
// node_modules/@xyflow/react/dist/esm/additional-components/MiniMap/types.d.ts
// Applies to all three graph components

{showMinimap && (
  <MiniMap
    pannable={true}
    zoomable={true}
    nodeColor={(node) => '#94a3b8'}
    maskColor="rgba(0, 0, 0, 0.08)"
    maskStrokeColor="#3b82f6"
    maskStrokeWidth={1}
    style={{ bottom: 56 }}
  />
)}
```

### MiniMapProps Type Reference
```typescript
// Source: @xyflow/react/dist/esm/additional-components/MiniMap/types.d.ts (v12.10.0)
type MiniMapProps<NodeType extends Node = Node> = {
  pannable?: boolean;      // default false — drag viewport indicator to pan
  zoomable?: boolean;      // default false — scroll to zoom
  inversePan?: boolean;    // default false — invert pan direction
  zoomStep?: number;       // default 1 (despite type saying 10)
  offsetScale?: number;    // default 5 — padding around bounding box
  maskColor?: string;      // default "rgba(240, 240, 240, 0.6)"
  maskStrokeColor?: string; // default "transparent"
  maskStrokeWidth?: number; // default 1 (multiplied by viewScale internally)
  // ... other props
}
```

### Full MiniMap Component Signature (from installed library source)
```typescript
// Source: @xyflow/react 12.10.0 MiniMapComponent implementation
function MiniMapComponent({
  pannable = false,    // enables drag-to-pan
  zoomable = false,    // enables scroll-to-zoom
  inversePan,          // inverts pan direction when true
  zoomStep = 1,        // zoom increment per scroll tick
  offsetScale = 5,     // viewport padding multiplier
  maskColor,           // viewport mask fill color
  maskStrokeColor,     // viewport border color
  maskStrokeWidth,     // viewport border width (pre-scaling)
  position = 'bottom-right',
  // ...
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `onClick` to jump viewport | `pannable` prop for drag-to-pan | @xyflow/react v11+ | No custom code needed for minimap navigation |
| Custom SVG drag handlers | Built-in XYMinimap interactivity | Integrated in xy-minimap package | Correct coordinate transform handling |

**Deprecated/outdated:**
- Custom minimap implementations with separate SVG + drag handlers: replaced by `pannable`/`zoomable` props in the current version.

## Open Questions

1. **Should minimap default to `showMinimap = true`?**
   - What we know: Currently all three components start with `showMinimap = false`. Users must click the toggle to see the minimap.
   - What's unclear: Whether the phase goal includes making the minimap visible by default (a UX decision).
   - Recommendation: Keep `showMinimap = false` as default since this is a UX preference decision. The planner can add this as a separate task if desired.

2. **Should a tooltip hint "Drag to navigate" appear on the minimap?**
   - What we know: No tooltip infrastructure exists on the minimap toggle. A tooltip is technically feasible using the existing `Tooltip` component in `common/`.
   - What's unclear: Whether this level of UX polish is in scope for this phase.
   - Recommendation: Treat as optional/stretch goal. The cursor change (`grab`) provides sufficient signal.

3. **Should the three MiniMap usages be extracted into a shared component?**
   - What we know: All three graph files have nearly identical minimap JSX. Refactoring to a shared `<LineageMiniMap />` wrapper would reduce duplication.
   - What's unclear: Whether the phase includes this refactor or just the prop addition.
   - Recommendation: The planner should include a refactor task. The three-file duplication is a maintenance risk, and this phase is the natural time to fix it.

## Sources

### Primary (HIGH confidence)
- `node_modules/@xyflow/react/dist/esm/additional-components/MiniMap/types.d.ts` — MiniMapProps TypeScript interface, all prop defaults documented
- `node_modules/@xyflow/react/dist/esm/index.js` — MiniMapComponent runtime implementation, pannable/zoomable/inversePan/zoomStep behavior verified in built code
- `node_modules/@xyflow/react/dist/base.css` — CSS variables and classes for minimap styling (`--xy-minimap-mask-stroke-color-props`, etc.)
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` — Current MiniMap usage (line 809–827), showMinimap state pattern
- `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — Second MiniMap instance (line 497–503)
- `lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` — Third MiniMap instance (line 630–636)

### Secondary (MEDIUM confidence)
- `lineage-ui/package.json` — Confirmed @xyflow/react `^12.0.0` is the declared version
- `lineage-ui/node_modules/@xyflow/react/package.json` — Confirmed installed version is `12.10.0`

### Tertiary (LOW confidence)
- None required — primary sources from installed library are sufficient.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from installed library source, no ambiguity
- Architecture: HIGH — all three MiniMap instances located and inspected
- Pitfalls: HIGH — verified from runtime source (not just types)

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable library; `@xyflow/react` v12 has been stable; no breaking changes expected)
