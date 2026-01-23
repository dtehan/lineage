# Data Lineage Frontend - Comprehensive Test Plan

## Overview

This test plan covers the React frontend application for the Data Lineage visualization tool. The application uses React, React Flow with ELKjs for graph visualization, TanStack Query for server state, and Zustand for client state management.

### Testing Frameworks

| Framework | Purpose |
|-----------|---------|
| **Vitest** | Unit tests, component tests, hook tests |
| **React Testing Library** | Component rendering and interaction tests |
| **Playwright** | End-to-end tests, visual regression tests, accessibility audits |
| **MSW (Mock Service Worker)** | API mocking for integration tests |
| **axe-core** | Automated accessibility testing |

---

## 1. Unit Tests

### 1.1 Utility Functions

#### TC-UNIT-001: getNodeWidth Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-001 |
| **Description** | Verify getNodeWidth calculates correct width based on node label length |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create a LineageNode with a short label (5 characters)<br>2. Call getNodeWidth with the node<br>3. Create a LineageNode with a long label (30 characters)<br>4. Call getNodeWidth with the node |
| **Expected Results** | - Short label returns minimum width of 280px (per visualization spec)<br>- Long label returns calculated width auto-expanding for long names |
| **Edge Cases** | - Empty string label<br>- Single character label<br>- Label with special characters<br>- Unicode characters in label |

#### TC-UNIT-002: getNodeHeight Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-002 |
| **Description** | Verify getNodeHeight returns correct height based on node type and column count |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create a column type LineageNode<br>2. Call getNodeHeight<br>3. Create a table type LineageNode with 5 columns<br>4. Call getNodeHeight |
| **Expected Results** | - Column node returns height of 28px (column row height)<br>- Table node returns: headerHeight(40) + (columns.length * 28) + padding(16) |
| **Edge Cases** | - Table with 0 columns<br>- Table with 100+ columns<br>- Collapsed table node |

#### TC-UNIT-003: getNodeLabel Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-003 |
| **Description** | Verify getNodeLabel returns correctly formatted labels for different node types |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create column node with databaseName="db1", tableName="table1", columnName="col1"<br>2. Call getNodeLabel<br>3. Create table node with databaseName="db1", tableName="table1"<br>4. Call getNodeLabel<br>5. Create database node with databaseName="db1"<br>6. Call getNodeLabel |
| **Expected Results** | - Column node returns "table1.col1"<br>- Table node returns "db1.table1"<br>- Database node returns "db1" |
| **Edge Cases** | - Names with dots<br>- Names with spaces<br>- Very long names (truncation behavior)<br>- Empty names |

#### TC-UNIT-004: getEdgeColor Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-004 |
| **Description** | Verify getEdgeColor returns correct colors for different transformation types |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create edge with transformationType="direct"<br>2. Create edge with transformationType="derived"<br>3. Create edge with transformationType="aggregated"<br>4. Create edge with transformationType="joined"<br>5. Create edge with transformationType="unknown" |
| **Expected Results** | - Direct returns "#22C55E" (green-500)<br>- Derived returns "#3B82F6" (blue-500)<br>- Aggregated returns "#A855F7" (purple-500)<br>- Joined returns "#06B6D4" (cyan-500)<br>- Unknown returns "#9CA3AF" (gray-400) |
| **Edge Cases** | - Undefined transformationType<br>- Null transformationType<br>- Invalid string value |

#### TC-UNIT-005: groupByTable Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-005 |
| **Description** | Verify groupByTable correctly groups column nodes by their parent table |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create array of column nodes from different tables<br>2. Call groupByTable<br>3. Verify the returned Map structure |
| **Expected Results** | - Returns Map with keys in format "databaseName.tableName"<br>- Each key maps to array of column nodes belonging to that table<br>- Non-column nodes are excluded |
| **Edge Cases** | - Empty array input<br>- All nodes from same table<br>- Mixed node types (columns, tables, databases)<br>- Duplicate column entries |

#### TC-UNIT-006: getReactFlowNodeType Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-006 |
| **Description** | Verify getReactFlowNodeType maps LineageNode types to React Flow node types |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Call with column type node<br>2. Call with table type node<br>3. Call with database type node |
| **Expected Results** | - Column returns "columnNode"<br>- Table returns "tableNode"<br>- Database returns "databaseNode" |

#### TC-UNIT-007: getEdgeStyleByConfidence Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-007 |
| **Description** | Verify confidence-based edge styling calculations |
| **Preconditions** | confidenceStyles.ts utility module is available |
| **Test Steps** | 1. Call with confidence=95 (90-100% range)<br>2. Call with confidence=75 (70-89% range)<br>3. Call with confidence=60 (50-69% range)<br>4. Call with confidence=40 (below 50% range) |
| **Expected Results** | - 95%: saturation 100%, opacity 1.0<br>- 75%: saturation 75%, opacity 0.9<br>- 60%: saturation 50%, opacity 0.8<br>- 40%: saturation 25%, opacity 0.7 |
| **Edge Cases** | - Confidence of exactly 90, 70, 50<br>- Confidence of 0<br>- Confidence of 100<br>- Negative confidence<br>- Confidence > 100 |

#### TC-UNIT-008: calculateClusterBounds Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-008 |
| **Description** | Verify cluster boundary calculation for database grouping |
| **Preconditions** | useDatabaseClusters.ts hook is available |
| **Test Steps** | 1. Create node bounds map with multiple nodes<br>2. Call calculateClusterBounds with table IDs<br>3. Verify returned bounds object |
| **Expected Results** | - Returns object with x, y, width, height<br>- Bounds encompass all nodes in cluster<br>- Padding is applied correctly |
| **Edge Cases** | - Single node cluster<br>- Empty cluster<br>- Overlapping nodes<br>- Nodes with negative positions |

#### TC-UNIT-009: Search Scoring Functions
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-009 |
| **Description** | Verify search result scoring and ranking |
| **Preconditions** | searchUtils.ts utility module is available |
| **Test Steps** | 1. Search for "cust" against "customer_id"<br>2. Search for "customer" against "customer_id"<br>3. Search for "id" against "customer_id" |
| **Expected Results** | - Exact match scores highest<br>- "starts with" match scores second<br>- "contains" match scores lowest<br>- Results sorted by score descending |
| **Edge Cases** | - Case insensitive matching<br>- Empty search query<br>- No matches found<br>- Special regex characters in query |

### 1.2 TypeScript Type Validation

#### TC-UNIT-010: TableNodeData Interface Validation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-010 |
| **Description** | Verify TableNodeData interface enforces required fields |
| **Preconditions** | TypeScript compilation environment |
| **Test Steps** | 1. Create object with all required fields<br>2. Create object missing databaseName<br>3. Create object with invalid assetType |
| **Expected Results** | - Valid objects pass type checking<br>- Missing required fields cause compilation error<br>- Invalid assetType ('invalid') causes error |

#### TC-UNIT-011: EdgeData Interface Validation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-011 |
| **Description** | Verify EdgeData interface validates transformationType |
| **Preconditions** | TypeScript compilation environment |
| **Test Steps** | 1. Create EdgeData with transformationType="direct"<br>2. Create EdgeData with transformationType="derived"<br>3. Create EdgeData with invalid transformationType |
| **Expected Results** | - Valid transformation types compile<br>- Invalid type causes compilation error |

#### TC-UNIT-012: LineageVisualizationState Interface Validation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-012 |
| **Description** | Verify LineageVisualizationState interface for Zustand store |
| **Preconditions** | TypeScript compilation environment |
| **Test Steps** | 1. Verify viewMode accepts 'graph' or 'table'<br>2. Verify panelContent accepts 'node', 'edge', or null<br>3. Verify highlightedNodeIds is Set<string> |
| **Expected Results** | - All state properties have correct types<br>- All action functions have correct signatures |

---

## 2. Component Tests

### 2.1 Table Node Component

#### TC-COMP-001: TableNode Structure Rendering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-001 |
| **Description** | Verify TableNode renders with correct structure per visualization spec |
| **Preconditions** | Mock useLineageStore, TableNode component available |
| **Test Steps** | 1. Render TableNode with mock data (3 columns)<br>2. Verify header shows "database_name.table_name"<br>3. Verify expand/collapse icon is present<br>4. Verify all columns are rendered |
| **Expected Results** | - Header contains database and table name<br>- Expand/collapse button visible<br>- All 3 column rows rendered<br>- Node width is minimum 280px |
| **Edge Cases** | - Table with no columns<br>- Table with 50+ columns<br>- Very long database/table names |

#### TC-COMP-002: TableNode Column Row Design
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-002 |
| **Description** | Verify column rows have correct structure |
| **Preconditions** | TableNode component rendered |
| **Test Steps** | 1. Inspect column row for left handle (target)<br>2. Verify column name styling (14px, semibold, slate-800)<br>3. Verify data type styling (12px, regular, slate-500, right-aligned)<br>4. Verify right handle (source) |
| **Expected Results** | - Left handle: 8px circle at vertical center<br>- Column name: correct font styling<br>- Data type: correct positioning and styling<br>- Right handle: 8px circle at vertical center |

#### TC-COMP-003: TableNode State Styling
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-003 |
| **Description** | Verify TableNode applies correct styles for each state |
| **Preconditions** | TableNode component with various states |
| **Test Steps** | 1. Render default state<br>2. Render hovered state<br>3. Render selected state<br>4. Render highlighted (in path) state<br>5. Render dimmed state |
| **Expected Results** | - Default: bg #FFFFFF, border #E2E8F0<br>- Hovered: bg #F8FAFC, border #CBD5E1<br>- Selected: bg #EFF6FF, border #3B82F6<br>- Highlighted: bg #F0FDF4, border #22C55E<br>- Dimmed: 20% opacity |

#### TC-COMP-004: TableNode Expand/Collapse
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-004 |
| **Description** | Verify table expand/collapse functionality |
| **Preconditions** | TableNode with columns rendered |
| **Test Steps** | 1. Verify default expanded state shows all columns<br>2. Click collapse button<br>3. Verify columns are hidden<br>4. Click expand button<br>5. Verify columns are visible again |
| **Expected Results** | - Default state: all columns visible (isExpanded: true)<br>- Collapsed: only header visible<br>- Icon changes between expand/collapse states |

