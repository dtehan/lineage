# Lineage Graph Visualization Specification

## Overview

This specification defines the visual design and interaction patterns for the column-level lineage graph component. It complements `lineage_plan_frontend.md` with detailed visualization requirements based on industry research.

---

## Design Decisions Summary

| Decision | Choice |
|----------|--------|
| Column display in table nodes | Always expanded |
| Path highlighting on selection | Dim unrelated nodes to 20% opacity |
| Edge transformation types | Direct, Derived, Aggregated, Joined |
| Default/max depth | 3 / 10 |
| Detail panel | Slide-out panel on click |
| Direction control | Dropdown menu |
| Toolbar controls | Depth slider, Fit to view, Export, Fullscreen |
| Dual view | Graph + Table tabs |
| Edge routing | Bezier curves |
| Edge animation | On hover/selection only |
| Data type display | Always visible in column rows |
| SQL display in panel | Full SQL with scroll |
| Confidence visualization | Edge color fades as confidence decreases |
| Graph search | Search with autocomplete |
| Visual grouping | Cluster tables by database |

---

## 1. Table Node Component

### 1.1 Structure

Table nodes display as expandable cards showing all columns by default.

```
┌─────────────────────────────────────┐
│ ○ database_name.table_name      [▼] │  ← Header with expand/collapse
├─────────────────────────────────────┤
│ ● column_1          VARCHAR(100)    │  ← Column row with handles
│ ● column_2          INTEGER         │
│ ● column_3          TIMESTAMP       │
│ ● column_4          DECIMAL(18,2)   │
└─────────────────────────────────────┘
```

### 1.2 Visual Specifications

| Element | Specification |
|---------|---------------|
| Node width | 280px minimum, auto-expand for long names |
| Header height | 40px |
| Column row height | 28px |
| Border radius | 8px |
| Border | 2px solid |
| Shadow | 0 2px 4px rgba(0,0,0,0.1) |

### 1.3 Color Scheme

| State | Background | Border |
|-------|------------|--------|
| Default | `#FFFFFF` | `#E2E8F0` (slate-200) |
| Hovered | `#F8FAFC` | `#CBD5E1` (slate-300) |
| Selected | `#EFF6FF` | `#3B82F6` (blue-500) |
| Highlighted (in path) | `#F0FDF4` | `#22C55E` (green-500) |
| Dimmed | `#FFFFFF` @ 20% opacity | `#E2E8F0` @ 20% opacity |

### 1.4 Column Row Design

Each column row contains:
- **Left handle** (target): 8px circle, positioned at vertical center
- **Column name**: 14px font, semibold, `#1E293B` (slate-800)
- **Data type**: 12px font, regular, `#64748B` (slate-500), right-aligned
- **Right handle** (source): 8px circle, positioned at vertical center

### 1.5 TypeScript Interface

```typescript
interface TableNodeData {
  id: string;
  databaseName: string;
  tableName: string;
  columns: ColumnDefinition[];
  isExpanded: boolean;
  assetType: 'table' | 'view' | 'materialized_view';
}

interface ColumnDefinition {
  id: string;
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  hasUpstreamLineage: boolean;
  hasDownstreamLineage: boolean;
}
```

---

## 2. Edge (Connection) Design

### 2.1 Edge Types and Colors

| Transformation Type | Color | Description |
|---------------------|-------|-------------|
| Direct | `#22C55E` (green-500) | Column passed through unchanged |
| Derived | `#3B82F6` (blue-500) | Calculated or transformed column |
| Aggregated | `#A855F7` (purple-500) | Result of aggregation (SUM, COUNT, etc.) |
| Joined | `#06B6D4` (cyan-500) | Combines data from multiple sources |
| Unknown | `#9CA3AF` (gray-400) | Transformation type not determined |

### 2.2 Edge Visual Specifications

| Property | Value |
|----------|-------|
| Type | Bezier curve |
| Stroke width | 2px default, 3px on hover |
| Marker end | Arrowhead, 8px |
| Animation | Dashed flow on hover/selection |

