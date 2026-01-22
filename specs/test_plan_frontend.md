# Data Lineage Frontend - Comprehensive Test Plan

## Overview

This test plan covers the React frontend application for the Data Lineage visualization tool. The application uses React, React Flow with ELKjs for graph visualization, TanStack Query for server state, and Zustand for client state management.

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
| **Expected Results** | - Short label returns minimum width of 150<br>- Long label returns calculated width (label.length * 8 + 40) |

#### TC-UNIT-002: getNodeHeight Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-002 |
| **Description** | Verify getNodeHeight returns correct height based on node type |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create a column type LineageNode<br>2. Call getNodeHeight<br>3. Create a table type LineageNode<br>4. Call getNodeHeight |
| **Expected Results** | - Column node returns height of 40<br>- Table node returns height of 60 |

#### TC-UNIT-003: getNodeLabel Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-003 |
| **Description** | Verify getNodeLabel returns correctly formatted labels for different node types |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create column node with databaseName="db1", tableName="table1", columnName="col1"<br>2. Call getNodeLabel<br>3. Create table node with databaseName="db1", tableName="table1"<br>4. Call getNodeLabel<br>5. Create database node with databaseName="db1"<br>6. Call getNodeLabel |
| **Expected Results** | - Column node returns "table1.col1"<br>- Table node returns "db1.table1"<br>- Database node returns "db1" |

#### TC-UNIT-004: getEdgeColor Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-004 |
| **Description** | Verify getEdgeColor returns correct colors for different transformation types |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create edge with transformationType="DIRECT"<br>2. Create edge with transformationType="AGGREGATION"<br>3. Create edge with transformationType="CALCULATION"<br>4. Create edge with no transformationType |
| **Expected Results** | - DIRECT returns "#10b981" (green)<br>- AGGREGATION returns "#f59e0b" (amber)<br>- CALCULATION returns "#8b5cf6" (purple)<br>- Default returns "#64748b" (slate) |

#### TC-UNIT-005: groupByTable Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-005 |
| **Description** | Verify groupByTable correctly groups column nodes by their parent table |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Create array of column nodes from different tables<br>2. Call groupByTable<br>3. Verify the returned Map structure |
| **Expected Results** | - Returns Map with keys in format "databaseName.tableName"<br>- Each key maps to array of column nodes belonging to that table<br>- Non-column nodes are excluded |

#### TC-UNIT-006: getReactFlowNodeType Function
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-006 |
| **Description** | Verify getReactFlowNodeType maps LineageNode types to React Flow node types |
| **Preconditions** | layoutEngine.ts utility module is available |
| **Test Steps** | 1. Call with column type node<br>2. Call with table type node<br>3. Call with database type node |
| **Expected Results** | - Column returns "columnNode"<br>- Table returns "tableNode"<br>- Database returns "databaseNode" |

### 1.2 TypeScript Type Validation

#### TC-UNIT-007: Database Interface Validation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-007 |
| **Description** | Verify Database interface accepts valid objects and rejects invalid ones |
| **Preconditions** | TypeScript compilation environment |
| **Test Steps** | 1. Create object with required fields (id, name)<br>2. Create object with all optional fields<br>3. Create object missing required field |
| **Expected Results** | - Valid objects pass type checking<br>- Missing required fields cause compilation error |

#### TC-UNIT-008: LineageNode Interface Validation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-008 |
| **Description** | Verify LineageNode interface enforces correct type discriminator |
| **Preconditions** | TypeScript compilation environment |
| **Test Steps** | 1. Create node with type="column"<br>2. Create node with type="table"<br>3. Create node with type="database"<br>4. Create node with invalid type |
| **Expected Results** | - Valid types compile successfully<br>- Invalid type causes compilation error |

#### TC-UNIT-009: ImpactedAsset Interface Validation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-UNIT-009 |
| **Description** | Verify ImpactedAsset interface validates impactType discriminator |
| **Preconditions** | TypeScript compilation environment |
| **Test Steps** | 1. Create ImpactedAsset with impactType="direct"<br>2. Create ImpactedAsset with impactType="indirect"<br>3. Create ImpactedAsset with invalid impactType |
| **Expected Results** | - "direct" and "indirect" compile<br>- Invalid impactType causes error |

---

## 2. Component Tests

### 2.1 AssetBrowser Component