### 2.2 Lineage Edge Component

#### TC-COMP-005: LineageEdge Type Rendering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-005 |
| **Description** | Verify edges render with correct colors per transformation type |
| **Preconditions** | LineageEdge component available |
| **Test Steps** | 1. Render edge with type="direct"<br>2. Render edge with type="derived"<br>3. Render edge with type="aggregated"<br>4. Render edge with type="joined"<br>5. Render edge with type="unknown" |
| **Expected Results** | - Direct: #22C55E (green-500)<br>- Derived: #3B82F6 (blue-500)<br>- Aggregated: #A855F7 (purple-500)<br>- Joined: #06B6D4 (cyan-500)<br>- Unknown: #9CA3AF (gray-400) |

#### TC-COMP-006: LineageEdge Visual Specifications
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-006 |
| **Description** | Verify edge visual specifications |
| **Preconditions** | LineageEdge component rendered |
| **Test Steps** | 1. Verify edge is Bezier curve<br>2. Verify default stroke width is 2px<br>3. Verify arrow marker end is 8px<br>4. Verify no animation by default |
| **Expected Results** | - Edge type is bezier<br>- Stroke width: 2px<br>- Arrowhead marker: 8px<br>- animated: false by default |

#### TC-COMP-007: LineageEdge State Styling
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-007 |
| **Description** | Verify edge applies correct styles for each state |
| **Preconditions** | LineageEdge component with various states |
| **Test Steps** | 1. Render default state<br>2. Render hovered state<br>3. Render selected state<br>4. Render in highlighted path<br>5. Render dimmed state |
| **Expected Results** | - Default: solid line, type color<br>- Hovered: 3px stroke, animated dashes<br>- Selected: 3px stroke, animated dashes, glow effect<br>- In path: full opacity, animated<br>- Dimmed: 10% opacity |

#### TC-COMP-008: LineageEdge Confidence Styling
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-008 |
| **Description** | Verify edge color fades based on confidence score |
| **Preconditions** | LineageEdge with confidence scores |
| **Test Steps** | 1. Render edge with confidence=95<br>2. Render edge with confidence=75<br>3. Render edge with confidence=55<br>4. Render edge with confidence=30 |
| **Expected Results** | - 95%: 100% saturation, opacity 1.0<br>- 75%: 75% saturation, opacity 0.9<br>- 55%: 50% saturation, opacity 0.8<br>- 30%: 25% saturation, opacity 0.7 |

#### TC-COMP-009: LineageEdge Label Display
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-009 |
| **Description** | Verify edge label shows on hover/selection |
| **Preconditions** | LineageEdge component |
| **Test Steps** | 1. Render edge, verify no label visible<br>2. Hover over edge<br>3. Verify transformation type label appears at midpoint<br>4. Select edge<br>5. Verify label remains visible |
| **Expected Results** | - Default: no label<br>- Hovered: label at edge midpoint<br>- Selected: label visible<br>- Label shows transformation type |

### 2.3 Detail Panel Component

#### TC-COMP-010: DetailPanel Node Content
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-010 |
| **Description** | Verify panel displays correct content for node selection |
| **Preconditions** | LineageGraphPanel component available |
| **Test Steps** | 1. Select a column node<br>2. Verify panel slides out from right (400px width)<br>3. Verify header shows full qualified name<br>4. Verify Metadata section shows data type, nullable, PK/FK<br>5. Verify Lineage Stats section shows upstream/downstream counts |
| **Expected Results** | - Panel width: 400px<br>- Header: db.table.column format<br>- Metadata section present<br>- Lineage Stats section present<br>- Action buttons visible |

#### TC-COMP-011: DetailPanel Edge Content
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-011 |
| **Description** | Verify panel displays correct content for edge selection |
| **Preconditions** | LineageGraphPanel component available |
| **Test Steps** | 1. Select an edge<br>2. Verify header shows "Connection Details"<br>3. Verify Source and Target column names<br>4. Verify Transformation type and confidence score<br>5. Verify SQL viewer with transformation query |
| **Expected Results** | - Header: "Connection Details"<br>- Source/Target full names<br>- Transformation type displayed<br>- Confidence bar visual<br>- SQL viewer present |

#### TC-COMP-012: SQL Viewer Specifications
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-012 |
| **Description** | Verify SQL viewer meets visual specifications |
| **Preconditions** | SqlViewer component rendered with SQL |
| **Test Steps** | 1. Render SQL viewer with long query<br>2. Verify max height is 200px with scroll<br>3. Verify monospace font, 13px<br>4. Verify syntax highlighting for keywords<br>5. Verify line numbers present<br>6. Verify copy button in top-right |
| **Expected Results** | - Max height: 200px, scrollable<br>- Font: monospace, 13px<br>- Background: #1E293B, Text: #E2E8F0<br>- Line numbers: 40px gutter<br>- Copy button functional |
| **Edge Cases** | - Empty SQL<br>- Very long single line<br>- SQL with special characters<br>- Multiline complex query |

#### TC-COMP-013: DetailPanel Close Behavior
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-013 |
| **Description** | Verify panel close interactions |
| **Preconditions** | Panel is open |
| **Test Steps** | 1. Click close (X) button<br>2. Verify panel closes<br>3. Open panel, press Escape key<br>4. Verify panel closes<br>5. Open panel, click canvas background<br>6. Verify panel closes |
| **Expected Results** | - X button closes panel<br>- Escape key closes panel<br>- Canvas click closes panel and clears selection |

### 2.4 Toolbar Component

#### TC-COMP-014: Toolbar Layout
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-014 |
| **Description** | Verify toolbar contains all required controls |
| **Preconditions** | LineageGraphToolbar component rendered |
| **Test Steps** | 1. Verify View Toggle (Graph/Table tabs)<br>2. Verify Search input with placeholder<br>3. Verify Direction dropdown<br>4. Verify Depth slider<br>5. Verify Fit to View button<br>6. Verify Export button<br>7. Verify Fullscreen button<br>8. Verify Legend toggle |
| **Expected Results** | All controls present and accessible |

#### TC-COMP-015: View Toggle
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-015 |
| **Description** | Verify view toggle switches between Graph and Table views |
| **Preconditions** | Toolbar with view toggle |
| **Test Steps** | 1. Verify Graph tab is default active<br>2. Click Table tab<br>3. Verify Table view renders<br>4. Click Graph tab<br>5. Verify Graph view renders |
| **Expected Results** | - Default: Graph view active<br>- Tab click switches views<br>- Active tab has distinct styling |

#### TC-COMP-016: Direction Dropdown
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-016 |
| **Description** | Verify direction dropdown options and selection |
| **Preconditions** | Toolbar with direction dropdown |
| **Test Steps** | 1. Verify default is "Both"<br>2. Open dropdown<br>3. Verify options: Upstream, Downstream, Both<br>4. Select "Upstream"<br>5. Verify selection triggers graph update |
| **Expected Results** | - Options: Upstream, Downstream, Both<br>- Selection updates store direction<br>- Graph refetches with new direction |

#### TC-COMP-017: Depth Slider
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-017 |
| **Description** | Verify depth slider functionality |
| **Preconditions** | Toolbar with depth slider |
| **Test Steps** | 1. Verify default value is 3<br>2. Verify range is 1-10<br>3. Slide to value 7<br>4. Verify API refetch with maxDepth=7<br>5. Verify loading indicator during fetch |
| **Expected Results** | - Default: 3, Range: 1-10<br>- Slider updates maxDepth in store<br>- Triggers API refetch<br>- Loading indicator shown |
| **Edge Cases** | - Rapid slider changes (debouncing)<br>- API error during refetch |

#### TC-COMP-018: Export Functionality
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-018 |
| **Description** | Verify export options and downloads |
| **Preconditions** | Graph rendered with nodes |
| **Test Steps** | 1. Click Export button<br>2. Verify menu shows PNG, SVG, JSON options<br>3. Click PNG<br>4. Verify PNG downloads<br>5. Click SVG<br>6. Verify SVG downloads<br>7. Click JSON<br>8. Verify JSON with graph data downloads |
| **Expected Results** | - Export menu with 3 options<br>- PNG: rasterized graph image<br>- SVG: vector graph image<br>- JSON: graph nodes and edges data |

#### TC-COMP-019: Fullscreen Toggle
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-019 |
| **Description** | Verify fullscreen mode toggle |
| **Preconditions** | Graph container rendered |
| **Test Steps** | 1. Click fullscreen button<br>2. Verify graph enters fullscreen<br>3. Press Escape or click button again<br>4. Verify exits fullscreen |
| **Expected Results** | - Button toggles fullscreen<br>- Escape exits fullscreen<br>- Graph re-fits view on mode change |

### 2.5 Graph Search Component

#### TC-COMP-020: Search Autocomplete Behavior
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-020 |
| **Description** | Verify search autocomplete functionality |
| **Preconditions** | LineageGraphSearch component with nodes |
| **Test Steps** | 1. Type "cust" in search input<br>2. Verify dropdown appears with matching columns<br>3. Verify results show database.table.column format<br>4. Verify data type shown for each result<br>5. Verify max 10 results displayed |
| **Expected Results** | - Dropdown appears as user types<br>- Results formatted as db.table.column<br>- Data type visible<br>- Max 10 results shown |

#### TC-COMP-021: Search Result Selection
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-021 |
| **Description** | Verify search result selection behavior |
| **Preconditions** | Search with results displayed |
| **Test Steps** | 1. Click on a search result<br>2. Verify graph pans to center on node<br>3. Verify graph zooms appropriately<br>4. Verify node is selected<br>5. Verify path highlighting activates |
| **Expected Results** | - Graph centers on selected node<br>- Appropriate zoom level<br>- Node selected<br>- Lineage path highlighted |

#### TC-COMP-022: Search Keyboard Navigation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-022 |
| **Description** | Verify keyboard navigation in search |
| **Preconditions** | Search with results displayed |
| **Test Steps** | 1. Press Down arrow to highlight first result<br>2. Press Down arrow to move to next<br>3. Press Up arrow to move back<br>4. Press Enter to select highlighted result<br>5. Press Escape to close dropdown |
| **Expected Results** | - Arrow keys navigate results<br>- Enter selects highlighted result<br>- Escape closes dropdown<br>- Focus returns to input on close |
| **Edge Cases** | - Empty results<br>- Single result<br>- Arrow key at list boundaries |