### 2.3 Edge States

| State | Style |
|-------|-------|
| Default | Solid line, type color |
| Hovered | 3px stroke, animated dashes |
| Selected | 3px stroke, animated dashes, glow effect |
| In highlighted path | Full opacity, animated |
| Dimmed | 10% opacity |

### 2.4 Confidence-Based Color Fade

Edge colors fade in saturation as confidence decreases. This provides immediate visual feedback on lineage certainty.

| Confidence Range | Saturation | Opacity |
|------------------|------------|---------|
| 90-100% | 100% | 1.0 |
| 70-89% | 75% | 0.9 |
| 50-69% | 50% | 0.8 |
| Below 50% | 25% | 0.7 |

```typescript
function getEdgeStyleByConfidence(
  baseColor: string,
  confidence: number
): { color: string; opacity: number } {
  // Convert HSL saturation based on confidence
  const saturationMultiplier = confidence >= 90 ? 1.0
    : confidence >= 70 ? 0.75
    : confidence >= 50 ? 0.50
    : 0.25;

  const opacity = confidence >= 90 ? 1.0
    : confidence >= 70 ? 0.9
    : confidence >= 50 ? 0.8
    : 0.7;

  return {
    color: adjustSaturation(baseColor, saturationMultiplier),
    opacity,
  };
}
```

### 2.5 Edge Label (optional)

When edge is hovered or selected, show transformation type label at midpoint:

```typescript
interface EdgeData {
  id: string;
  sourceColumnId: string;
  targetColumnId: string;
  transformationType: 'direct' | 'derived' | 'aggregated' | 'joined' | 'unknown';
  confidenceScore?: number;
  transformationSql?: string;
}
```

---

## 3. Path Highlighting Behavior

### 3.1 On Node/Column Selection

When a column is selected:
1. Find all upstream nodes recursively
2. Find all downstream nodes recursively
3. Set connected nodes/edges to full opacity
4. Dim all unconnected nodes/edges to 20% opacity
5. Animate edges in the connected path

### 3.2 Implementation

```typescript
// Recursive traversal functions
function getUpstreamNodes(columnId: string, edges: Edge[]): Set<string>;
function getDownstreamNodes(columnId: string, edges: Edge[]): Set<string>;

// Highlighting hook
function useLineageHighlight() {
  const highlightPath = useCallback((selectedColumnId: string) => {
    const upstream = getUpstreamNodes(selectedColumnId, edges);
    const downstream = getDownstreamNodes(selectedColumnId, edges);
    const connected = new Set([selectedColumnId, ...upstream, ...downstream]);

    setNodes(nodes => nodes.map(node => ({
      ...node,
      style: { opacity: connected.has(node.id) ? 1 : 0.2 }
    })));

    setEdges(edges => edges.map(edge => ({
      ...edge,
      animated: connected.has(edge.source) && connected.has(edge.target),
      style: {
        opacity: connected.has(edge.source) && connected.has(edge.target) ? 1 : 0.1
      }
    })));
  }, [edges, setNodes, setEdges]);

  return { highlightPath, clearHighlight };
}
```

### 3.3 Clear Highlight

Clicking on canvas background clears all highlighting and returns graph to default state.

---

## 4. Detail Panel

### 4.1 Structure

Slide-out panel from right side, 400px width.

```
┌──────────────────────────────────────┐
│ ✕  Column Details                    │
├──────────────────────────────────────┤
│ database.table.column                │
│                                      │
│ ─── Metadata ────────────────────    │
│ Data Type:    VARCHAR(255)           │
│ Nullable:     Yes                    │
│ Primary Key:  No                     │
│ Description:  Customer email address │
│                                      │
│ ─── Lineage Stats ───────────────    │
│ Upstream:     5 columns              │
│ Downstream:   12 columns             │
│ Depth:        3 levels               │
│                                      │
│ ─── Transformation ──────────────    │
│ Type:         Derived                │
│ Confidence:   95%  ████████████░░    │
│                                      │
│ SQL:                                 │
│ ┌────────────────────────────────┐   │
│ │ SELECT                         │   │
│ │   UPPER(TRIM(src.email)) AS    │   │
│ │     customer_email,            │   │
│ │   src.first_name,              │   │
│ │   src.last_name                │   │
│ │ FROM raw.customers src         │   │
│ │ WHERE src.active = 1           │   │
│ │ ...                            │ ↕ │  ← Scrollable SQL viewer
│ └────────────────────────────────┘   │
│                                      │
│ [View Full Lineage] [Impact Analysis]│
└──────────────────────────────────────┘
```

