# React Flow Data Lineage Visualization Patterns

## Overview

Research covering React Flow implementation patterns specifically for column-level data lineage visualization, including custom node designs for database tables, column-to-column edge connections, ELKjs layout configuration, and UI/UX best practices.

---

## 1. Custom Node Design for Database Tables

### Official Database Schema Node Component

React Flow provides an official [Database Schema Node](https://reactflow.dev/components/nodes/database-schema-node) component that serves as an excellent starting point. The component uses a `DatabaseSchemaNodeData` type with `label` and `schema` array containing column definitions.

### Recommended Table Node Implementation Pattern

```typescript
import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface ColumnData {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

interface TableNodeData {
  label: string;
  database: string;
  columns: ColumnData[];
  isExpanded?: boolean;
}

const TableNode = memo(({ id, data, selected }: NodeProps<TableNodeData>) => {
  return (
    <div className={`table-node ${selected ? 'selected' : ''}`}>
      {/* Table Header */}
      <div className="table-header">
        <span className="database-name">{data.database}</span>
        <span className="table-name">{data.label}</span>
      </div>

      {/* Column Rows with Individual Handles */}
      {data.isExpanded && data.columns.map((column, index) => (
        <div key={column.name} className="column-row">
          {/* Left Handle (Target/Incoming) */}
          <Handle
            type="target"
            position={Position.Left}
            id={`${id}-${column.name}-target`}
            style={{ top: `${40 + index * 24}px` }}
          />

          <span className={`column-name ${column.isPrimaryKey ? 'pk' : ''}`}>
            {column.name}
          </span>
          <span className="column-type">{column.type}</span>

          {/* Right Handle (Source/Outgoing) */}
          <Handle
            type="source"
            position={Position.Right}
            id={`${id}-${column.name}-source`}
            style={{ top: `${40 + index * 24}px` }}
          />
        </div>
      ))}
    </div>
  );
});

export default TableNode;
```

### Key Implementation Points

1. **Multiple Handles Per Node**: Each column needs two handles (source and target) with unique IDs like `${nodeId}-${columnName}-source` and `${nodeId}-${columnName}-target`
2. **Handle Positioning**: Use inline styles or CSS to position handles at each column row
3. **Memoization**: Always wrap custom nodes with `React.memo()` to prevent unnecessary re-renders

**Reference**: [Custom Nodes Documentation](https://reactflow.dev/learn/customization/custom-nodes) | [Handles Documentation](https://reactflow.dev/learn/customization/handles)

---

## 2. Column-to-Column Edge Connections

### Edge Configuration for Column-Level Connections

```typescript
// Edge connecting specific columns
const columnEdge = {
  id: 'edge-1',
  source: 'table-orders',
  sourceHandle: 'table-orders-customer_id-source',
  target: 'table-customers',
  targetHandle: 'table-customers-id-target',
  type: 'smoothstep', // or 'bezier', 'step'
  animated: false,
  style: { stroke: '#4a90d9', strokeWidth: 2 },
  data: {
    transformationType: 'direct', // for color coding
  }
};
```

### Edge Types for Lineage

React Flow supports several built-in edge types suitable for lineage:

| Type | Best For | Description |
|------|----------|-------------|
| `bezier` | Default | Curved connections, good for crossing edges |
| `smoothstep` | Orthogonal layouts | Right-angle paths with rounded corners |
| `step` | Grid layouts | Sharp right-angle connections |
| `straight` | Direct relationships | Simple straight lines |

### Custom Edge with Transformation Label

```typescript
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

const LineageEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#ff6b6b' : getColorByType(data?.transformationType),
          strokeWidth: selected ? 3 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="edge-label"
        >
          {data?.transformationType}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
```

**Reference**: [Custom Edges](https://reactflow.dev/learn/customization/custom-edges) | [Edge Types](https://reactflow.dev/examples/edges/edge-types) | [Animating Edges](https://reactflow.dev/examples/edges/animating-edges)

---

## 3. ELKjs Layout Configuration for Lineage Graphs

### Basic ELKjs Setup with React Flow

```typescript
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT', // LEFT-to-RIGHT flow for lineage
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '150',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
};
```

### ELKjs with Multiple Handles (Ports)

For column-level lineage, you must configure ELKjs ports to match React Flow handles:

```typescript
const getLayoutedElements = async (nodes, edges) => {
  const elkNodes = nodes.map((node) => ({
    id: node.id,
    width: node.width || 250,
    height: node.height || 200,
    // Configure ports for each column handle
    ports: node.data.columns.flatMap((col) => [
      {
        id: `${node.id}-${col.name}-target`,
        properties: {
          side: 'WEST', // Left side for incoming
          index: node.data.columns.indexOf(col),
        },
      },
      {
        id: `${node.id}-${col.name}-source`,
        properties: {
          side: 'EAST', // Right side for outgoing
          index: node.data.columns.indexOf(col),
        },
      },
    ]),
    layoutOptions: {
      'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
    },
  }));

  const elkEdges = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.sourceHandle || edge.source],
    targets: [edge.targetHandle || edge.target],
  }));

  const graph = {
    id: 'root',
    layoutOptions: elkOptions,
    children: elkNodes,
    edges: elkEdges,
  };

  const layoutedGraph = await elk.layout(graph);

  // Map positions back to React Flow nodes
  return {
    nodes: nodes.map((node) => {
      const elkNode = layoutedGraph.children.find((n) => n.id === node.id);
      return {
        ...node,
        position: { x: elkNode.x, y: elkNode.y },
      };
    }),
    edges,
  };
};
```

### Recommended ELK Options for Lineage

| Option | Value | Purpose |
|--------|-------|---------|
| `elk.algorithm` | `layered` | Best for DAG/lineage structures |
| `elk.direction` | `RIGHT` or `DOWN` | Flow direction |
| `elk.spacing.nodeNode` | `80` | Vertical spacing between nodes |
| `elk.layered.spacing.nodeNodeBetweenLayers` | `150` | Horizontal layer spacing |
| `elk.portConstraints` | `FIXED_ORDER` | Respect handle order |
| `elk.layered.crossingMinimization.strategy` | `LAYER_SWEEP` | Minimize edge crossings |

**Reference**: [ELKjs Multiple Handles Example](https://reactflow.dev/examples/layout/elkjs-multiple-handles) | [ELK Layered Algorithm](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)

---

## 4. Lineage Path Highlighting

### Recursive Traversal for Connected Nodes

```typescript
import { getIncomers, getOutgoers } from '@xyflow/react';

// Get all upstream (source) nodes recursively
const getAllUpstream = (node, nodes, edges, visited = new Set()) => {
  const incomers = getIncomers(node, nodes, edges);

  incomers.forEach((incomer) => {
    if (!visited.has(incomer.id)) {
      visited.add(incomer.id);
      getAllUpstream(incomer, nodes, edges, visited);
    }
  });

  return visited;
};

// Get all downstream (target) nodes recursively
const getAllDownstream = (node, nodes, edges, visited = new Set()) => {
  const outgoers = getOutgoers(node, nodes, edges);

  outgoers.forEach((outgoer) => {
    if (!visited.has(outgoer.id)) {
      visited.add(outgoer.id);
      getAllDownstream(outgoer, nodes, edges, visited);
    }
  });

  return visited;
};
```

### Highlighting Implementation with useOnSelectionChange

```typescript
import { useOnSelectionChange, getConnectedEdges } from '@xyflow/react';

const useLineageHighlight = (nodes, edges, setNodes, setEdges) => {
  const highlightLineage = useCallback((selectedNodes) => {
    if (selectedNodes.length === 0) {
      // Reset all styles
      setNodes((nds) => nds.map((n) => ({ ...n, style: { opacity: 1 } })));
      setEdges((eds) => eds.map((e) => ({ ...e, style: { opacity: 1 } })));
      return;
    }

    const selectedNode = selectedNodes[0];
    const upstream = getAllUpstream(selectedNode, nodes, edges);
    const downstream = getAllDownstream(selectedNode, nodes, edges);
    const connectedIds = new Set([selectedNode.id, ...upstream, ...downstream]);

    // Dim non-connected nodes
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        style: { opacity: connectedIds.has(n.id) ? 1 : 0.2 },
      }))
    );

    // Highlight connected edges
    const connectedEdges = getConnectedEdges(
      nodes.filter((n) => connectedIds.has(n.id)),
      edges
    );
    const connectedEdgeIds = new Set(connectedEdges.map((e) => e.id));

    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: {
          opacity: connectedEdgeIds.has(e.id) ? 1 : 0.1,
          stroke: connectedEdgeIds.has(e.id) ? '#4a90d9' : '#ccc',
        },
        animated: connectedEdgeIds.has(e.id),
      }))
    );
  }, [nodes, edges, setNodes, setEdges]);

  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      highlightLineage(selectedNodes);
    },
  });
};
```

**Reference**: [getIncomers()](https://reactflow.dev/api-reference/utils/get-incomers) | [getOutgoers()](https://reactflow.dev/api-reference/utils/get-outgoers) | [useOnSelectionChange()](https://reactflow.dev/api-reference/hooks/use-on-selection-change)

---

## 5. Expand/Collapse Patterns for Column Details

### Toggle Column Visibility in Table Nodes

```typescript
const TableNode = memo(({ id, data, selected }: NodeProps<TableNodeData>) => {
  const updateNodeData = useReactFlow().updateNodeData;

  const toggleExpand = () => {
    updateNodeData(id, { isExpanded: !data.isExpanded });
  };

  return (
    <div className="table-node">
      <div className="table-header" onClick={toggleExpand}>
        <span>{data.label}</span>
        <span className="expand-icon">
          {data.isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {data.isExpanded && (
        <div className="columns-container">
          {data.columns.map((col) => (
            <div key={col.name} className="column-row">
              {/* Column content with handles */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
```

### Hiding Child Nodes (Alternative Pattern)

```typescript
// Using the hidden property for nodes
const toggleNodeChildren = (parentId, hide) => {
  setNodes((nds) =>
    nds.map((node) => {
      if (node.parentNode === parentId) {
        return { ...node, hidden: hide };
      }
      return node;
    })
  );

  setEdges((eds) =>
    eds.map((edge) => {
      if (edge.source.startsWith(parentId) || edge.target.startsWith(parentId)) {
        return { ...edge, hidden: hide };
      }
      return edge;
    })
  );
};
```

**Reference**: [Expand and Collapse Example](https://reactflow.dev/examples/layout/expand-collapse) | [Hidden Nodes Example](https://reactflow.dev/examples/nodes/hidden)

---

## 6. Navigation and Controls for Large Graphs

### MiniMap Configuration

```tsx
import { ReactFlow, MiniMap, Controls, Background } from '@xyflow/react';

<ReactFlow nodes={nodes} edges={edges}>
  <MiniMap
    pannable
    zoomable
    nodeColor={(node) => {
      switch (node.data.assetType) {
        case 'source': return '#4CAF50';
        case 'transformation': return '#2196F3';
        case 'target': return '#F44336';
        default: return '#9E9E9E';
      }
    }}
    maskColor="rgba(0, 0, 0, 0.1)"
  />
  <Controls showInteractive={false} />
  <Background variant="dots" gap={20} />
</ReactFlow>
```

### Programmatic Navigation (Focus on Node)

```typescript
import { useReactFlow } from '@xyflow/react';

const SearchAndNavigate = () => {
  const { fitView, getNode } = useReactFlow();

  const focusOnNode = (nodeId: string) => {
    const node = getNode(nodeId);
    if (node) {
      fitView({
        nodes: [node],
        duration: 500,
        padding: 0.5,
      });
    }
  };

  return (
    <input
      type="text"
      placeholder="Search columns..."
      onChange={(e) => {
        const nodeId = findNodeByColumnName(e.target.value);
        if (nodeId) focusOnNode(nodeId);
      }}
    />
  );
};
```

### Zoom/Pan Best Practices

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  minZoom={0.1}
  maxZoom={2}
  fitView
  fitViewOptions={{ padding: 0.2 }}
  // Figma-style controls (optional)
  panOnScroll
  selectionOnDrag
  panOnDrag={[1, 2]} // Middle/right mouse button
  zoomOnPinch
  zoomOnDoubleClick={false}
/>
```

**Reference**: [MiniMap Component](https://reactflow.dev/api-reference/components/minimap) | [Panning and Zooming](https://reactflow.dev/learn/concepts/the-viewport) | [FitViewOptions](https://reactflow.dev/api-reference/types/fit-view-options)

---

## 7. Performance Optimization for Large Lineage Graphs

### Critical Best Practices

1. **Memoize Custom Components**
```typescript
const TableNode = memo(({ data, selected }) => {
  // Node implementation
});

// Register outside component
const nodeTypes = { tableNode: TableNode };
```

2. **Use Selective Zustand Selectors**
```typescript
import { useStore } from '@xyflow/react';

// BAD: Causes re-render on any node change
const nodes = useStore((state) => state.nodes);

// GOOD: Only re-renders when selection changes
const selectedNodeIds = useStore(
  useCallback((state) =>
    state.nodes.filter((n) => n.selected).map((n) => n.id),
  [])
);
```

3. **Enable Virtualization for Large Graphs**
```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  onlyRenderVisibleElements // Only renders visible nodes/edges
/>
```

4. **Batch State Updates**
```typescript
// Instead of multiple setNodes calls
setNodes((nds) => {
  return nds.map((node) => {
    // Apply all updates in one pass
    return { ...node, ...updates };
  });
});
```

5. **Simplify CSS for Performance**
- Avoid expensive CSS (shadows, gradients, animations) on nodes
- Use `will-change: transform` sparingly
- Prefer opacity changes over display:none for hiding

**Reference**: [Performance Guide](https://reactflow.dev/learn/advanced-use/performance) | [Ultimate Performance Optimization Guide](https://medium.com/@lukasz.jazwa_32493/the-ultimate-guide-to-optimize-react-flow-project-performance-42f4297b2b7b)

---

## 8. Color Coding and Legend Conventions

### Transformation Type Color Scheme

```typescript
const LINEAGE_COLORS = {
  direct: '#4CAF50',      // Green - direct column mapping
  derived: '#2196F3',     // Blue - calculated/derived
  aggregated: '#9C27B0',  // Purple - aggregation
  filtered: '#FF9800',    // Orange - filtered data
  joined: '#00BCD4',      // Cyan - joined from multiple sources
  unknown: '#9E9E9E',     // Gray - unknown transformation
};

// Node colors by asset type
const ASSET_COLORS = {
  sourceTable: '#E3F2FD',    // Light blue background
  stagingTable: '#FFF3E0',   // Light orange background
  targetTable: '#E8F5E9',    // Light green background
  view: '#F3E5F5',           // Light purple background
};
```

### Legend Component with Filter

```tsx
const LineageLegend = ({ onFilterChange }) => {
  const [filters, setFilters] = useState({
    direct: true,
    derived: true,
    aggregated: true,
  });

  return (
    <Panel position="top-right">
      <div className="legend">
        {Object.entries(LINEAGE_COLORS).map(([type, color]) => (
          <label key={type} className="legend-item">
            <input
              type="checkbox"
              checked={filters[type]}
              onChange={(e) => {
                const newFilters = { ...filters, [type]: e.target.checked };
                setFilters(newFilters);
                onFilterChange(newFilters);
              }}
            />
            <span
              className="color-swatch"
              style={{ backgroundColor: color }}
            />
            {type}
          </label>
        ))}
      </div>
    </Panel>
  );
};
```

**Reference**: [Theming](https://reactflow.dev/learn/customization/theming) | [Node Toolbar](https://reactflow.dev/api-reference/components/node-toolbar) | [Shapes Example](https://reactflow.dev/examples/nodes/shapes)

---

## 9. Open Source References and Examples

### Recommended GitHub Repositories

| Repository | Description |
|------------|-------------|
| [sqlhabit/sql_schema_visualizer](https://github.com/sqlhabit/sql_schema_visualizer) | SQL schema visualization with ReactFlow custom nodes for tables with columns |
| [ollionorg/flow-lineage](https://github.com/ollionorg/flow-lineage) | Dedicated lineage chart library built on Flow framework |
| [DataVisuals/LineageViewer](https://github.com/DataVisuals/LineageViewer) | Data Lineage Viewer with Marquez integration and DBT support |
| [vaxad/NextERD](https://github.com/vaxad/NextERD) | ERD maker with Next.js, TypeScript, shadcn/UI, and React-Flow |

### Case Studies

- [Hubql Case Study](https://reactflow.dev/pro/case-studies/hubql-case-study) - Data model visualization using React Flow with table-like custom nodes
- [Sardine Blog](https://www.sardine.ai/blog/visualizing-customer-networks-with-react-flow-and-elk) - Customer network visualization with React Flow and ELK

---

## 10. Complete Integration Example

### Main Lineage Graph Component

```tsx
import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Panel,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TableNode from './TableNode';
import LineageEdge from './LineageEdge';
import LineageLegend from './LineageLegend';
import { useLineageHighlight } from './hooks/useLineageHighlight';
import { useElkLayout } from './hooks/useElkLayout';

// Define node and edge types outside component
const nodeTypes = { tableNode: TableNode };
const edgeTypes = { lineageEdge: LineageEdge };

export const LineageGraph = ({ initialNodes, initialEdges }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Apply ELK layout
  const { layoutNodes } = useElkLayout();

  // Enable lineage highlighting on selection
  useLineageHighlight(nodes, edges, setNodes, setEdges);

  // Memoize callbacks
  const onNodeClick = useCallback((event, node) => {
    console.log('Selected node:', node.id);
  }, []);

  const handleFilterChange = useCallback((filters) => {
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        hidden: !filters[edge.data?.transformationType],
      }))
    );
  }, [setEdges]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        onlyRenderVisibleElements
        defaultEdgeOptions={{
          type: 'lineageEdge',
          style: { strokeWidth: 2 },
        }}
      >
        <Background variant="dots" gap={20} color="#e0e0e0" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => n.data.assetColor || '#ccc'}
        />
        <Controls />
        <Panel position="top-right">
          <LineageLegend onFilterChange={handleFilterChange} />
        </Panel>
      </ReactFlow>
    </div>
  );
};
```

---

## Summary of Recommendations

1. **Use custom table nodes** with multiple handles per column row, each with unique IDs following the pattern `${nodeId}-${columnName}-source/target`

2. **Configure ELKjs** with `layered` algorithm, `FIXED_ORDER` port constraints, and appropriate spacing for readable lineage layouts

3. **Implement path highlighting** using `getIncomers`/`getOutgoers` utilities with recursive traversal and `useOnSelectionChange` hook

4. **Optimize performance** by memoizing components, using selective Zustand selectors, and enabling `onlyRenderVisibleElements` for large graphs

5. **Provide navigation tools** including interactive MiniMap, Controls, search with `fitView` focus, and keyboard shortcuts

6. **Establish color conventions** for transformation types and asset types with a legend/filter panel

7. **Support expand/collapse** for table columns using node data state and dynamic handle rendering

---

## Sources

- [React Flow Documentation](https://reactflow.dev)
- [Custom Nodes](https://reactflow.dev/learn/customization/custom-nodes)
- [Handles Documentation](https://reactflow.dev/learn/customization/handles)
- [Custom Edges](https://reactflow.dev/learn/customization/custom-edges)
- [ELKjs Multiple Handles Example](https://reactflow.dev/examples/layout/elkjs-multiple-handles)
- [ELKjs Tree Example](https://reactflow.dev/examples/layout/elkjs)
- [Performance Guide](https://reactflow.dev/learn/advanced-use/performance)
- [MiniMap Component](https://reactflow.dev/api-reference/components/minimap)
- [Expand and Collapse Example](https://reactflow.dev/examples/layout/expand-collapse)
- [Database Schema Node](https://reactflow.dev/components/nodes/database-schema-node)
- [getIncomers()](https://reactflow.dev/api-reference/utils/get-incomers)
- [getOutgoers()](https://reactflow.dev/api-reference/utils/get-outgoers)
- [useOnSelectionChange()](https://reactflow.dev/api-reference/hooks/use-on-selection-change)
- [Hubql Case Study](https://reactflow.dev/pro/case-studies/hubql-case-study)
- [SQL Schema Visualizer](https://github.com/sqlhabit/sql_schema_visualizer)
- [Flow Lineage](https://github.com/ollionorg/flow-lineage)
- [LineageViewer](https://github.com/DataVisuals/LineageViewer)
- [ELK Layered Algorithm Reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- [Performance Optimization Guide](https://medium.com/@lukasz.jazwa_32493/the-ultimate-guide-to-optimize-react-flow-project-performance-42f4297b2b7b)