### 2.6 Table View Component

#### TC-COMP-023: Table View Structure
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-023 |
| **Description** | Verify table view renders correct columns |
| **Preconditions** | LineageTableView component with data |
| **Test Steps** | 1. Verify Source Column header<br>2. Verify Target Column header<br>3. Verify Type header<br>4. Verify Depth header<br>5. Verify Confidence header<br>6. Verify Query ID column |
| **Expected Results** | All columns present with correct headers |

#### TC-COMP-024: Table View Sorting
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-024 |
| **Description** | Verify column sorting functionality |
| **Preconditions** | Table view with multiple rows |
| **Test Steps** | 1. Click Source Column header<br>2. Verify ascending sort<br>3. Click again<br>4. Verify descending sort<br>5. Click Confidence header<br>6. Verify numeric sort |
| **Expected Results** | - Header click toggles sort<br>- Ascending/descending indicators<br>- Correct sort order applied |

#### TC-COMP-025: Table View Filtering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-025 |
| **Description** | Verify table filtering functionality |
| **Preconditions** | Table view with multiple rows |
| **Test Steps** | 1. Enter text in filter input<br>2. Verify rows filtered across all columns<br>3. Use Type dropdown filter<br>4. Use Depth range filter<br>5. Use Confidence range filter |
| **Expected Results** | - Text search filters all columns<br>- Dropdown filters by type<br>- Range filters work correctly |

#### TC-COMP-026: Table View Row Click
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-026 |
| **Description** | Verify row click highlights corresponding edge |
| **Preconditions** | Table view and graph view available |
| **Test Steps** | 1. Click on a row in table view<br>2. Switch to graph view<br>3. Verify corresponding edge is highlighted |
| **Expected Results** | - Row click selects edge<br>- Edge highlighted in graph view<br>- Bidirectional sync works |

#### TC-COMP-027: Table View Pagination
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-027 |
| **Description** | Verify table pagination |
| **Preconditions** | Table view with 100+ rows |
| **Test Steps** | 1. Verify 50 rows per page default<br>2. Click next page<br>3. Verify page 2 loads<br>4. Change rows per page to 100<br>5. Verify row count updates |
| **Expected Results** | - Default 50 rows per page<br>- Pagination controls work<br>- Rows per page configurable |
| **Edge Cases** | - Fewer rows than page size<br>- Last page with partial rows |

### 2.7 Cluster Background Component

#### TC-COMP-028: Database Cluster Rendering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-028 |
| **Description** | Verify database cluster backgrounds render |
| **Preconditions** | ClusterBackground component with clusters |
| **Test Steps** | 1. Render graph with tables from multiple databases<br>2. Verify background regions appear<br>3. Verify each database has distinct color<br>4. Verify database label in cluster header<br>5. Verify dashed border style |
| **Expected Results** | - Semi-transparent backgrounds<br>- Distinct colors per database<br>- Database names visible<br>- Border: 1px dashed rgba(0,0,0,0.1) |

#### TC-COMP-029: Cluster Toggle
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-029 |
| **Description** | Verify cluster visibility toggle |
| **Preconditions** | Graph with clusters visible |
| **Test Steps** | 1. Verify clusters visible by default<br>2. Press Ctrl+G<br>3. Verify clusters hidden<br>4. Press Ctrl+G again<br>5. Verify clusters visible |
| **Expected Results** | - Keyboard shortcut toggles clusters<br>- Store state updates<br>- UI reflects toggle state |

### 2.8 Asset Browser Component

#### TC-COMP-030: AssetBrowser Initial Render
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-030 |
| **Description** | Verify AssetBrowser renders loading state initially and displays database list |
| **Preconditions** | Mock useDatabases hook, render AssetBrowser component |
| **Test Steps** | 1. Render AssetBrowser with loading state<br>2. Wait for data to load<br>3. Verify database list is displayed |
| **Expected Results** | - LoadingSpinner displays during loading<br>- "Databases" heading is visible<br>- Database items render with Database icon |

#### TC-COMP-031: AssetBrowser Database Expansion
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-031 |
| **Description** | Verify clicking a database expands to show tables |
| **Preconditions** | AssetBrowser rendered with mock database data |
| **Test Steps** | 1. Click on a database item<br>2. Verify tables are fetched<br>3. Verify table list is displayed<br>4. Click database again to collapse |
| **Expected Results** | - ChevronRight changes to ChevronDown on expand<br>- Tables are displayed under the database<br>- ChevronDown changes back to ChevronRight on collapse |

#### TC-COMP-032: AssetBrowser Column Selection
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-032 |
| **Description** | Verify clicking a column calls setSelectedAssetId |
| **Preconditions** | AssetBrowser with expanded table showing columns |
| **Test Steps** | 1. Click on a column item<br>2. Verify setSelectedAssetId is called with correct column id |
| **Expected Results** | - setSelectedAssetId is called once<br>- Called with the correct column.id value |

### 2.9 Layout Components

#### TC-COMP-033: AppShell Sidebar Toggle
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-033 |
| **Description** | Verify AppShell shows/hides sidebar based on sidebarOpen state |
| **Preconditions** | Mock useUIStore |
| **Test Steps** | 1. Render AppShell with sidebarOpen=true<br>2. Verify Sidebar is visible<br>3. Mock sidebarOpen=false<br>4. Verify Sidebar is hidden |
| **Expected Results** | - Sidebar renders when sidebarOpen is true<br>- Sidebar not rendered when sidebarOpen is false |

#### TC-COMP-034: Header Search Submission
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-034 |
| **Description** | Verify Header search form navigates to search page with query |
| **Preconditions** | Mock useNavigate and useUIStore |
| **Test Steps** | 1. Enter search query in input<br>2. Submit the form<br>3. Verify navigation occurs |
| **Expected Results** | - Navigate called with "/search?q=[encoded query]"<br>- Empty/whitespace query does not navigate |

#### TC-COMP-035: Sidebar Navigation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-035 |
| **Description** | Verify Sidebar NavLinks have correct active styling |
| **Preconditions** | Render Sidebar within BrowserRouter |
| **Test Steps** | 1. Render Sidebar at "/" route<br>2. Verify Explore link is active<br>3. Navigate to "/search"<br>4. Verify Search link is active |
| **Expected Results** | - Active link has bg-slate-700 and text-white<br>- Inactive links have text-slate-400 |

---

## 3. Integration Tests (API Hooks)

### 3.1 useAssets Hooks

#### TC-INT-001: useDatabases Success
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-001 |
| **Description** | Verify useDatabases fetches and returns database list |
| **Preconditions** | Mock API client, wrap in QueryClientProvider |
| **Test Steps** | 1. Call useDatabases hook<br>2. Verify API call to /assets/databases<br>3. Verify returned data structure |
| **Expected Results** | - GET request to correct endpoint<br>- Returns array of Database objects<br>- isLoading transitions from true to false |

#### TC-INT-002: useDatabases Error Handling
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-002 |
| **Description** | Verify useDatabases handles API errors correctly |
| **Preconditions** | Mock API client to return error |
| **Test Steps** | 1. Mock 500 error response<br>2. Call useDatabases hook<br>3. Verify error state |
| **Expected Results** | - error object is populated<br>- isError is true<br>- data is undefined |

#### TC-INT-003: useTables Conditional Fetching
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-003 |
| **Description** | Verify useTables only fetches when databaseName is provided |
| **Preconditions** | Mock API client, wrap in QueryClientProvider |
| **Test Steps** | 1. Call useTables with empty string<br>2. Verify no API call is made<br>3. Call useTables with valid databaseName<br>4. Verify API call is made |
| **Expected Results** | - Empty databaseName: enabled=false, no fetch<br>- Valid databaseName: fetch to /assets/databases/{name}/tables |

#### TC-INT-004: useColumns Conditional Fetching
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-004 |
| **Description** | Verify useColumns only fetches when both databaseName and tableName provided |
| **Preconditions** | Mock API client, wrap in QueryClientProvider |
| **Test Steps** | 1. Call useColumns with empty databaseName<br>2. Call useColumns with empty tableName<br>3. Call useColumns with both values |
| **Expected Results** | - Missing either: enabled=false<br>- Both provided: fetch to correct endpoint |

### 3.2 useLineage Hooks

#### TC-INT-005: useLineage with Default Options
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-005 |
| **Description** | Verify useLineage uses default direction and maxDepth |
| **Preconditions** | Mock API client |
| **Test Steps** | 1. Call useLineage with only assetId<br>2. Verify query parameters |
| **Expected Results** | - direction=both (default)<br>- maxDepth=3 (default per spec)<br>- Correct URL encoding of assetId |

#### TC-INT-006: useLineage with Custom Options
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-006 |
| **Description** | Verify useLineage respects custom direction and maxDepth |
| **Preconditions** | Mock API client |
| **Test Steps** | 1. Call useLineage with direction="upstream", maxDepth=10<br>2. Verify query parameters |
| **Expected Results** | - direction=upstream in query string<br>- maxDepth=10 in query string |

#### TC-INT-007: useLineage Query Key Caching
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-007 |
| **Description** | Verify useLineage uses correct query key for caching |
| **Preconditions** | Mock API client with QueryClient spy |
| **Test Steps** | 1. Call useLineage with same params twice<br>2. Verify second call uses cache<br>3. Change params and call again<br>4. Verify new fetch occurs |
| **Expected Results** | - Same params: cached result returned<br>- Different params: new fetch triggered<br>- Query key includes [assetId, direction, maxDepth] |

#### TC-INT-008: useImpactAnalysis Success
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-008 |
| **Description** | Verify useImpactAnalysis returns impact data with summary |
| **Preconditions** | Mock API client with impact response |
| **Test Steps** | 1. Call useImpactAnalysis with assetId<br>2. Verify returned data structure |
| **Expected Results** | - Returns ImpactAnalysisResponse with assetId, impactedAssets, summary<br>- summary contains totalImpacted, byDatabase, byDepth, criticalCount |

### 3.3 useSearch Hook