### 4.2 Panel Content for Nodes

| Section | Content |
|---------|---------|
| Header | Full qualified name (db.table.column) |
| Metadata | Data type, nullable, PK/FK, description |
| Lineage Stats | Upstream/downstream counts, max depth |
| Actions | Links to full lineage view, impact analysis |

### 4.3 Panel Content for Edges

| Section | Content |
|---------|---------|
| Header | "Connection Details" |
| Source | Source column full name |
| Target | Target column full name |
| Transformation | Type, confidence score with progress bar |
| SQL | Full transformation SQL with syntax highlighting |
| Query | Link to source query in LIN_QUERY |

### 4.4 SQL Viewer Specifications

The SQL viewer displays the full transformation query with the following features:

| Property | Value |
|----------|-------|
| Max height | 200px (scrollable) |
| Font | Monospace, 13px |
| Background | `#1E293B` (slate-800) |
| Text color | `#E2E8F0` (slate-200) |
| Syntax highlighting | SQL keywords, strings, numbers |
| Line numbers | Yes, 40px gutter |
| Copy button | Top-right corner |

```typescript
interface SqlViewerProps {
  sql: string;
  maxHeight?: number;  // default: 200
  showLineNumbers?: boolean;  // default: true
  onCopy?: () => void;
}
```

---

## 5. Toolbar Controls

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Graph ▼] [Table]  │  🔍 Search columns...  │  Direction: [Both ▼]          │
│                    │                         │                                │
│ [⊡ Fit] [↓ Export] [⛶ Fullscreen]           │  Depth: ═══●═══ 3  [Legend ▼] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Control Specifications

| Control | Type | Options |
|---------|------|---------|
| View Toggle | Tab buttons | Graph, Table |
| Search | Text input + autocomplete | Search columns by name |
| Direction | Dropdown | Upstream, Downstream, Both |
| Depth | Slider | Range 1-10, default 3 |
| Fit to View | Button | Resets zoom/pan |
| Export | Button + Menu | PNG, SVG, JSON |
| Fullscreen | Button | Toggle fullscreen |
| Legend | Collapsible | Show/hide edge type legend |

### 5.3 Graph Search with Autocomplete

Search functionality allows users to quickly find and focus on specific columns within the graph.

**Behavior:**
1. As user types, autocomplete dropdown appears showing matching columns
2. Matches displayed as `database.table.column` with data type
3. Results sorted by relevance (exact match > starts with > contains)
4. Maximum 10 results shown at once
5. Keyboard navigation supported (↑/↓ to select, Enter to confirm)
6. On selection:
   - Graph pans and zooms to center the selected node
   - The column is selected (highlighted)
   - Path highlighting activates for that column

**Visual Design:**
```
┌──────────────────────────────────┐
│ 🔍 cust                          │
├──────────────────────────────────┤
│ ○ sales.customers.customer_id    │  INTEGER
│ ○ sales.customers.customer_name  │  VARCHAR
│ ○ sales.orders.customer_id       │  INTEGER
│ ○ analytics.cust_summary.cust_id │  INTEGER
└──────────────────────────────────┘
```

```typescript
interface GraphSearchProps {
  nodes: TableNodeData[];
  onSelect: (columnId: string) => void;
  maxResults?: number;  // default: 10
}

interface SearchResult {
  columnId: string;
  columnName: string;
  tableName: string;
  databaseName: string;
  dataType: string;
  matchScore: number;
}
```

### 5.4 Depth Slider Behavior