#### TC-COMP-001: AssetBrowser Initial Render
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-001 |
| **Description** | Verify AssetBrowser renders loading state initially and displays database list |
| **Preconditions** | Mock useDatabases hook, render AssetBrowser component |
| **Test Steps** | 1. Render AssetBrowser with loading state<br>2. Wait for data to load<br>3. Verify database list is displayed |
| **Expected Results** | - LoadingSpinner displays during loading<br>- "Databases" heading is visible<br>- Database items render with Database icon |

#### TC-COMP-002: AssetBrowser Database Expansion
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-002 |
| **Description** | Verify clicking a database expands to show tables |
| **Preconditions** | AssetBrowser rendered with mock database data |
| **Test Steps** | 1. Click on a database item<br>2. Verify tables are fetched<br>3. Verify table list is displayed<br>4. Click database again to collapse |
| **Expected Results** | - ChevronRight changes to ChevronDown on expand<br>- Tables are displayed under the database<br>- ChevronDown changes back to ChevronRight on collapse |

#### TC-COMP-003: AssetBrowser Table Expansion
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-003 |
| **Description** | Verify clicking a table expands to show columns |
| **Preconditions** | AssetBrowser with expanded database showing tables |
| **Test Steps** | 1. Click on a table item<br>2. Verify columns are fetched<br>3. Verify column list is displayed with type information |
| **Expected Results** | - Columns are displayed with column name and type<br>- Columns icon is purple colored<br>- Column type appears in smaller, lighter text |

#### TC-COMP-004: AssetBrowser Column Selection
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-004 |
| **Description** | Verify clicking a column calls setSelectedAssetId |
| **Preconditions** | AssetBrowser with expanded table showing columns, mock useLineageStore |
| **Test Steps** | 1. Click on a column item<br>2. Verify setSelectedAssetId is called with correct column id |
| **Expected Results** | - setSelectedAssetId is called once<br>- Called with the correct column.id value |

### 2.2 LineageGraph Component

#### TC-COMP-005: LineageGraph Loading State
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-005 |
| **Description** | Verify LineageGraph displays loading spinner while fetching data |
| **Preconditions** | Mock useLineage hook to return loading state |
| **Test Steps** | 1. Render LineageGraph with assetId<br>2. Verify loading spinner is displayed |
| **Expected Results** | - LoadingSpinner component is rendered<br>- Container has flex centering classes |

#### TC-COMP-006: LineageGraph Error State
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-006 |
| **Description** | Verify LineageGraph displays error message on API failure |
| **Preconditions** | Mock useLineage hook to return error |
| **Test Steps** | 1. Render LineageGraph with assetId<br>2. Mock API error response<br>3. Verify error message is displayed |
| **Expected Results** | - Error message "Failed to load lineage: [error]" is visible<br>- Text has red color styling |

#### TC-COMP-007: LineageGraph Successful Render
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-007 |
| **Description** | Verify LineageGraph renders ReactFlow with nodes and edges |
| **Preconditions** | Mock useLineage hook with valid graph data |
| **Test Steps** | 1. Render LineageGraph with assetId<br>2. Wait for layout to complete<br>3. Verify ReactFlow component renders<br>4. Verify nodes and edges are present |
| **Expected Results** | - ReactFlow component is rendered<br>- Background, Controls, and MiniMap are visible<br>- Nodes are positioned according to ELK layout |

#### TC-COMP-008: LineageGraph Node Hover Highlighting
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-008 |
| **Description** | Verify hovering over a node highlights connected nodes |
| **Preconditions** | LineageGraph rendered with multiple connected nodes |
| **Test Steps** | 1. Simulate mouse enter on a node<br>2. Verify setHighlightedNodeIds is called<br>3. Simulate mouse leave<br>4. Verify highlighting is cleared |
| **Expected Results** | - On hover: highlighted set contains node and its connected nodes<br>- On leave: highlighted set is empty |

### 2.3 ColumnNode Component

#### TC-COMP-009: ColumnNode Default Render
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-009 |
| **Description** | Verify ColumnNode renders with correct structure and styling |
| **Preconditions** | Mock useLineageStore with default state |
| **Test Steps** | 1. Render ColumnNode with data prop<br>2. Verify database.table label is displayed<br>3. Verify column name is displayed<br>4. Verify handles are present |
| **Expected Results** | - Database and table name shown in smaller text<br>- Column name shown in medium font weight<br>- Left (target) and right (source) handles present<br>- Default border is slate-300 |