#### TC-INT-009: useSearch Minimum Query Length
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-009 |
| **Description** | Verify useSearch only executes when query >= 2 characters |
| **Preconditions** | Mock API client |
| **Test Steps** | 1. Call useSearch with query="a"<br>2. Verify no fetch<br>3. Call useSearch with query="ab"<br>4. Verify fetch occurs |
| **Expected Results** | - 1 character: enabled=false<br>- 2+ characters: enabled=true, fetch occurs |

#### TC-INT-010: useSearch with Asset Type Filters
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-010 |
| **Description** | Verify useSearch appends multiple type parameters |
| **Preconditions** | Mock API client |
| **Test Steps** | 1. Call useSearch with assetTypes=["table", "column"]<br>2. Verify query parameters |
| **Expected Results** | - Query string contains type=table&type=column<br>- limit parameter is included |

---

## 4. State Management Tests

### 4.1 useLineageStore Tests

#### TC-STATE-001: setSelectedAssetId
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-001 |
| **Description** | Verify setSelectedAssetId updates state correctly |
| **Preconditions** | useLineageStore available |
| **Test Steps** | 1. Get initial state<br>2. Call setSelectedAssetId("asset-123")<br>3. Verify state updated<br>4. Call setSelectedAssetId(null)<br>5. Verify state is null |
| **Expected Results** | - selectedAssetId updates to provided value<br>- Null value clears selection |

#### TC-STATE-002: setGraph
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-002 |
| **Description** | Verify setGraph updates nodes and edges |
| **Preconditions** | useLineageStore available |
| **Test Steps** | 1. Create mock nodes and edges<br>2. Call setGraph(nodes, edges)<br>3. Verify store state |
| **Expected Results** | - nodes array in store matches input<br>- edges array in store matches input |

#### TC-STATE-003: setMaxDepth and setDirection
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-003 |
| **Description** | Verify lineage options update correctly |
| **Preconditions** | useLineageStore available |
| **Test Steps** | 1. Call setMaxDepth(10)<br>2. Verify maxDepth is 10<br>3. Call setDirection("upstream")<br>4. Verify direction is "upstream" |
| **Expected Results** | - maxDepth updates from default 3<br>- direction updates from default "both" |

#### TC-STATE-004: toggleTableExpanded
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-004 |
| **Description** | Verify toggleTableExpanded adds/removes table from expanded set |
| **Preconditions** | useLineageStore available |
| **Test Steps** | 1. Call toggleTableExpanded("table1")<br>2. Verify table1 is in expandedTables<br>3. Call toggleTableExpanded("table1") again<br>4. Verify table1 is removed |
| **Expected Results** | - First call adds to Set<br>- Second call removes from Set |

#### TC-STATE-005: setHighlightedPath
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-005 |
| **Description** | Verify setHighlightedPath updates both node and edge sets |
| **Preconditions** | useLineageStore available |
| **Test Steps** | 1. Create Set with node ids<br>2. Create Set with edge ids<br>3. Call setHighlightedPath(nodeIds, edgeIds)<br>4. Verify both sets updated |
| **Expected Results** | - highlightedNodeIds matches provided Set<br>- highlightedEdgeIds matches provided Set |

#### TC-STATE-006: clearHighlight
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-006 |
| **Description** | Verify clearHighlight resets highlighting state |
| **Preconditions** | Highlighted path set in store |
| **Test Steps** | 1. Set highlighted path<br>2. Call clearHighlight<br>3. Verify both sets empty |
| **Expected Results** | - highlightedNodeIds is empty Set<br>- highlightedEdgeIds is empty Set |

### 4.2 LineageVisualizationState Tests

#### TC-STATE-007: viewMode Toggle
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-007 |
| **Description** | Verify setViewMode toggles between graph and table |
| **Preconditions** | useLineageStore with visualization state |
| **Test Steps** | 1. Verify default is 'graph'<br>2. Call setViewMode('table')<br>3. Verify viewMode is 'table'<br>4. Call setViewMode('graph')<br>5. Verify viewMode is 'graph' |
| **Expected Results** | - Default: 'graph'<br>- setViewMode updates correctly |

#### TC-STATE-008: Panel State Management
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-008 |
| **Description** | Verify panel open/close state |
| **Preconditions** | useLineageStore with visualization state |
| **Test Steps** | 1. Verify default isPanelOpen is false<br>2. Call openPanel('node')<br>3. Verify isPanelOpen is true, panelContent is 'node'<br>4. Call openPanel('edge')<br>5. Verify panelContent is 'edge'<br>6. Call closePanel<br>7. Verify isPanelOpen is false |
| **Expected Results** | - Panel state managed correctly<br>- panelContent reflects selection type |

#### TC-STATE-009: Search State Management
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-009 |
| **Description** | Verify search query and results state |
| **Preconditions** | useLineageStore with search state |
| **Test Steps** | 1. Call setSearchQuery("test")<br>2. Verify searchQuery is "test"<br>3. Verify searchResults updates<br>4. Call focusOnColumn("col-123")<br>5. Verify focus action triggered |
| **Expected Results** | - searchQuery updates<br>- searchResults computed/updated<br>- focusOnColumn triggers graph pan/zoom |

#### TC-STATE-010: Fullscreen State
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-010 |
| **Description** | Verify fullscreen toggle state |
| **Preconditions** | useLineageStore with visualization state |
| **Test Steps** | 1. Verify default isFullscreen is false<br>2. Call toggleFullscreen<br>3. Verify isFullscreen is true<br>4. Call toggleFullscreen<br>5. Verify isFullscreen is false |
| **Expected Results** | - Toggle inverts boolean each call |

#### TC-STATE-011: Database Clusters State
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-011 |
| **Description** | Verify database clusters toggle state |
| **Preconditions** | useLineageStore with visualization state |
| **Test Steps** | 1. Verify default showDatabaseClusters is true<br>2. Call toggleDatabaseClusters<br>3. Verify showDatabaseClusters is false |
| **Expected Results** | - Default: true (visible)<br>- Toggle inverts state |

### 4.3 useUIStore Tests

#### TC-STATE-012: toggleSidebar
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-012 |
| **Description** | Verify toggleSidebar toggles sidebarOpen state |
| **Preconditions** | useUIStore available |
| **Test Steps** | 1. Get initial sidebarOpen (true)<br>2. Call toggleSidebar<br>3. Verify sidebarOpen is false<br>4. Call toggleSidebar again<br>5. Verify sidebarOpen is true |
| **Expected Results** | - Each call inverts the boolean value |

#### TC-STATE-013: Store Independence
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-013 |
| **Description** | Verify useLineageStore and useUIStore are independent |
| **Preconditions** | Both stores available |
| **Test Steps** | 1. Update useLineageStore state<br>2. Verify useUIStore unchanged<br>3. Update useUIStore state<br>4. Verify useLineageStore unchanged |
| **Expected Results** | - Changes to one store don't affect other |

---

## 5. Hooks Tests

### 5.1 useLineageHighlight Hook

#### TC-HOOK-001: Upstream Node Traversal
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-001 |
| **Description** | Verify getUpstreamNodes traverses correctly |
| **Preconditions** | useLineageHighlight hook with graph data |
| **Test Steps** | 1. Create graph with A->B->C->D chain<br>2. Call getUpstreamNodes for D<br>3. Verify returns {A, B, C} |
| **Expected Results** | - All upstream nodes found recursively<br>- Does not include the starting node |

#### TC-HOOK-002: Downstream Node Traversal
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-002 |
| **Description** | Verify getDownstreamNodes traverses correctly |
| **Preconditions** | useLineageHighlight hook with graph data |
| **Test Steps** | 1. Create graph with A->B->C->D chain<br>2. Call getDownstreamNodes for A<br>3. Verify returns {B, C, D} |
| **Expected Results** | - All downstream nodes found recursively<br>- Does not include the starting node |

#### TC-HOOK-003: Diamond Pattern Traversal
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-003 |
| **Description** | Verify traversal handles diamond pattern |
| **Preconditions** | Graph with A->B, A->C, B->D, C->D |
| **Test Steps** | 1. Call getUpstreamNodes for D<br>2. Verify returns {A, B, C}<br>3. Call getDownstreamNodes for A<br>4. Verify returns {B, C, D} |
| **Expected Results** | - Both paths found<br>- No duplicate nodes in result |

#### TC-HOOK-004: Cycle Detection
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-004 |
| **Description** | Verify traversal handles cycles without infinite loop |
| **Preconditions** | Graph with cycle: A->B->C->A |
| **Test Steps** | 1. Call getUpstreamNodes for any node<br>2. Verify returns without hanging<br>3. Verify each node appears once |
| **Expected Results** | - Function completes<br>- No infinite recursion<br>- Visited set prevents duplicates |

#### TC-HOOK-005: highlightPath Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-005 |
| **Description** | Verify highlightPath updates node and edge states |
| **Preconditions** | useLineageHighlight hook, graph rendered |
| **Test Steps** | 1. Call highlightPath with selected column ID<br>2. Verify connected nodes have opacity 1<br>3. Verify unconnected nodes have opacity 0.2<br>4. Verify connected edges are animated<br>5. Verify unconnected edges have opacity 0.1 |
| **Expected Results** | - Connected elements: full opacity, animated<br>- Unconnected elements: dimmed |

### 5.2 useElkLayout Hook

#### TC-HOOK-006: Basic Layout
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-006 |
| **Description** | Verify ELK layout positions nodes |
| **Preconditions** | useElkLayout hook available |
| **Test Steps** | 1. Provide nodes and edges<br>2. Call layout function<br>3. Verify all nodes have x, y positions |
| **Expected Results** | - All nodes positioned<br>- No overlapping positions<br>- Positions are finite numbers |

#### TC-HOOK-007: Port Configuration
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-007 |
| **Description** | Verify ELK ports created for column handles |
| **Preconditions** | useElkLayout with table nodes |
| **Test Steps** | 1. Create table node with 3 columns<br>2. Call createElkPorts<br>3. Verify 6 ports created (2 per column) |
| **Expected Results** | - Target ports on WEST side<br>- Source ports on EAST side<br>- Port IDs include column IDs |