- Changing depth triggers API refetch with new `maxDepth` parameter
- Show loading indicator during fetch
- Preserve selected node after refetch
- Re-run layout algorithm with new nodes

---

## 6. Table View (Tabular Alternative)

### 6.1 Structure

Grid view showing lineage as sortable/filterable table.

| Source Column | Target Column | Type | Depth | Confidence |
|---------------|---------------|------|-------|------------|
| db1.table1.col_a | db2.table2.col_x | Direct | 1 | 100% |
| db1.table1.col_b | db2.table2.col_y | Derived | 1 | 95% |
| db2.table2.col_x | db3.table3.col_m | Aggregated | 2 | 90% |

### 6.2 Features

- **Sortable columns**: Click header to sort
- **Filterable**: Text search across all columns
- **Export**: CSV, Excel download
- **Pagination**: 50 rows per page default
- **Row click**: Highlights corresponding edge in graph view

### 6.3 Columns

| Column | Sortable | Filterable |
|--------|----------|------------|
| Source Column | Yes | Yes |
| Target Column | Yes | Yes |
| Transformation Type | Yes | Yes (dropdown) |
| Depth | Yes | Yes (range) |
| Confidence | Yes | Yes (range) |
| Query ID | No | Yes |

---

## 7. ELKjs Layout Configuration

### 7.1 Layout Options

```typescript
const elkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.portConstraints': 'FIXED_ORDER',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};
```

### 7.2 Port Configuration for Column Handles

```typescript
function createElkPorts(tableNode: TableNodeData): ElkPort[] {
  return tableNode.columns.flatMap((column, index) => [
    {
      id: `${tableNode.id}-${column.id}-target`,
      properties: {
        side: 'WEST',
        index: index,
      },
    },
    {
      id: `${tableNode.id}-${column.id}-source`,
      properties: {
        side: 'EAST',
        index: index,
      },
    },
  ]);
}
```

### 7.3 Dynamic Node Sizing

```typescript
function calculateNodeHeight(tableNode: TableNodeData): number {
  const headerHeight = 40;
  const columnRowHeight = 28;
  const padding = 16;
  return headerHeight + (tableNode.columns.length * columnRowHeight) + padding;
}
```

### 7.4 Visual Clustering by Database

Tables are visually grouped by their database, using background regions to show the grouping without restricting layout flexibility.

**Visual Design:**
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│  📁 sales_db                            │
│  ┌─────────────┐    ┌─────────────┐    │
│  │ customers   │───►│ orders      │    │
│  └─────────────┘    └─────────────┘    │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                           │
                           ▼
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│  📁 analytics_db                        │
│  ┌─────────────────────────────┐       │
│  │ customer_summary            │       │
│  └─────────────────────────────┘       │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**Implementation:**

1. **ELK Group Nodes**: Use ELK's hierarchical grouping to cluster tables by database
2. **Background Regions**: Render semi-transparent background behind each cluster
3. **Database Label**: Show database name in cluster header

```typescript
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': '[top=40,left=20,bottom=20,right=20]',
};

interface DatabaseCluster {
  id: string;
  databaseName: string;
  backgroundColor: string;
  tables: string[];  // Table node IDs
}

// Assign consistent colors to databases
const databaseColors: Record<string, string> = {
  sales_db: 'rgba(59, 130, 246, 0.08)',    // blue
  analytics_db: 'rgba(34, 197, 94, 0.08)', // green
  staging_db: 'rgba(168, 85, 247, 0.08)',  // purple
  raw_db: 'rgba(249, 115, 22, 0.08)',      // orange
};
```

**Cluster Rendering:**