#### TC-COMP-010: ColumnNode Selected State
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-010 |
| **Description** | Verify ColumnNode displays selected styling when selectedAssetId matches |
| **Preconditions** | Mock useLineageStore with selectedAssetId matching node id |
| **Test Steps** | 1. Render ColumnNode with id matching selectedAssetId<br>2. Verify selected styling is applied |
| **Expected Results** | - Background is blue-100<br>- Border is blue-500<br>- Ring-2 with blue-300 is applied |

#### TC-COMP-011: ColumnNode Highlighted State
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-011 |
| **Description** | Verify ColumnNode displays highlighted styling when in highlightedNodeIds |
| **Preconditions** | Mock useLineageStore with highlightedNodeIds containing node id |
| **Test Steps** | 1. Render ColumnNode with id in highlightedNodeIds set<br>2. Verify highlighted styling is applied |
| **Expected Results** | - Background is blue-50<br>- Border is blue-400 |

### 2.4 TableNode Component

#### TC-COMP-012: TableNode Render
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-012 |
| **Description** | Verify TableNode renders with correct structure |
| **Preconditions** | None |
| **Test Steps** | 1. Render TableNode with data prop<br>2. Verify database name is displayed<br>3. Verify table name is displayed in bold<br>4. Verify handles are present |
| **Expected Results** | - Database name in smaller text<br>- Table name in semibold font<br>- Border is slate-400<br>- Background is slate-100 |

### 2.5 Layout Components

#### TC-COMP-013: AppShell Sidebar Toggle
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-013 |
| **Description** | Verify AppShell shows/hides sidebar based on sidebarOpen state |
| **Preconditions** | Mock useUIStore |
| **Test Steps** | 1. Render AppShell with sidebarOpen=true<br>2. Verify Sidebar is visible<br>3. Mock sidebarOpen=false<br>4. Verify Sidebar is hidden |
| **Expected Results** | - Sidebar renders when sidebarOpen is true<br>- Sidebar not rendered when sidebarOpen is false |

#### TC-COMP-014: Header Search Submission
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-014 |
| **Description** | Verify Header search form navigates to search page with query |
| **Preconditions** | Mock useNavigate and useUIStore |
| **Test Steps** | 1. Enter search query in input<br>2. Submit the form<br>3. Verify navigation occurs |
| **Expected Results** | - Navigate called with "/search?q=[encoded query]"<br>- Empty/whitespace query does not navigate |

#### TC-COMP-015: Sidebar Navigation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-COMP-015 |
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
| **Expected Results** | - direction=both (default)<br>- maxDepth=5 (default)<br>- Correct URL encoding of assetId |

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

## 4. End-to-End User Flow Tests

### 4.1 Navigation Flows

#### TC-E2E-001: Initial Application Load
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-001 |
| **Description** | Verify application loads and displays ExplorePage |
| **Preconditions** | Application running, backend available |
| **Test Steps** | 1. Navigate to root URL (/)<br>2. Wait for page to load<br>3. Verify ExplorePage components are visible |
| **Expected Results** | - Sidebar is visible<br>- Header is visible<br>- AssetBrowser panel is displayed<br>- "Select a column to view its lineage" placeholder shown |

#### TC-E2E-002: Navigate to Lineage Page via URL
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-002 |
| **Description** | Verify direct navigation to lineage page with assetId |
| **Preconditions** | Application running, valid assetId |
| **Test Steps** | 1. Navigate to /lineage/{assetId}<br>2. Wait for lineage data to load<br>3. Verify LineagePage is displayed |
| **Expected Results** | - Header shows "Lineage: {assetId}"<br>- Depth and Direction controls are visible<br>- LineageGraph renders with nodes |

#### TC-E2E-003: Navigate to Impact Page
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-003 |
| **Description** | Verify navigation to impact analysis page |
| **Preconditions** | Application running, valid assetId |
| **Test Steps** | 1. Navigate to /impact/{assetId}<br>2. Wait for impact data to load<br>3. Verify ImpactPage is displayed |
| **Expected Results** | - Impact analysis data is displayed<br>- Summary statistics are visible |