#### TC-HOOK-008: Hierarchical Clustering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-008 |
| **Description** | Verify ELK handles database grouping |
| **Preconditions** | Tables from multiple databases |
| **Test Steps** | 1. Create nodes from 3 databases<br>2. Call layout with hierarchyHandling<br>3. Verify tables grouped by database |
| **Expected Results** | - Tables from same database positioned near each other<br>- Cluster boundaries respected |

### 5.3 useGraphSearch Hook

#### TC-HOOK-009: Search Filtering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-009 |
| **Description** | Verify search filters nodes by query |
| **Preconditions** | useGraphSearch with nodes |
| **Test Steps** | 1. Set query to "customer"<br>2. Verify results include customer_id, customer_name<br>3. Verify results exclude unrelated columns |
| **Expected Results** | - Results match query<br>- Results sorted by relevance |

#### TC-HOOK-010: Focus on Column
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-010 |
| **Description** | Verify focusOnColumn centers and selects |
| **Preconditions** | useGraphSearch with graph instance |
| **Test Steps** | 1. Call focusOnColumn with column ID<br>2. Verify fitView called with node<br>3. Verify node is selected |
| **Expected Results** | - Graph pans to node<br>- Appropriate zoom level<br>- Node selected in store |

### 5.4 useDatabaseClusters Hook

#### TC-HOOK-011: Cluster Identification
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-011 |
| **Description** | Verify clusters identified from nodes |
| **Preconditions** | useDatabaseClusters with nodes |
| **Test Steps** | 1. Provide nodes from 3 databases<br>2. Call hook<br>3. Verify 3 clusters returned |
| **Expected Results** | - Each database has a cluster<br>- Cluster contains table IDs<br>- Background color assigned |

#### TC-HOOK-012: Cluster Bounds Calculation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-HOOK-012 |
| **Description** | Verify cluster bounds encompass all tables |
| **Preconditions** | Clusters with positioned nodes |
| **Test Steps** | 1. Position 3 tables in cluster<br>2. Calculate bounds<br>3. Verify bounds include all tables with padding |
| **Expected Results** | - Bounds x,y at min positions minus padding<br>- Bounds width,height cover all nodes plus padding |

---

## 6. Graph Rendering Tests

### 6.1 ELKjs Layout Tests

#### TC-GRAPH-001: Layout Direction
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-001 |
| **Description** | Verify ELK layout respects direction option |
| **Preconditions** | layoutGraph function available |
| **Test Steps** | 1. Call layoutGraph with direction="RIGHT"<br>2. Verify node positions flow left to right<br>3. Call layoutGraph with direction="DOWN"<br>4. Verify node positions flow top to bottom |
| **Expected Results** | - RIGHT: upstream nodes have lower x values<br>- DOWN: upstream nodes have lower y values |

#### TC-GRAPH-002: Node Spacing
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-002 |
| **Description** | Verify ELK layout respects nodeSpacing (60px per spec) |
| **Preconditions** | layoutGraph function available |
| **Test Steps** | 1. Call layoutGraph with nodes in same layer<br>2. Measure spacing between nodes<br>3. Verify minimum 60px spacing |
| **Expected Results** | - Nodes in same layer have >= 60px spacing |

#### TC-GRAPH-003: Layer Spacing
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-003 |
| **Description** | Verify ELK layout respects layerSpacing (120px per spec) |
| **Preconditions** | layoutGraph function available |
| **Test Steps** | 1. Call layoutGraph with connected nodes<br>2. Measure distance between layers<br>3. Verify minimum 120px between layers |
| **Expected Results** | - Connected nodes in different layers have >= 120px spacing |

#### TC-GRAPH-004: Complex Graph Layout
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-004 |
| **Description** | Verify ELK handles complex DAG with multiple paths |
| **Preconditions** | Graph with diamond pattern (A->B, A->C, B->D, C->D) |
| **Test Steps** | 1. Create nodes and edges for diamond pattern<br>2. Call layoutGraph<br>3. Verify no node overlaps<br>4. Verify edges don't cross unnecessarily |
| **Expected Results** | - All nodes have unique positions<br>- No visual overlaps between nodes<br>- Edge crossing is minimized |

#### TC-GRAPH-005: Fan-Out Pattern
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-005 |
| **Description** | Verify layout handles fan-out (A->B, A->C, A->D, A->E) |
| **Preconditions** | Graph with single source, multiple targets |
| **Test Steps** | 1. Create fan-out graph<br>2. Call layoutGraph<br>3. Verify targets spread vertically<br>4. Verify no overlaps |
| **Expected Results** | - Source on left<br>- Targets spread on right<br>- No overlapping |

#### TC-GRAPH-006: Fan-In Pattern
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-006 |
| **Description** | Verify layout handles fan-in (A->E, B->E, C->E, D->E) |
| **Preconditions** | Graph with multiple sources, single target |
| **Test Steps** | 1. Create fan-in graph<br>2. Call layoutGraph<br>3. Verify sources spread vertically<br>4. Verify no overlaps |
| **Expected Results** | - Sources spread on left<br>- Target on right<br>- No overlapping |

### 6.2 Node Rendering Tests

#### TC-GRAPH-007: React Flow Node Types Registration
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-007 |
| **Description** | Verify custom node types are correctly registered |
| **Preconditions** | LineageGraph component |
| **Test Steps** | 1. Render LineageGraph with table nodes<br>2. Verify TableNode component renders<br>3. Verify node has correct structure |
| **Expected Results** | - tableNode type uses TableNode component<br>- Node renders with header and column rows |

#### TC-GRAPH-008: Dynamic Node Sizing
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-008 |
| **Description** | Verify nodes resize based on content |
| **Preconditions** | TableNode with varying column counts |
| **Test Steps** | 1. Render node with 2 columns<br>2. Measure height<br>3. Render node with 10 columns<br>4. Measure height |
| **Expected Results** | - Height: 40 + (columnCount * 28) + 16<br>- Width: minimum 280px, auto-expands |

#### TC-GRAPH-009: Node Memoization
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-009 |
| **Description** | Verify nodes are memoized for performance |
| **Preconditions** | TableNode wrapped in React.memo |
| **Test Steps** | 1. Render node<br>2. Change unrelated state<br>3. Verify node doesn't re-render |
| **Expected Results** | - Node only re-renders when props change<br>- Parent state changes don't cause re-render |

### 6.3 Edge Rendering Tests

#### TC-GRAPH-010: Edge Connection Points
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-010 |
| **Description** | Verify edges connect at column-level handles |
| **Preconditions** | Graph with column-level edges |
| **Test Steps** | 1. Render edge between two columns<br>2. Verify source handle at source column<br>3. Verify target handle at target column |
| **Expected Results** | - Edge starts at source column's right handle<br>- Edge ends at target column's left handle |

#### TC-GRAPH-011: Bezier Curve Edges
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-011 |
| **Description** | Verify edges render as Bezier curves |
| **Preconditions** | LineageEdge component |
| **Test Steps** | 1. Render edge<br>2. Inspect SVG path<br>3. Verify curve type |
| **Expected Results** | - Edge uses bezier curve path<br>- Smooth curve between nodes |

#### TC-GRAPH-012: Edge Animation States
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-012 |
| **Description** | Verify edge animations on hover/selection |
| **Preconditions** | Edge rendered |
| **Test Steps** | 1. Verify no animation by default<br>2. Hover over edge<br>3. Verify dashed animation starts<br>4. Select edge<br>5. Verify animation continues |
| **Expected Results** | - Default: no animation<br>- Hover/Selected: animated dashes |

### 6.4 Zoom and Pan Tests

#### TC-GRAPH-013: Zoom Limits
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-013 |
| **Description** | Verify zoom is constrained to minZoom/maxZoom |
| **Preconditions** | LineageGraph rendered |
| **Test Steps** | 1. Zoom out to minimum<br>2. Verify cannot zoom below 0.1<br>3. Zoom in to maximum<br>4. Verify cannot zoom above 2 |
| **Expected Results** | - Zoom stops at minZoom=0.1<br>- Zoom stops at maxZoom=2 |

#### TC-GRAPH-014: Fit View on Load
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-014 |
| **Description** | Verify graph fits to view with padding on initial load |
| **Preconditions** | LineageGraph component |
| **Test Steps** | 1. Render LineageGraph with nodes<br>2. Verify fitView is applied<br>3. Verify padding is 0.2 |
| **Expected Results** | - All nodes visible in viewport<br>- Appropriate padding around graph |

#### TC-GRAPH-015: Pan Functionality
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-015 |
| **Description** | Verify graph can be panned by dragging background |
| **Preconditions** | LineageGraph rendered with nodes |
| **Test Steps** | 1. Click and drag on background<br>2. Verify viewport moves<br>3. Release and verify position persists |
| **Expected Results** | - Viewport scrolls with drag<br>- Nodes maintain relative positions |

### 6.5 MiniMap Tests