```typescript
// Custom React Flow background component for clusters
interface ClusterBackgroundProps {
  clusters: DatabaseCluster[];
  nodeBounds: Map<string, { x: number; y: number; width: number; height: number }>;
}

function ClusterBackground({ clusters, nodeBounds }: ClusterBackgroundProps) {
  return (
    <>
      {clusters.map(cluster => {
        const bounds = calculateClusterBounds(cluster.tables, nodeBounds);
        return (
          <div
            key={cluster.id}
            className="cluster-background"
            style={{
              position: 'absolute',
              left: bounds.x - 20,
              top: bounds.y - 40,
              width: bounds.width + 40,
              height: bounds.height + 60,
              backgroundColor: cluster.backgroundColor,
              borderRadius: 12,
              border: '1px dashed rgba(0,0,0,0.1)',
            }}
          >
            <span className="cluster-label">{cluster.databaseName}</span>
          </div>
        );
      })}
    </>
  );
}
```

---

## 8. Performance Optimizations

### 8.1 Large Graph Handling

| Threshold | Optimization |
|-----------|--------------|
| > 50 nodes | Enable `onlyRenderVisibleElements` |
| > 100 nodes | Show warning, suggest reducing depth |
| > 200 edges | Simplify edge paths (reduce curve points) |

### 8.2 React Flow Configuration

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  onlyRenderVisibleElements={nodes.length > 50}
  minZoom={0.1}
  maxZoom={2}
  fitView
  fitViewOptions={{ padding: 0.2 }}
  defaultEdgeOptions={{
    type: 'default', // bezier
    animated: false,
  }}
/>
```

### 8.3 Memoization Requirements

- All custom node components must use `React.memo()`
- Node types object must be defined outside component
- Edge types object must be defined outside component
- Layout callback must use `useCallback`

---

## 9. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Clear selection, close panel, clear search |
| `F` | Fit to view |
| `+` / `-` | Zoom in / out |
| `Arrow keys` | Pan graph |
| `Tab` | Navigate between nodes |
| `Enter` | Select focused node |
| `Ctrl+E` | Export graph |
| `Ctrl+F` or `/` | Focus search input |
| `Ctrl+G` | Toggle database clusters |

---

## 10. Accessibility Requirements

### 10.1 ARIA Labels

- Graph container: `role="application"` with `aria-label="Lineage graph"`
- Nodes: `role="button"` with `aria-label` containing full column name
- Edges: `role="img"` with `aria-label` describing connection

### 10.2 Screen Reader Announcements

- On node focus: Announce column name, table, type, connection count
- On selection: Announce "Selected {column}, {n} upstream, {m} downstream"
- On path highlight: Announce "Highlighting lineage path with {n} nodes"

### 10.3 Color Contrast

All color combinations must meet WCAG AA contrast ratio (4.5:1 for text).

---

## 11. Component File Structure

```
src/components/domain/LineageGraph/
├── LineageGraph.tsx           # Main container component
├── LineageGraphToolbar.tsx    # Toolbar with controls
├── LineageGraphPanel.tsx      # Detail slide-out panel
├── LineageGraphSearch.tsx     # Search with autocomplete
├── ClusterBackground.tsx      # Database cluster backgrounds
├── SqlViewer.tsx              # SQL display with syntax highlighting
├── TableNode/
│   ├── TableNode.tsx          # Table node component
│   ├── TableNodeHeader.tsx    # Header with expand/collapse
│   ├── ColumnRow.tsx          # Individual column row
│   └── TableNode.css          # Styles
├── LineageEdge/
│   ├── LineageEdge.tsx        # Custom edge component
│   ├── EdgeLabel.tsx          # Edge label renderer
│   └── LineageEdge.css        # Styles
├── LineageTableView/
│   ├── LineageTableView.tsx   # Tabular view component
│   └── LineageTableColumns.tsx # Column definitions
├── hooks/
│   ├── useLineageHighlight.ts # Path highlighting logic
│   ├── useElkLayout.ts        # ELKjs layout hook
│   ├── useLineageExport.ts    # Export functionality
│   ├── useGraphSearch.ts      # Search and focus logic
│   └── useDatabaseClusters.ts # Cluster calculation hook
└── utils/
    ├── graphColors.ts         # Color constants
    ├── graphTraversal.ts      # Upstream/downstream functions
    ├── elkConfig.ts           # ELK layout configuration
    ├── confidenceStyles.ts    # Confidence-based styling
    └── searchUtils.ts         # Search scoring and filtering