#### TC-E2E-004: Search Navigation Flow
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-004 |
| **Description** | Verify search from header navigates to search page |
| **Preconditions** | Application running |
| **Test Steps** | 1. Enter search query in header input<br>2. Press Enter or submit form<br>3. Verify navigation to /search |
| **Expected Results** | - URL changes to /search?q={query}<br>- SearchPage is displayed<br>- Search results are fetched and displayed |

### 4.2 Asset Selection Flows

#### TC-E2E-005: Browse and Select Column
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-005 |
| **Description** | Verify full flow of browsing to and selecting a column |
| **Preconditions** | Application running with populated database |
| **Test Steps** | 1. Click on a database in AssetBrowser<br>2. Wait for tables to load<br>3. Click on a table<br>4. Wait for columns to load<br>5. Click on a column |
| **Expected Results** | - Each level expands to show children<br>- Clicking column triggers lineage load<br>- LineageGraph displays for selected column |

#### TC-E2E-006: Change Lineage Direction
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-006 |
| **Description** | Verify changing direction updates lineage graph |
| **Preconditions** | LineagePage displayed with asset selected |
| **Test Steps** | 1. Select "Upstream Only" from direction dropdown<br>2. Wait for graph to update<br>3. Select "Downstream Only"<br>4. Wait for graph to update |
| **Expected Results** | - Graph refetches with new direction<br>- Nodes change based on direction<br>- Layout recalculates |

#### TC-E2E-007: Change Lineage Depth
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-007 |
| **Description** | Verify changing depth updates lineage graph |
| **Preconditions** | LineagePage displayed with asset selected |
| **Test Steps** | 1. Change depth from 5 to 10<br>2. Wait for graph to update<br>3. Change depth to 1<br>4. Wait for graph to update |
| **Expected Results** | - Increasing depth may show more nodes<br>- Decreasing depth shows fewer nodes<br>- Graph re-layouts after each change |

### 4.3 Search Flows

#### TC-E2E-008: Search for Table
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-008 |
| **Description** | Verify searching for a table returns relevant results |
| **Preconditions** | Application running, searchable data exists |
| **Test Steps** | 1. Navigate to /search<br>2. Enter table name in search<br>3. Wait for results<br>4. Verify table appears in results |
| **Expected Results** | - Search results display<br>- Results show type indicator (table)<br>- Results show database and table name |

#### TC-E2E-009: Search Result Selection
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-E2E-009 |
| **Description** | Verify clicking search result navigates to lineage view |
| **Preconditions** | Search results displayed |
| **Test Steps** | 1. Click on a search result<br>2. Verify navigation occurs<br>3. Verify lineage is displayed |
| **Expected Results** | - Navigation to lineage view for selected asset<br>- LineageGraph loads and displays |

---

## 5. Graph Rendering Tests

### 5.1 ELKjs Layout Tests

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
| **Description** | Verify ELK layout respects nodeSpacing option |
| **Preconditions** | layoutGraph function available |
| **Test Steps** | 1. Call layoutGraph with nodeSpacing=50<br>2. Measure spacing between nodes in same layer<br>3. Call layoutGraph with nodeSpacing=100<br>4. Measure spacing again |
| **Expected Results** | - Nodes in same layer have minimum spacing as specified<br>- Increased spacing results in larger gaps |

#### TC-GRAPH-003: Layer Spacing
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-003 |
| **Description** | Verify ELK layout respects layerSpacing option |
| **Preconditions** | layoutGraph function available |
| **Test Steps** | 1. Call layoutGraph with layerSpacing=150<br>2. Measure distance between layers<br>3. Call layoutGraph with layerSpacing=300<br>4. Measure distance again |
| **Expected Results** | - Distance between connected nodes in different layers matches layerSpacing |

#### TC-GRAPH-004: Complex Graph Layout
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-004 |
| **Description** | Verify ELK handles complex DAG with multiple paths |
| **Preconditions** | Graph with diamond pattern (A->B, A->C, B->D, C->D) |
| **Test Steps** | 1. Create nodes and edges for diamond pattern<br>2. Call layoutGraph<br>3. Verify no node overlaps<br>4. Verify edges don't cross unnecessarily |
| **Expected Results** | - All nodes have unique positions<br>- No visual overlaps between nodes<br>- Edge crossing is minimized |