#### TC-GRAPH-016: MiniMap Node Colors
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-016 |
| **Description** | Verify MiniMap shows selected node in different color |
| **Preconditions** | LineageGraph with selected asset |
| **Test Steps** | 1. Render LineageGraph with assetId<br>2. Examine MiniMap node colors |
| **Expected Results** | - Selected node (matching assetId) is blue (#3b82f6)<br>- Other nodes are slate (#94a3b8) |

#### TC-GRAPH-017: MiniMap Viewport Indicator
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-017 |
| **Description** | Verify MiniMap shows current viewport |
| **Preconditions** | LineageGraph with many nodes |
| **Test Steps** | 1. Render large graph<br>2. Pan to different area<br>3. Verify MiniMap viewport indicator updates |
| **Expected Results** | - Viewport rectangle shows current view<br>- Updates on pan/zoom |

---

## 7. End-to-End Tests (Playwright)

### 7.1 Navigation Flows

#### TC-E2E-001: Initial Application Load
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-001 |
| **Framework** | Playwright |
| **Description** | Verify application loads and displays ExplorePage |
| **Preconditions** | Application running, backend available |
| **Test Steps** | 1. Navigate to root URL (/)<br>2. Wait for page to load<br>3. Verify ExplorePage components are visible |
| **Expected Results** | - Sidebar is visible<br>- Header is visible<br>- AssetBrowser panel is displayed<br>- "Select a column to view its lineage" placeholder shown |
| **Playwright Code** |
```typescript
test('initial application load', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByText('Databases')).toBeVisible();
  await expect(page.getByText('Select a column to view its lineage')).toBeVisible();
});
```

#### TC-E2E-002: Navigate to Lineage Page via URL
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-002 |
| **Framework** | Playwright |
| **Description** | Verify direct navigation to lineage page with assetId |
| **Preconditions** | Application running, valid assetId |
| **Test Steps** | 1. Navigate to /lineage/{assetId}<br>2. Wait for lineage data to load<br>3. Verify LineagePage is displayed |
| **Expected Results** | - Header shows "Lineage: {assetId}"<br>- Depth and Direction controls are visible<br>- LineageGraph renders with nodes |
| **Playwright Code** |
```typescript
test('navigate to lineage page', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await expect(page.getByText('Lineage: db1.table1.column1')).toBeVisible();
  await expect(page.getByLabel('Depth')).toBeVisible();
  await expect(page.getByLabel('Direction')).toBeVisible();
  await expect(page.locator('.react-flow')).toBeVisible();
});
```

#### TC-E2E-003: Search Navigation Flow
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-003 |
| **Framework** | Playwright |
| **Description** | Verify search from header navigates to search page |
| **Preconditions** | Application running |
| **Test Steps** | 1. Enter search query in header input<br>2. Press Enter or submit form<br>3. Verify navigation to /search |
| **Expected Results** | - URL changes to /search?q={query}<br>- SearchPage is displayed<br>- Search results are fetched and displayed |
| **Playwright Code** |
```typescript
test('search navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Search').fill('customer');
  await page.getByPlaceholder('Search').press('Enter');
  await expect(page).toHaveURL(/\/search\?q=customer/);
  await expect(page.getByText('Search Results')).toBeVisible();
});
```

### 7.2 Asset Selection Flows

#### TC-E2E-004: Browse and Select Column
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-004 |
| **Framework** | Playwright |
| **Description** | Verify full flow of browsing to and selecting a column |
| **Preconditions** | Application running with populated database |
| **Test Steps** | 1. Click on a database in AssetBrowser<br>2. Wait for tables to load<br>3. Click on a table<br>4. Wait for columns to load<br>5. Click on a column |
| **Expected Results** | - Each level expands to show children<br>- Clicking column triggers lineage load<br>- LineageGraph displays for selected column |
| **Playwright Code** |
```typescript
test('browse and select column', async ({ page }) => {
  await page.goto('/');

  // Expand database
  await page.getByText('sales_db').click();
  await expect(page.getByText('customers')).toBeVisible();

  // Expand table
  await page.getByText('customers').click();
  await expect(page.getByText('customer_id')).toBeVisible();

  // Select column
  await page.getByText('customer_id').click();
  await expect(page.locator('.react-flow')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount.greaterThan(0);
});
```

#### TC-E2E-005: Change Lineage Direction
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-005 |
| **Framework** | Playwright |
| **Description** | Verify changing direction updates lineage graph |
| **Preconditions** | LineagePage displayed with asset selected |
| **Test Steps** | 1. Select "Upstream" from direction dropdown<br>2. Wait for graph to update<br>3. Select "Downstream"<br>4. Wait for graph to update |
| **Expected Results** | - Graph refetches with new direction<br>- Nodes change based on direction<br>- Layout recalculates |
| **Playwright Code** |
```typescript
test('change lineage direction', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  const initialNodeCount = await page.locator('.react-flow__node').count();

  await page.getByLabel('Direction').selectOption('upstream');
  await page.waitForResponse(resp => resp.url().includes('direction=upstream'));

  await page.getByLabel('Direction').selectOption('downstream');
  await page.waitForResponse(resp => resp.url().includes('direction=downstream'));
});
```

#### TC-E2E-006: Change Lineage Depth
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-006 |
| **Framework** | Playwright |
| **Description** | Verify changing depth updates lineage graph |
| **Preconditions** | LineagePage displayed with asset selected |
| **Test Steps** | 1. Change depth slider from 3 to 7<br>2. Wait for graph to update<br>3. Verify more nodes appear |
| **Expected Results** | - Increasing depth may show more nodes<br>- Decreasing depth shows fewer nodes<br>- Graph re-layouts after each change |
| **Playwright Code** |
```typescript
test('change lineage depth', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Change depth using slider
  const slider = page.getByRole('slider', { name: 'Depth' });
  await slider.fill('7');

  // Wait for API call with new depth
  await page.waitForResponse(resp => resp.url().includes('maxDepth=7'));
});
```

### 7.3 Graph Interaction Flows

#### TC-E2E-007: Column Selection and Path Highlighting
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-007 |
| **Framework** | Playwright |
| **Description** | Verify selecting a column highlights lineage path |
| **Preconditions** | Graph with multiple nodes rendered |
| **Test Steps** | 1. Click on a column node<br>2. Verify path highlighting activates<br>3. Verify unrelated nodes are dimmed<br>4. Click canvas background<br>5. Verify highlighting clears |
| **Expected Results** | - Selected column highlighted<br>- Upstream/downstream path visible<br>- Unrelated nodes at 20% opacity<br>- Canvas click clears all |
| **Playwright Code** |
```typescript
test('path highlighting on selection', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Click a node
  await page.locator('.react-flow__node').first().click();

  // Verify highlighting (check for dimmed class on other nodes)
  await expect(page.locator('.react-flow__node.dimmed')).toHaveCount.greaterThan(0);

  // Click background to clear
  await page.locator('.react-flow__pane').click();
  await expect(page.locator('.react-flow__node.dimmed')).toHaveCount(0);
});
```

#### TC-E2E-008: Detail Panel Opens on Selection
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-008 |
| **Framework** | Playwright |
| **Description** | Verify detail panel opens when node/edge selected |
| **Preconditions** | Graph rendered |
| **Test Steps** | 1. Click on a node<br>2. Verify panel slides out<br>3. Verify node details shown<br>4. Click on an edge<br>5. Verify edge details shown |
| **Expected Results** | - Panel width: 400px<br>- Node: shows metadata, lineage stats<br>- Edge: shows transformation details |
| **Playwright Code** |
```typescript
test('detail panel opens on selection', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Click node
  await page.locator('.react-flow__node').first().click();

  // Verify panel
  await expect(page.getByRole('complementary')).toBeVisible();
  await expect(page.getByText('Column Details')).toBeVisible();

  // Close and click edge
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('.react-flow__edge').first().click();
  await expect(page.getByText('Connection Details')).toBeVisible();
});
```

#### TC-E2E-009: Graph Search and Focus
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-009 |
| **Framework** | Playwright |
| **Description** | Verify search focuses on found column |
| **Preconditions** | Graph with searchable columns |
| **Test Steps** | 1. Type in graph search input<br>2. Select result from autocomplete<br>3. Verify graph centers on column<br>4. Verify column is selected |
| **Expected Results** | - Autocomplete shows matching columns<br>- Graph pans/zooms to selection<br>- Column is highlighted |
| **Playwright Code** |
```typescript
test('graph search and focus', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Use graph search
  await page.getByPlaceholder('Search columns').fill('order_id');
  await expect(page.getByRole('listbox')).toBeVisible();

  // Select result
  await page.getByRole('option', { name: /order_id/ }).click();

  // Verify selection
  await expect(page.locator('.react-flow__node.selected')).toBeVisible();
});
```

#### TC-E2E-010: View Toggle Graph to Table
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-010 |
| **Framework** | Playwright |
| **Description** | Verify switching between Graph and Table views |
| **Preconditions** | Lineage page with data |
| **Test Steps** | 1. Verify Graph view is default<br>2. Click Table tab<br>3. Verify table displays<br>4. Click Graph tab<br>5. Verify graph displays |
| **Expected Results** | - Tab click switches views<br>- Data consistent between views<br>- State preserved on switch |
| **Playwright Code** |
```typescript
test('view toggle', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow');

  // Switch to table
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(page.getByRole('table')).toBeVisible();

  // Switch back to graph
  await page.getByRole('tab', { name: 'Graph' }).click();
  await expect(page.locator('.react-flow')).toBeVisible();
});
```

### 7.4 Keyboard Navigation

#### TC-E2E-011: Keyboard Shortcuts
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-011 |
| **Framework** | Playwright |
| **Description** | Verify keyboard shortcuts work |
| **Preconditions** | Graph rendered |
| **Test Steps** | 1. Press 'F' - verify fit to view<br>2. Press '+' - verify zoom in<br>3. Press '-' - verify zoom out<br>4. Press 'Escape' - verify clear selection<br>5. Press Ctrl+F - verify search focused |
| **Expected Results** | All shortcuts trigger correct actions |
| **Playwright Code** |
```typescript
test('keyboard shortcuts', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Fit to view
  await page.keyboard.press('f');

  // Zoom
  await page.keyboard.press('+');
  await page.keyboard.press('-');

  // Select node then escape
  await page.locator('.react-flow__node').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);

  // Focus search
  await page.keyboard.press('Control+f');
  await expect(page.getByPlaceholder('Search columns')).toBeFocused();
});
```

#### TC-E2E-012: Tab Navigation Through Nodes
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-012 |
| **Framework** | Playwright |
| **Description** | Verify Tab key navigates between nodes |
| **Preconditions** | Graph with multiple nodes |
| **Test Steps** | 1. Click on graph<br>2. Press Tab<br>3. Verify focus moves to next node<br>4. Press Enter<br>5. Verify node is selected |
| **Expected Results** | - Tab moves focus between nodes<br>- Enter selects focused node<br>- Focus visible indicator shown |
| **Playwright Code** |
```typescript
test('tab navigation', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Focus graph area
  await page.locator('.react-flow').click();

  // Tab through nodes
  await page.keyboard.press('Tab');
  await expect(page.locator('.react-flow__node:focus')).toBeVisible();

  // Select with Enter
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node.selected')).toBeVisible();
});
```

### 7.5 Export and Fullscreen

#### TC-E2E-013: Export Graph as PNG
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-013 |
| **Framework** | Playwright |
| **Description** | Verify PNG export downloads file |
| **Preconditions** | Graph rendered |
| **Test Steps** | 1. Click Export button<br>2. Select PNG option<br>3. Verify download initiated |
| **Expected Results** | - PNG file downloaded<br>- File contains graph image |
| **Playwright Code** |
```typescript
test('export as PNG', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Set up download listener
  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'PNG' }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.png');
});
```

#### TC-E2E-014: Fullscreen Mode
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-014 |
| **Framework** | Playwright |
| **Description** | Verify fullscreen toggle works |
| **Preconditions** | Graph rendered |
| **Test Steps** | 1. Click fullscreen button<br>2. Verify fullscreen mode<br>3. Press Escape<br>4. Verify normal mode |
| **Expected Results** | - Graph container fills screen<br>- Escape exits fullscreen |
| **Playwright Code** |
```typescript
test('fullscreen mode', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  await page.getByRole('button', { name: 'Fullscreen' }).click();

  // Check fullscreen state
  const isFullscreen = await page.evaluate(() => document.fullscreenElement !== null);
  expect(isFullscreen).toBe(true);

  await page.keyboard.press('Escape');
  const isNormal = await page.evaluate(() => document.fullscreenElement === null);
  expect(isNormal).toBe(true);
});
```

### 7.6 Edge Cases and Error Handling

#### TC-E2E-015: Empty Lineage Graph
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-015 |
| **Framework** | Playwright |
| **Description** | Verify handling of column with no lineage |
| **Preconditions** | Column with no upstream/downstream |
| **Test Steps** | 1. Navigate to isolated column<br>2. Verify appropriate message shown |
| **Expected Results** | - Graph shows single node<br>- Message indicates no lineage found |
| **Playwright Code** |
```typescript
test('empty lineage', async ({ page }) => {
  await page.goto('/lineage/db1.isolated_table.column1');
  await page.waitForSelector('.react-flow');

  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.getByText('No lineage connections found')).toBeVisible();
});
```

#### TC-E2E-016: API Error Handling
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-016 |
| **Framework** | Playwright |
| **Description** | Verify error message on API failure |
| **Preconditions** | Mock API to return error |
| **Test Steps** | 1. Navigate with invalid assetId<br>2. Verify error message displayed |
| **Expected Results** | - Error message visible<br>- Retry option available |
| **Playwright Code** |
```typescript
test('API error handling', async ({ page }) => {
  // Route to return error
  await page.route('**/api/v1/lineage/**', route => {
    route.fulfill({ status: 500, body: 'Internal Server Error' });
  });

  await page.goto('/lineage/invalid-asset');
  await expect(page.getByText('Failed to load lineage')).toBeVisible();
});
```

#### TC-E2E-017: Large Graph Performance
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-017 |
| **Framework** | Playwright |
| **Description** | Verify performance with 100+ nodes |
| **Preconditions** | Asset with deep lineage |
| **Test Steps** | 1. Navigate to asset with 100+ nodes<br>2. Measure render time<br>3. Test pan/zoom responsiveness |
| **Expected Results** | - Initial render < 3 seconds<br>- Pan/zoom responsive<br>- Warning shown for large graphs |
| **Playwright Code** |
```typescript
test('large graph performance', async ({ page }) => {
  const startTime = Date.now();

  await page.goto('/lineage/large-lineage-asset?maxDepth=10');
  await page.waitForSelector('.react-flow__node');

  const renderTime = Date.now() - startTime;
  expect(renderTime).toBeLessThan(3000);

  // Check for warning if > 100 nodes
  const nodeCount = await page.locator('.react-flow__node').count();
  if (nodeCount > 100) {
    await expect(page.getByText('Large graph')).toBeVisible();
  }
});
```

#### TC-E2E-018: Network Offline Handling
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-018 |
| **Framework** | Playwright |
| **Description** | Verify behavior when network goes offline |
| **Preconditions** | Graph loaded, then network fails |
| **Test Steps** | 1. Load lineage graph<br>2. Simulate offline<br>3. Try to change depth<br>4. Verify cached data still shown |
| **Expected Results** | - Cached data remains visible<br>- Error message for new requests<br>- Retry when back online |
| **Playwright Code** |
```typescript
test('offline handling', async ({ page, context }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Go offline
  await context.setOffline(true);

  // Try to fetch new data
  await page.getByLabel('Depth').selectOption('10');

  await expect(page.getByText('Network error')).toBeVisible();

  // Graph should still show cached data
  await expect(page.locator('.react-flow__node')).toHaveCount.greaterThan(0);
});
```

#### TC-E2E-019: Concurrent User Actions
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-019 |
| **Framework** | Playwright |
| **Description** | Verify rapid user actions don't break UI |
| **Preconditions** | Graph loaded |
| **Test Steps** | 1. Rapidly click multiple nodes<br>2. Rapidly change depth multiple times<br>3. Verify final state is correct |
| **Expected Results** | - UI remains responsive<br>- Final state reflects last action<br>- No duplicate API calls |
| **Playwright Code** |
```typescript
test('rapid user actions', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Rapidly change depth
  const slider = page.getByRole('slider', { name: 'Depth' });
  for (let i = 1; i <= 10; i++) {
    await slider.fill(String(i));
  }

  // Wait for debounced request
  await page.waitForTimeout(500);

  // Verify only final value requested
  await expect(slider).toHaveValue('10');
});
```

---

## 8. Accessibility Tests

### 8.1 Keyboard Navigation

#### TC-A11Y-001: AssetBrowser Keyboard Navigation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-001 |
| **Framework** | Playwright + axe-core |
| **Description** | Verify AssetBrowser can be navigated with keyboard |
| **Preconditions** | AssetBrowser rendered |
| **Test Steps** | 1. Tab to first database<br>2. Press Enter to expand<br>3. Tab to table<br>4. Press Enter to expand<br>5. Tab to column<br>6. Press Enter to select |
| **Expected Results** | - All items are focusable<br>- Enter activates items<br>- Focus is visible |

#### TC-A11Y-002: Graph Keyboard Navigation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-002 |
| **Description** | Verify graph nodes are keyboard accessible |
| **Preconditions** | Graph rendered |
| **Test Steps** | 1. Tab into graph<br>2. Use Tab to navigate nodes<br>3. Press Enter to select<br>4. Press Escape to deselect |
| **Expected Results** | - Nodes are focusable<br>- Enter selects focused node<br>- Escape clears selection |

#### TC-A11Y-003: Dropdown Controls
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-003 |
| **Description** | Verify toolbar dropdowns are keyboard accessible |
| **Preconditions** | Toolbar rendered |
| **Test Steps** | 1. Tab to Direction dropdown<br>2. Press Enter to open<br>3. Use arrow keys to navigate<br>4. Press Enter to select |
| **Expected Results** | - Dropdowns focusable<br>- Arrow keys navigate options<br>- Enter selects option |

### 8.2 Screen Reader Support

#### TC-A11Y-004: ARIA Labels on Graph
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-004 |
| **Description** | Verify graph has appropriate ARIA labels |
| **Preconditions** | Graph rendered |
| **Test Steps** | 1. Inspect graph container<br>2. Verify role="application"<br>3. Verify aria-label="Lineage graph"<br>4. Inspect nodes for aria-labels |
| **Expected Results** | - Graph: role="application", aria-label="Lineage graph"<br>- Nodes: role="button", aria-label with full column name<br>- Edges: role="img", aria-label describing connection |

#### TC-A11Y-005: Screen Reader Announcements
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-005 |
| **Description** | Verify appropriate announcements on interactions |
| **Preconditions** | Screen reader simulation |
| **Test Steps** | 1. Focus node<br>2. Verify announcement<br>3. Select node<br>4. Verify selection announcement |
| **Expected Results** | - Focus: announces column name, table, type, connection count<br>- Selection: announces "Selected {column}, {n} upstream, {m} downstream"<br>- Highlight: announces "Highlighting lineage path with {n} nodes" |

#### TC-A11Y-006: Loading State Announcements
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-006 |
| **Description** | Verify loading states are announced |
| **Preconditions** | Component in loading state |
| **Test Steps** | 1. Trigger loading state<br>2. Verify aria-live region<br>3. Verify announcement |
| **Expected Results** | - Loading spinner has role="status"<br>- Screen reader announces "Loading lineage data" |

#### TC-A11Y-007: Error Announcements
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-007 |
| **Description** | Verify errors are announced |
| **Preconditions** | Error state triggered |
| **Test Steps** | 1. Trigger API error<br>2. Verify role="alert"<br>3. Verify error announced |
| **Expected Results** | - Error uses role="alert"<br>- Screen reader announces error message |

### 8.3 Color Contrast

#### TC-A11Y-008: Text Contrast Ratios
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-008 |
| **Framework** | axe-core |
| **Description** | Verify text meets WCAG AA contrast requirements |
| **Test Steps** | 1. Run axe-core on all pages<br>2. Check contrast ratios |
| **Expected Results** | - Primary text >= 4.5:1 ratio<br>- Large text >= 3:1 ratio<br>- No contrast violations |
| **Playwright Code** |
```typescript
import AxeBuilder from '@axe-core/playwright';

test('color contrast', async ({ page }) => {
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  const results = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze();

  expect(results.violations).toHaveLength(0);
});
```

#### TC-A11Y-009: Focus Indicator Visibility
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-009 |
| **Description** | Verify focus indicators are visible |
| **Preconditions** | Interactive elements rendered |
| **Test Steps** | 1. Tab through elements<br>2. Verify focus ring visible<br>3. Check ring contrast |
| **Expected Results** | - Focus ring visible on all interactive elements<br>- Ring contrasts with background<br>- Ring width >= 2px |

### 8.4 Full Page Accessibility Audit

#### TC-A11Y-010: Full Page axe Audit
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-010 |
| **Framework** | Playwright + axe-core |
| **Description** | Run full accessibility audit on all pages |
| **Test Steps** | 1. Navigate to each page<br>2. Run axe-core audit<br>3. Report violations |
| **Expected Results** | - No critical violations<br>- No serious violations<br>- Minor violations documented |
| **Playwright Code** |
```typescript
const pages = ['/', '/lineage/test-asset', '/search?q=test', '/impact/test-asset'];

for (const url of pages) {
  test(`accessibility audit: ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    )).toHaveLength(0);
  });
}
```

---

## 9. Visual Regression Tests (Playwright)

### 9.1 Component Screenshots

#### TC-VIS-001: TableNode Visual States
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-001 |
| **Framework** | Playwright |
| **Description** | Capture and compare TableNode visual states |
| **Test Steps** | 1. Render default state<br>2. Capture screenshot<br>3. Render hovered state<br>4. Capture screenshot<br>5. Render selected state<br>6. Capture screenshot |
| **Expected Results** | - Screenshots match baseline<br>- Visual changes on state detected |
| **Playwright Code** |
```typescript
test('TableNode visual states', async ({ page }) => {
  await page.goto('/storybook/table-node');

  // Default state
  await expect(page.locator('.table-node')).toHaveScreenshot('table-node-default.png');

  // Hover state
  await page.locator('.table-node').hover();
  await expect(page.locator('.table-node')).toHaveScreenshot('table-node-hover.png');

  // Selected state
  await page.locator('.table-node').click();
  await expect(page.locator('.table-node')).toHaveScreenshot('table-node-selected.png');
});
```

#### TC-VIS-002: Edge Type Colors
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-002 |
| **Framework** | Playwright |
| **Description** | Verify edge colors match specification |
| **Test Steps** | 1. Render each edge type<br>2. Capture screenshots<br>3. Compare to baselines |
| **Expected Results** | - Direct: green (#22C55E)<br>- Derived: blue (#3B82F6)<br>- Aggregated: purple (#A855F7)<br>- Joined: cyan (#06B6D4) |

#### TC-VIS-003: Confidence Color Fading
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-003 |
| **Framework** | Playwright |
| **Description** | Verify confidence-based color fading |
| **Test Steps** | 1. Render edges with confidence 95, 75, 55, 35<br>2. Capture screenshots<br>3. Verify color saturation decreases |
| **Expected Results** | - Visual fade progression visible<br>- Lower confidence = more faded |

#### TC-VIS-004: Detail Panel Layout
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-004 |
| **Framework** | Playwright |
| **Description** | Verify detail panel matches specification |
| **Test Steps** | 1. Open panel for node<br>2. Capture screenshot<br>3. Open panel for edge<br>4. Capture screenshot |
| **Expected Results** | - Panel width: 400px<br>- Layout matches spec diagrams<br>- SQL viewer styled correctly |

#### TC-VIS-005: Database Cluster Backgrounds
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-005 |
| **Framework** | Playwright |
| **Description** | Verify cluster backgrounds render correctly |
| **Test Steps** | 1. Render graph with 3 databases<br>2. Capture screenshot<br>3. Toggle clusters off<br>4. Capture screenshot |
| **Expected Results** | - Distinct background colors per database<br>- Dashed borders visible<br>- Database labels shown |

### 9.2 Responsive Screenshots

#### TC-VIS-006: Mobile Layout (320px)
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-006 |
| **Framework** | Playwright |
| **Description** | Verify mobile layout |
| **Test Steps** | 1. Set viewport to 320x568<br>2. Navigate to each page<br>3. Capture screenshots |
| **Expected Results** | - No horizontal overflow<br>- Touch targets adequate<br>- Sidebar collapsible |
| **Playwright Code** |
```typescript
test('mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  await expect(page).toHaveScreenshot('mobile-explore.png');

  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow');
  await expect(page).toHaveScreenshot('mobile-lineage.png');
});
```

#### TC-VIS-007: Tablet Layout (768px)
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-007 |
| **Framework** | Playwright |
| **Description** | Verify tablet layout |
| **Test Steps** | 1. Set viewport to 768x1024<br>2. Navigate to each page<br>3. Capture screenshots |
| **Expected Results** | - Layout adapts appropriately<br>- Sidebar behavior correct<br>- Graph has adequate space |

#### TC-VIS-008: Desktop Layout (1920px)
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-VIS-008 |
| **Framework** | Playwright |
| **Description** | Verify desktop layout |
| **Test Steps** | 1. Set viewport to 1920x1080<br>2. Navigate to each page<br>3. Capture screenshots |
| **Expected Results** | - Content properly constrained<br>- Graph uses available space<br>- No excessive stretching |

---

## 10. Performance Tests

### 10.1 Graph Performance

#### TC-PERF-001: Large Graph Rendering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-001 |
| **Framework** | Playwright |
| **Description** | Measure rendering time for large graphs |
| **Test Steps** | 1. Load graph with 50, 100, 200 nodes<br>2. Measure initial render time<br>3. Measure interaction responsiveness |
| **Expected Results** | - 50 nodes: < 1 second<br>- 100 nodes: < 2 seconds<br>- 200 nodes: < 5 seconds, warning shown |
| **Playwright Code** |
```typescript
test('large graph rendering', async ({ page }) => {
  // 50 nodes
  let start = Date.now();
  await page.goto('/lineage/medium-asset?maxDepth=5');
  await page.waitForSelector('.react-flow__node');
  expect(Date.now() - start).toBeLessThan(1000);

  // 100 nodes
  start = Date.now();
  await page.goto('/lineage/large-asset?maxDepth=7');
  await page.waitForSelector('.react-flow__node');
  expect(Date.now() - start).toBeLessThan(2000);
});
```

#### TC-PERF-002: Layout Calculation Time
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-002 |
| **Description** | Measure ELK layout calculation time |
| **Test Steps** | 1. Provide 10, 50, 100 nodes<br>2. Measure layout time<br>3. Verify within thresholds |
| **Expected Results** | - 10 nodes: < 100ms<br>- 50 nodes: < 500ms<br>- 100 nodes: < 2000ms |

#### TC-PERF-003: Pan/Zoom FPS
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-003 |
| **Framework** | Playwright |
| **Description** | Measure frame rate during interactions |
| **Test Steps** | 1. Load large graph<br>2. Perform continuous pan<br>3. Measure frame rate |
| **Expected Results** | - Maintains >= 30 FPS during pan<br>- No visible jank |

### 10.2 API Performance

#### TC-PERF-004: Query Caching
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-004 |
| **Framework** | Playwright |
| **Description** | Verify TanStack Query caching |
| **Test Steps** | 1. Load lineage<br>2. Navigate away<br>3. Navigate back<br>4. Count network requests |
| **Expected Results** | - Second visit uses cache<br>- No duplicate requests within staleTime |
| **Playwright Code** |
```typescript
test('query caching', async ({ page }) => {
  let requestCount = 0;
  await page.route('**/api/v1/lineage/**', route => {
    requestCount++;
    route.continue();
  });

  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');
  expect(requestCount).toBe(1);

  await page.goto('/');
  await page.goto('/lineage/db1.table1.column1');
  await page.waitForSelector('.react-flow__node');

  // Should use cache, no new request
  expect(requestCount).toBe(1);
});
```

#### TC-PERF-005: Debounced Depth Changes
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-005 |
| **Description** | Verify depth slider changes are debounced |
| **Test Steps** | 1. Rapidly change depth 10 times<br>2. Count API requests<br>3. Verify only 1-2 requests made |
| **Expected Results** | - Rapid changes debounced<br>- Only final value fetched |

---

## Test Environment Requirements

### Dependencies for Testing

```json
{
  "devDependencies": {
    "vitest": "^1.1.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@playwright/test": "^1.40.0",
    "@axe-core/playwright": "^4.8.0",
    "msw": "^2.0.0"
  }
}
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Mock Data Fixtures