```

---

## 12. Zustand Store Updates

Extend `useLineageStore` with visualization state:

```typescript
interface LineageVisualizationState {
  // View mode
  viewMode: 'graph' | 'table';
  setViewMode: (mode: 'graph' | 'table') => void;

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;

  // Highlighting
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  setHighlightedPath: (nodeIds: Set<string>, edgeIds: Set<string>) => void;
  clearHighlight: () => void;

  // Panel
  isPanelOpen: boolean;
  panelContent: 'node' | 'edge' | null;
  openPanel: (content: 'node' | 'edge') => void;
  closePanel: () => void;

  // Graph controls
  isFullscreen: boolean;
  toggleFullscreen: () => void;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  setSearchQuery: (query: string) => void;
  focusOnColumn: (columnId: string) => void;

  // Clustering
  showDatabaseClusters: boolean;
  toggleDatabaseClusters: () => void;
}
```

---

## 13. API Integration

### 13.1 Lineage Query Parameters

```typescript
interface LineageQueryParams {
  assetId: string;
  direction: 'upstream' | 'downstream' | 'both';
  maxDepth: number;
  includeTransformations?: boolean;
}
```

### 13.2 Response Transformation

Transform API response to React Flow format:

```typescript
function transformLineageResponse(
  response: LineageApiResponse
): { nodes: Node[]; edges: Edge[] } {
  // Group columns by table
  const tableGroups = groupColumnsByTable(response.graph.nodes);

  // Create table nodes with embedded columns
  const nodes = Array.from(tableGroups.entries()).map(([tableKey, columns]) => ({
    id: tableKey,
    type: 'tableNode',
    position: { x: 0, y: 0 }, // Will be set by ELK
    data: {
      databaseName: columns[0].databaseName,
      tableName: columns[0].tableName,
      columns: columns.map(c => ({
        id: c.id,
        name: c.columnName,
        dataType: c.columnType,
        // ... other column properties
      })),
      isExpanded: true,
    },
  }));

  // Create edges with column-level handles
  const edges = response.graph.edges.map(edge => ({
    id: edge.id,
    source: getTableIdFromColumn(edge.source),
    sourceHandle: `${getTableIdFromColumn(edge.source)}-${edge.source}-source`,
    target: getTableIdFromColumn(edge.target),
    targetHandle: `${getTableIdFromColumn(edge.target)}-${edge.target}-target`,
    type: 'lineageEdge',
    data: {
      transformationType: edge.transformationType,
      confidenceScore: edge.confidenceScore,
    },
  }));

  return { nodes, edges };
}
```

---

## 14. Testing Requirements

### 14.1 Unit Tests

| Component | Test Cases |
|-----------|------------|
| TableNode | Renders columns, expand/collapse, selection states |
| LineageEdge | Renders all transformation types, hover animation, confidence styling |
| useLineageHighlight | Correct upstream/downstream traversal |
| useElkLayout | Correct port configuration, node positioning |
| useGraphSearch | Search scoring, result ordering, keyboard navigation |
| useDatabaseClusters | Cluster boundary calculation |

### 14.2 Integration Tests

| Scenario | Verification |
|----------|--------------|
| Load lineage graph | Nodes and edges render with correct layout |
| Select column | Path highlights, panel opens |
| Change depth | API refetch, graph updates |
| Export graph | Downloads correct format |
| Search and focus | Autocomplete works, graph centers on selection |
| Toggle clusters | Database backgrounds appear/disappear |

### 14.3 Visual Regression Tests

- Table node at different column counts (1, 5, 10, 20)
- All edge transformation type colors
- Confidence-based color fading at various levels
- Highlighted vs dimmed states
- Detail panel with full SQL content
- Search autocomplete dropdown
- Database cluster backgrounds

---

## References

- [Commercial Tools Research](../research_commercial_tools.md)
- [Open Source Tools Research](../research_opensource_tools.md)
- [React Flow Patterns Research](../research_react_flow_patterns.md)
- [Frontend Implementation Spec](./lineage_plan_frontend.md)