### 5.2 Node Rendering Tests

#### TC-GRAPH-005: React Flow Node Types Registration
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-005 |
| **Description** | Verify custom node types are correctly registered |
| **Preconditions** | LineageGraph component |
| **Test Steps** | 1. Render LineageGraph with column and table nodes<br>2. Verify ColumnNode renders for column type<br>3. Verify TableNode renders for table type |
| **Expected Results** | - columnNode type uses ColumnNode component<br>- tableNode type uses TableNode component |

#### TC-GRAPH-006: Node Position Updates
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-006 |
| **Description** | Verify nodes can be dragged and positions update |
| **Preconditions** | LineageGraph rendered with nodes |
| **Test Steps** | 1. Drag a node to new position<br>2. Verify onNodesChange is called<br>3. Verify node position updates |
| **Expected Results** | - Node visually moves during drag<br>- Position state updates after drag |

### 5.3 Edge Rendering Tests

#### TC-GRAPH-007: Edge Animation for Low Confidence
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-007 |
| **Description** | Verify edges with low confidence score are animated |
| **Preconditions** | Edge with confidenceScore < 0.8 |
| **Test Steps** | 1. Create edge with confidenceScore=0.5<br>2. Call layoutGraph<br>3. Verify edge has animated=true |
| **Expected Results** | - Edge with score < 0.8 has animated property true<br>- Edge with score >= 0.8 has animated false |

#### TC-GRAPH-008: Edge Arrow Markers
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-008 |
| **Description** | Verify edges have correct arrow markers |
| **Preconditions** | Edges created by layoutGraph |
| **Test Steps** | 1. Create edges with different transformation types<br>2. Call layoutGraph<br>3. Verify markerEnd configuration |
| **Expected Results** | - All edges have markerEnd with type="arrowclosed"<br>- Arrow color matches edge stroke color |

### 5.4 Zoom and Pan Tests

#### TC-GRAPH-009: Zoom Limits
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-009 |
| **Description** | Verify zoom is constrained to minZoom/maxZoom |
| **Preconditions** | LineageGraph rendered |
| **Test Steps** | 1. Zoom out to minimum<br>2. Verify cannot zoom below 0.1<br>3. Zoom in to maximum<br>4. Verify cannot zoom above 2 |
| **Expected Results** | - Zoom stops at minZoom=0.1<br>- Zoom stops at maxZoom=2 |

#### TC-GRAPH-010: Fit View on Load
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-010 |
| **Description** | Verify graph fits to view with padding on initial load |
| **Preconditions** | LineageGraph component |
| **Test Steps** | 1. Render LineageGraph with nodes<br>2. Verify fitView is applied<br>3. Verify padding is 0.2 |
| **Expected Results** | - All nodes visible in viewport<br>- Appropriate padding around graph |

#### TC-GRAPH-011: Pan Functionality
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-011 |
| **Description** | Verify graph can be panned by dragging background |
| **Preconditions** | LineageGraph rendered with nodes |
| **Test Steps** | 1. Click and drag on background<br>2. Verify viewport moves<br>3. Release and verify position persists |
| **Expected Results** | - Viewport scrolls with drag<br>- Nodes maintain relative positions |

### 5.5 MiniMap Tests