Create fixtures in `/src/test/fixtures/` for:
- databases.json
- tables.json
- columns.json
- lineageGraph.json (various sizes: small, medium, large)
- impactAnalysis.json
- searchResults.json

### MSW Handlers

```typescript
// src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import databases from '../fixtures/databases.json';
import lineageGraph from '../fixtures/lineageGraph.json';

export const handlers = [
  http.get('/api/v1/assets/databases', () => {
    return HttpResponse.json({ databases });
  }),

  http.get('/api/v1/lineage/:assetId', ({ params, request }) => {
    const url = new URL(request.url);
    const direction = url.searchParams.get('direction') || 'both';
    const maxDepth = url.searchParams.get('maxDepth') || '3';

    return HttpResponse.json({
      assetId: params.assetId,
      graph: lineageGraph,
    });
  }),
];
```

---

## Test Execution Priority

### P0 - Critical (Must pass for release)
- TC-COMP-001 through TC-COMP-015 (Core component rendering)
- TC-INT-001 through TC-INT-010 (API integration)
- TC-E2E-001 through TC-E2E-010 (Core user flows)
- TC-STATE-001 through TC-STATE-011 (State management)

### P1 - High (Should pass for release)
- TC-UNIT-001 through TC-UNIT-012 (Utility functions)
- TC-COMP-016 through TC-COMP-035 (Extended components)
- TC-HOOK-001 through TC-HOOK-012 (Custom hooks)
- TC-GRAPH-001 through TC-GRAPH-017 (Graph rendering)
- TC-A11Y-001 through TC-A11Y-010 (Accessibility)

### P2 - Medium (Nice to have for release)
- TC-E2E-011 through TC-E2E-019 (Extended E2E flows)
- TC-VIS-001 through TC-VIS-008 (Visual regression)
- TC-PERF-001 through TC-PERF-005 (Performance)

---

## Appendix: Test Data Requirements

### Minimum Test Database
- 3 databases
- 5 tables per database
- 10 columns per table
- Lineage edges connecting columns across tables

### Complex Lineage Scenarios
1. **Linear chain**: A -> B -> C -> D
2. **Diamond pattern**: A -> B, A -> C, B -> D, C -> D
3. **Fan-out**: A -> B, A -> C, A -> D, A -> E
4. **Fan-in**: A -> E, B -> E, C -> E, D -> E
5. **Mixed complexity**: combination of above
6. **Cycle (for edge case)**: A -> B -> C -> A (should be handled gracefully)

### Graph Size Scenarios
1. **Small**: 5 nodes, 4 edges
2. **Medium**: 50 nodes, 60 edges
3. **Large**: 100+ nodes, 150+ edges (should show warning)
4. **Empty**: 1 node, 0 edges (isolated column)

---

## Test Metrics and Coverage Targets

| Category | Target Coverage |
|----------|-----------------|
| Utility Functions | 100% |
| Custom Hooks | 90% |
| Components | 85% |
| Integration (API) | 90% |
| E2E Critical Paths | 100% |
| Accessibility | 100% WCAG AA |