#### TC-GRAPH-012: MiniMap Node Colors
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-GRAPH-012 |
| **Description** | Verify MiniMap shows selected node in different color |
| **Preconditions** | LineageGraph with selected asset |
| **Test Steps** | 1. Render LineageGraph with assetId<br>2. Examine MiniMap node colors |
| **Expected Results** | - Selected node (matching assetId) is blue (#3b82f6)<br>- Other nodes are slate (#94a3b8) |

---

## 6. State Management Tests

### 6.1 useLineageStore Tests

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
| **Expected Results** | - maxDepth updates from default 5<br>- direction updates from default "both" |

#### TC-STATE-004: toggleTableExpanded
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-004 |
| **Description** | Verify toggleTableExpanded adds/removes table from expanded set |
| **Preconditions** | useLineageStore available |
| **Test Steps** | 1. Call toggleTableExpanded("table1")<br>2. Verify table1 is in expandedTables<br>3. Call toggleTableExpanded("table1") again<br>4. Verify table1 is removed |
| **Expected Results** | - First call adds to Set<br>- Second call removes from Set |

#### TC-STATE-005: setHighlightedNodeIds
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-005 |
| **Description** | Verify setHighlightedNodeIds updates highlighted set |
| **Preconditions** | useLineageStore available |
| **Test Steps** | 1. Create Set with node ids<br>2. Call setHighlightedNodeIds(set)<br>3. Verify state updated<br>4. Call with empty Set<br>5. Verify cleared |
| **Expected Results** | - highlightedNodeIds matches provided Set<br>- Empty set clears highlighting |

### 6.2 useUIStore Tests

#### TC-STATE-006: toggleSidebar
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-006 |
| **Description** | Verify toggleSidebar toggles sidebarOpen state |
| **Preconditions** | useUIStore available |
| **Test Steps** | 1. Get initial sidebarOpen (true)<br>2. Call toggleSidebar<br>3. Verify sidebarOpen is false<br>4. Call toggleSidebar again<br>5. Verify sidebarOpen is true |
| **Expected Results** | - Each call inverts the boolean value |

#### TC-STATE-007: setSidebarOpen
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-007 |
| **Description** | Verify setSidebarOpen sets explicit value |
| **Preconditions** | useUIStore available |
| **Test Steps** | 1. Call setSidebarOpen(false)<br>2. Verify sidebarOpen is false<br>3. Call setSidebarOpen(true)<br>4. Verify sidebarOpen is true |
| **Expected Results** | - Direct value assignment works |

#### TC-STATE-008: setSearchQuery
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-008 |
| **Description** | Verify setSearchQuery updates search state |
| **Preconditions** | useUIStore available |
| **Test Steps** | 1. Call setSearchQuery("test query")<br>2. Verify searchQuery updated<br>3. Call setSearchQuery("")<br>4. Verify searchQuery is empty |
| **Expected Results** | - searchQuery updates to provided string |

### 6.3 Store Persistence and Reset

#### TC-STATE-009: Store Independence
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-009 |
| **Description** | Verify useLineageStore and useUIStore are independent |
| **Preconditions** | Both stores available |
| **Test Steps** | 1. Update useLineageStore state<br>2. Verify useUIStore unchanged<br>3. Update useUIStore state<br>4. Verify useLineageStore unchanged |
| **Expected Results** | - Changes to one store don't affect other |

#### TC-STATE-010: Store Subscription
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-STATE-010 |
| **Description** | Verify components re-render on store updates |
| **Preconditions** | Component using useLineageStore |
| **Test Steps** | 1. Render component with store selector<br>2. Update selected state<br>3. Verify component re-renders |
| **Expected Results** | - Component updates when subscribed state changes<br>- Component doesn't update for unsubscribed state changes |

---

## 7. Accessibility and Responsive Design Tests

### 7.1 Keyboard Navigation

#### TC-A11Y-001: AssetBrowser Keyboard Navigation
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-001 |
| **Description** | Verify AssetBrowser can be navigated with keyboard |
| **Preconditions** | AssetBrowser rendered |
| **Test Steps** | 1. Tab to first database<br>2. Press Enter to expand<br>3. Tab to table<br>4. Press Enter to expand<br>5. Tab to column<br>6. Press Enter to select |
| **Expected Results** | - All items are focusable<br>- Enter activates items<br>- Focus is visible |

#### TC-A11Y-002: Header Search Focus
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-002 |
| **Description** | Verify search input is keyboard accessible |
| **Preconditions** | Header rendered |
| **Test Steps** | 1. Tab to search input<br>2. Type query<br>3. Press Enter to submit |
| **Expected Results** | - Input receives focus<br>- Typing works<br>- Enter submits form |

#### TC-A11Y-003: Sidebar Navigation Focus
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-003 |
| **Description** | Verify sidebar links are keyboard navigable |
| **Preconditions** | Sidebar rendered |
| **Test Steps** | 1. Tab through sidebar links<br>2. Press Enter on link<br>3. Verify navigation |
| **Expected Results** | - Each NavLink is focusable<br>- Enter activates navigation<br>- Active state is visible |

#### TC-A11Y-004: Dropdown Controls
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-004 |
| **Description** | Verify LineagePage dropdowns are keyboard accessible |
| **Preconditions** | LineagePage rendered |
| **Test Steps** | 1. Tab to Depth dropdown<br>2. Use arrow keys to change value<br>3. Tab to Direction dropdown<br>4. Use arrow keys to change value |
| **Expected Results** | - Dropdowns are focusable<br>- Arrow keys navigate options<br>- Selection updates on change |

### 7.2 Screen Reader Support

#### TC-A11Y-005: Semantic HTML Structure
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-005 |
| **Description** | Verify proper semantic HTML elements are used |
| **Preconditions** | Application rendered |
| **Test Steps** | 1. Inspect DOM structure<br>2. Verify header uses <header><br>3. Verify navigation uses <nav><br>4. Verify main content uses <main><br>5. Verify sidebar uses <aside> |
| **Expected Results** | - Semantic elements used appropriately<br>- Landmarks are properly defined |

#### TC-A11Y-006: Button Labels
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-006 |
| **Description** | Verify icon-only buttons have accessible labels |
| **Preconditions** | Components rendered |
| **Test Steps** | 1. Check sidebar toggle button<br>2. Check sidebar navigation icons<br>3. Verify aria-label or title attributes |
| **Expected Results** | - Icon buttons have title attribute<br>- Screen readers can announce button purpose |

#### TC-A11Y-007: Loading State Announcements
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-007 |
| **Description** | Verify loading states are announced to screen readers |
| **Preconditions** | Component in loading state |
| **Test Steps** | 1. Trigger loading state<br>2. Check for aria-live region<br>3. Verify loading announcement |
| **Expected Results** | - Loading spinner has role="status" or aria-live<br>- Screen reader announces loading |

#### TC-A11Y-008: Error Messages
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-008 |
| **Description** | Verify error messages are accessible |
| **Preconditions** | Error state triggered |
| **Test Steps** | 1. Trigger API error<br>2. Verify error message is announced<br>3. Check for role="alert" |
| **Expected Results** | - Error messages use appropriate ARIA roles<br>- Screen readers announce errors |

### 7.3 Color Contrast

#### TC-A11Y-009: Text Contrast Ratios
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-009 |
| **Description** | Verify text meets WCAG AA contrast requirements |
| **Preconditions** | Application rendered |
| **Test Steps** | 1. Test slate-700 text on white (#334155 on #ffffff)<br>2. Test slate-500 text on white (#64748b on #ffffff)<br>3. Test slate-400 text on white (#94a3b8 on #ffffff)<br>4. Test white text on slate-900 |
| **Expected Results** | - Primary text has >= 4.5:1 contrast ratio<br>- Large text has >= 3:1 contrast ratio |

#### TC-A11Y-010: Focus Indicator Visibility
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-A11Y-010 |
| **Description** | Verify focus indicators are visible |
| **Preconditions** | Interactive elements rendered |
| **Test Steps** | 1. Tab through interactive elements<br>2. Verify focus ring is visible<br>3. Check contrast against background |
| **Expected Results** | - Focus ring visible on all interactive elements<br>- Ring color contrasts with background |

### 7.4 Responsive Design

#### TC-RESP-001: Mobile Viewport (320px)
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-RESP-001 |
| **Description** | Verify application usable at minimum mobile width |
| **Preconditions** | Application running |
| **Test Steps** | 1. Set viewport to 320px width<br>2. Verify sidebar can be toggled<br>3. Verify main content is accessible<br>4. Verify no horizontal scroll |
| **Expected Results** | - UI remains functional<br>- Content doesn't overflow horizontally<br>- Touch targets are adequate size |

#### TC-RESP-002: Tablet Viewport (768px)
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-RESP-002 |
| **Description** | Verify layout adapts to tablet width |
| **Preconditions** | Application running |
| **Test Steps** | 1. Set viewport to 768px width<br>2. Verify sidebar behavior<br>3. Verify AssetBrowser width<br>4. Verify graph area sizing |
| **Expected Results** | - Layout uses available space effectively<br>- Sidebar may auto-collapse or resize |

#### TC-RESP-003: Desktop Viewport (1920px)
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-RESP-003 |
| **Description** | Verify layout works on large displays |
| **Preconditions** | Application running |
| **Test Steps** | 1. Set viewport to 1920px width<br>2. Verify content doesn't stretch excessively<br>3. Verify graph has adequate space |
| **Expected Results** | - Content has maximum width constraints where appropriate<br>- Graph area uses full available space |

#### TC-RESP-004: Height Constraints
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-RESP-004 |
| **Description** | Verify application handles limited viewport height |
| **Preconditions** | Application running |
| **Test Steps** | 1. Set viewport height to 600px<br>2. Verify AssetBrowser scrolls internally<br>3. Verify graph area fills available space |
| **Expected Results** | - Internal scroll for overflow content<br>- No content cut off without scroll |

#### TC-RESP-005: Orientation Change
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-RESP-005 |
| **Description** | Verify application handles orientation change |
| **Preconditions** | Application in mobile/tablet emulation |
| **Test Steps** | 1. Start in portrait orientation<br>2. Rotate to landscape<br>3. Verify layout updates<br>4. Verify graph re-fits |
| **Expected Results** | - Layout adapts to new dimensions<br>- Graph fitView updates |

---

## 8. Performance Tests

### 8.1 Graph Performance

#### TC-PERF-001: Large Graph Rendering
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-001 |
| **Description** | Verify graph renders efficiently with 100+ nodes |
| **Preconditions** | Test data with 100+ nodes and edges |
| **Test Steps** | 1. Load lineage with 100+ nodes<br>2. Measure initial render time<br>3. Test pan and zoom responsiveness |
| **Expected Results** | - Initial render < 3 seconds<br>- Pan/zoom maintains 30+ FPS<br>- No significant jank |

#### TC-PERF-002: Layout Calculation Time
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-002 |
| **Description** | Verify ELK layout completes in reasonable time |
| **Preconditions** | Various graph sizes |
| **Test Steps** | 1. Measure layout time for 10 nodes<br>2. Measure layout time for 50 nodes<br>3. Measure layout time for 100 nodes |
| **Expected Results** | - 10 nodes: < 100ms<br>- 50 nodes: < 500ms<br>- 100 nodes: < 2000ms |

### 8.2 API Performance

#### TC-PERF-003: Query Caching Effectiveness
| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-PERF-003 |
| **Description** | Verify TanStack Query caching reduces API calls |
| **Preconditions** | Application running with network monitoring |
| **Test Steps** | 1. Load database list<br>2. Navigate away and back<br>3. Monitor network requests |
| **Expected Results** | - Second visit uses cached data<br>- No duplicate API calls within staleTime |

---

## Test Environment Requirements

### Dependencies for Testing
- Vitest (specified in package.json)
- @testing-library/react
- @testing-library/jest-dom
- @testing-library/user-event
- msw (Mock Service Worker) for API mocking
- @axe-core/react for accessibility testing

### Test Configuration
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

### Mock Data Fixtures
Create fixtures in `/src/test/fixtures/` for:
- databases.json
- tables.json
- columns.json
- lineageGraph.json
- impactAnalysis.json
- searchResults.json

---

## Test Execution Priority

### P0 - Critical (Must pass for release)
- TC-COMP-001 through TC-COMP-008 (Core component rendering)
- TC-INT-001 through TC-INT-008 (API integration)
- TC-E2E-001 through TC-E2E-005 (Core user flows)
- TC-STATE-001 through TC-STATE-008 (State management)

### P1 - High (Should pass for release)
- TC-UNIT-001 through TC-UNIT-009 (Utility functions)
- TC-GRAPH-001 through TC-GRAPH-012 (Graph rendering)
- TC-A11Y-001 through TC-A11Y-008 (Accessibility)

### P2 - Medium (Nice to have for release)
- TC-E2E-006 through TC-E2E-009 (Extended user flows)
- TC-RESP-001 through TC-RESP-005 (Responsive design)
- TC-PERF-001 through TC-PERF-003 (Performance)

### P3 - Low (Can be deferred)
- TC-A11Y-009, TC-A11Y-010 (Advanced accessibility)

---

## Appendix: Test Data Requirements

### Minimum Test Database
- 3 databases
- 5 tables per database
- 10 columns per table
- Lineage edges connecting columns across tables

### Complex Lineage Scenarios
1. Linear chain (A -> B -> C -> D)
2. Diamond pattern (A -> B, A -> C, B -> D, C -> D)
3. Fan-out (A -> B, A -> C, A -> D, A -> E)
4. Fan-in (A -> E, B -> E, C -> E, D -> E)
5. Mixed complexity (combination of above)
