# Data Lineage Application User Guide

A comprehensive guide for using the column-level data lineage application for Teradata databases.

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Using the Application](#using-the-application)
4. [Common Tasks](#common-tasks)
5. [Troubleshooting](#troubleshooting)
6. [Glossary](#glossary)

---

## Introduction

### What is Data Lineage?

Data lineage tracks the flow of data from its source to its destination, showing how data is transformed along the way. This application provides **column-level lineage**, meaning you can trace individual columns through your data pipelines.

### Key Capabilities

- **Asset Browsing**: Explore databases, tables, and columns hierarchically
- **Lineage Visualization**: Interactive graphs showing data relationships
- **Impact Analysis**: Assess downstream effects before making changes
- **Search**: Find assets across your entire Teradata environment
- **Wildcard Expansion**: Automatically resolve `SELECT *`, `t1.*`, and view wildcards to actual column names
- **View Lineage**: Trace data flow through views to their underlying source tables

### Use Cases

| Use Case | Description |
|----------|-------------|
| Change Impact Analysis | Before modifying a source column, see all affected downstream tables |
| Root Cause Analysis | Trace data quality issues back to their source |
| Regulatory Compliance | Document PII data flows for audits |
| Data Governance | Understand how business metrics are calculated |

---

## Core Concepts

### Assets

Assets are the objects tracked in the lineage system:

| Asset Type | Description | Example |
|------------|-------------|---------|
| Database | A Teradata database | `SALES_DW` |
| Table | A table or view | `DIM_CUSTOMER` |
| Column | An individual column | `customer_id` |

Each asset has a unique identifier in the format: `database.table.column`

### Lineage Relationships

A lineage relationship connects a **source column** to a **target column**:

```
Source Column ────► Target Column
   (origin)      (transformation)     (destination)
```

Relationships include:
- **Transformation Type**: Direct copy, concatenation, aggregation, calculation, etc.
- **Confidence Score**: How certain the system is about the relationship (0.0-1.0)
- **Query ID**: The query that created the relationship

**Confidence Score Levels:**

| Score | Source | Description |
|-------|--------|-------------|
| 0.95 | Explicit column references | Columns named directly in SQL |
| 0.85 | Expression-derived | Columns derived from SQL expressions |
| 0.80 | View calculation | Columns derived from expressions in view definitions |
| 0.70 | Wildcard-expanded | Columns resolved from `SELECT *` or `t1.*` patterns |

### Lineage Direction

| Direction | Description | Use Case |
|-----------|-------------|----------|
| **Upstream** | Where data comes from | Root cause analysis |
| **Downstream** | Where data flows to | Impact analysis |
| **Both** | Full bidirectional view | Complete understanding |

### Traversal Depth

Depth controls how many levels of relationships to traverse:

- **Depth 1**: Direct relationships only
- **Depth 5**: Five levels of relationships (default)
- **Depth 10**: Maximum depth for complex pipelines

---

## Using the Application

### Application Layout

The application has a consistent layout across all pages:

- **Header**: Top navigation bar with the "Data Lineage" title, search form, and sidebar toggle
- **Sidebar**: Left navigation with icon-based links to Explore and Search pages
- **Main Content**: The active page content

### Navigation Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Explore | Main exploration interface with asset browser and lineage graph |
| `/lineage/:assetId` | Lineage | Column or table lineage view (e.g., `/lineage/db.table.column`) |
| `/lineage/database/:dbName` | Database Lineage | All table relationships in a database with pagination |
| `/impact/:assetId` | Impact | Impact analysis view for a specific asset |
| `/search` | Search | Global search with results list |

### Asset Browser (Explore Page)

The Asset Browser provides hierarchical navigation through your data assets in the left panel of the Explore page.

![Asset Browser showing database hierarchy with expanded tables and columns](screenshots/asset-browser.png)

**Navigation Structure:**
```
Databases (blue icon)
  └── Tables/Views (green/orange/violet icons)
       └── Columns (purple icon)
```

**Tables vs Views vs Materialized Views:**

The Asset Browser visually distinguishes between different object types:

| Object Type | Icon | Badge | Color | tableKind |
|-------------|------|-------|-------|-----------|
| **Table** | Table icon | (none) | Emerald green | `T` |
| **View** | Eye icon | "VIEW" | Orange | `V` |
| **Materialized View** | Layers icon | "MVIEW" | Violet | `M` |

Views and materialized views display a colored badge next to their name for quick identification. This distinction carries through to the lineage graph, where:
- **Tables** have a gray (slate-200) border
- **Views** have an orange border
- **Materialized Views** have a violet border

**Interactions:**
- Click the expand arrow on a database to see its tables and views
- Click the expand arrow on a table/view to see its columns
- Click a column name to select it and view its lineage in the right panel
- Click a table/view name (not the expand arrow) to view lineage for the entire table
- Click a database name to view database-level lineage showing all table relationships
- Data is lazy-loaded: tables load when database is expanded, columns load when table is expanded

### Lineage Graph

The Lineage Graph visualizes data relationships as an interactive directed graph using React Flow with ELKjs layout.

![Lineage graph showing column-level data flow between table nodes](screenshots/lineage-graph.png)

**Graph Elements:**

| Element | Description |
|---------|-------------|
| **Table Nodes** | White cards containing a header with `database.table` name and expandable column rows |
| **Column Rows** | Rows within table nodes showing column name, data type, and connection handles |
| **Edges** | Arrows connecting source columns to target columns, color-coded by transformation type |
| **Selected Column** | Blue border on the table node, highlighted column row |
| **Highlighted Path** | Green border on nodes in the lineage path, non-path nodes dimmed to 20% opacity |

**Table Node Structure:**

```
┌─────────────────────────────────────┐
│ ○ database_name.table_name      [▼] │  ← Header with expand/collapse
├─────────────────────────────────────┤
│ ● column_1          VARCHAR(100)    │  ← Column row with handles
│ ● column_2          INTEGER         │
│ ● column_3          TIMESTAMP       │
└─────────────────────────────────────┘
```

**Edge Colors by Transformation Type:**

| Type | Color | Hex Code |
|------|-------|----------|
| DIRECT | Green | `#22C55E` |
| DERIVED | Blue | `#3B82F6` |
| AGGREGATED | Purple | `#A855F7` |
| JOINED | Cyan | `#06B6D4` |
| CALCULATION | Violet | `#8B5CF6` |
| Unknown | Gray | `#9CA3AF` |

**Confidence-Based Styling:**

Edges display confidence levels visually:
- **90%+ confidence**: Full opacity, solid line
- **70-89% confidence**: 90% opacity
- **50-69% confidence**: 80% opacity
- **Below 50%**: 70% opacity with dashed animation

**Column Display:**

Columns within each table node are sorted alphabetically for easy scanning. This ordering is consistent across the graph and the Detail Panel.

**Interactions:**

- **Pan**: Click and drag on the background
- **Zoom**: Scroll wheel or +/- keys (range: 0.1x to 2x)
- **Select Column**: Click a column row to highlight its full lineage path
- **Select Edge**: Click an edge to view transformation details
- **Multi-Select**: Enable via the toolbar toggle button, then click nodes to add them to the selection. Drag any selected node to move the entire group together
- **Clear Selection**: Click on empty space or press Escape
- **Fit View**: Press F or use toolbar button
- **MiniMap**: Corner minimap for navigation in large graphs

**Keyboard Shortcuts:**

| Shortcut | Action |
|----------|--------|
| `Escape` | Clear selection, close panel, or exit multi-select mode |
| `F` | Fit all nodes to view |
| `+` / `-` | Zoom in / out |
| `Ctrl+F` or `/` | Focus search box |
| `Ctrl+G` | Toggle database cluster backgrounds |
| `Cmd+Click` | Add/remove node from multi-selection (when multi-select is off) |

**Note:** Fit to Selection is available via the toolbar button only (Crosshair icon) and does not have a keyboard shortcut. It differs from Fit View (F key) in that it centers only on the nodes in the highlighted lineage path rather than all nodes in the graph.

### Toolbar Controls

The lineage graph includes an advanced toolbar with the following controls:

![Toolbar with direction, depth, fit-to-selection, and export controls](screenshots/toolbar-controls.png)

| Control | Description |
|---------|-------------|
| **View Mode Toggle** | Switch between Graph view (visual) and Table view (tabular list) |
| **Search Box** | Autocomplete search for columns within the current lineage graph |
| **Direction Dropdown** | Select Upstream, Downstream, or Both directions |
| **Asset Type Filter** | Filter visible nodes by type: Tables, Views, Materialized Views (checkbox dropdown). Shows "All Types", "Tables Only", "Views Only", or "{N} Types" based on selection |
| **Depth Slider** | Interactive slider to adjust traversal depth (1-10) |
| **Multi-Select Toggle** | Enable multi-select mode (MousePointerClick icon). When active, click nodes to select/deselect them, then drag to move the group. Button highlights blue when active. Press Escape to exit |
| **Fit View Button** | Fit all graph nodes within the viewport (Focus icon, or press F) |
| **Fit to Selection** | Center the viewport on the highlighted lineage path (Crosshair icon). Only active when a column is selected and its lineage path is highlighted |
| **Export Button** | Export the current lineage graph as PNG, SVG, or JSON |
| **Fullscreen Button** | Toggle fullscreen mode for the graph view |
| **Refresh Button** | Force a fresh data fetch from Teradata. The button spins while fetching |

**Search Autocomplete:**

The search box provides real-time autocomplete as you type:
- Minimum 2 characters to trigger search
- Results show column name, table path, and data type
- Use arrow keys to navigate results, Enter to select
- Selected column is highlighted and centered in view
- Press Escape to close the dropdown

### Loading Progress

When loading a lineage graph, a progress bar appears showing the current stage of processing:

![Loading progress bar showing stage and timing information](screenshots/loading-progress.png)

| Stage | Progress | Message |
|-------|----------|---------|
| Fetching | 15-30% | "Loading data..." |
| Layout | 30-70% | "Calculating layout..." |
| Rendering | 70-95% | "Rendering graph..." |

For larger graphs, timing information is displayed alongside the progress bar:
- **Elapsed time**: How long the current operation has been running (e.g., "5s", "1m 30s")
- **Estimated time remaining**: Approximate time until completion (e.g., "~10s"), shown once progress reaches at least 10%

After loading completes, a timing summary appears below the graph: "Loaded in: Fetch Xms / Layout Xms / Render Xms". This shows the duration of each processing stage, helping you understand where time is spent when loading large graphs.

The progress bar appears automatically when loading lineage data and disappears when the graph is fully rendered. A simple loading spinner is used separately in the Asset Browser sidebar for loading database/table/column lists.

### Progressive Loading

When loading column lineage, a depth-1 graph appears instantly (typically under 200ms), giving you immediate context while the full-depth graph loads in the background.

**How it works:**
- A depth-1 query is fired immediately, rendering direct upstream and downstream connections
- The full-depth query runs in the background and expands the graph automatically when complete
- A thin blue banner appears at the top of the graph: "Expanding to full depth..." during the background fetch
- Once the full graph loads, the banner disappears and the complete lineage is displayed

**Note:** Table-level lineage uses the existing single-query path (no progressive loading). Progressive loading applies only to column-level lineage queries.

### Detail Panel

When you click on a column or edge in the lineage graph, a **Detail Panel** slides in from the right side of the screen showing detailed information. Click the X button or press Escape to close the panel.

![Detail panel showing the Columns tab with column list, types, and lineage counts](screenshots/detail-panel-columns.png)

When a table or column is selected, the panel displays a breadcrumb showing the `database > table > column` path at the top, followed by a **tabbed interface** with three tabs:

#### Columns Tab (LayoutList icon)

Lists all columns in the selected table. Each column entry shows:

- **Column name** (clickable link) -- click any column name to navigate directly to that column's lineage graph. This provides a quick way to explore lineage for related columns without returning to the Asset Browser.
- **Data type** badge (e.g., `VARCHAR(100)`, `INTEGER`)
- **Nullable** badge (yellow "NULL" badge if the column allows null values)
- **Primary key** badge (green "PK" badge if the column is a primary key)
- **Description** (if available in metadata)
- **Lineage counts**: Number of upstream and downstream connections for each column

**Quick Actions** appear below each column:
- **View Full Lineage**: Highlights the complete lineage path for this column in the graph
- **Impact Analysis**: Navigate to the impact analysis page for change assessment

#### Statistics Tab (BarChart3 icon)

Shows table-level metadata fetched from the database:

| Field | Description |
|-------|-------------|
| **Type** | Table, View, or Materialized View |
| **Owner** | The database user who owns the object |
| **Created** | Date the object was created |
| **Last Modified** | Date of the most recent alteration |
| **Row Count** | Number of rows (formatted with locale-appropriate separators) |
| **Size** | Storage size in human-readable format (e.g., "1.2 GB"). Shown for tables only; views do not have a size |
| **Comment** | Table comment, if one has been set in the database |

Data is loaded on demand when you switch to this tab.

![Detail panel showing the Statistics tab with table metadata](screenshots/detail-panel-statistics.png)

#### DDL Tab (Code icon)

Displays the SQL definition of the selected table or view with syntax highlighting:

- **For views**: Shows the View SQL definition (the `SELECT` statement that defines the view)
- **For tables**: Shows the `CREATE TABLE` DDL statement
- **Syntax highlighting**: SQL keywords, identifiers, and literals are color-coded using a dark theme for readability
- **Line numbers**: Each line is numbered for easy reference
- **Copy button**: Click "Copy SQL" or "Copy DDL" to copy the full definition to your clipboard (shows a "Copied" confirmation)
- **Truncation warning**: Definitions longer than 12,500 characters display a yellow warning banner noting that the SQL has been truncated
- **Column comments**: If any columns have comments defined in the database, they are listed below the SQL definition

Data is loaded on demand when you switch to this tab.

![Detail panel showing DDL with syntax highlighting](screenshots/detail-panel-ddl.png)

#### Edge/Connection Details

When an edge (connection line) is selected instead of a column, the panel displays connection details rather than the tabbed interface:
- **Source Column**: Full path of the data source (`database.table.column`)
- **Target Column**: Full path of the data destination
- **Transformation Type**: The transformation label (DIRECT, DERIVED, AGGREGATED, JOINED, etc.)
- **Confidence Score**: Visual progress bar showing confidence level (0-100%)
- **SQL**: If transformation SQL is available, it is displayed with a Copy button

### Impact Analysis

Access the Impact Analysis page by navigating to `/impact/:assetId`. This shows the effects of changes to a column, including both upstream and downstream lineage paths for comprehensive change assessment.

**Summary Cards (4 metrics):**

| Card | Description |
|------|-------------|
| Total Impacted | Number of downstream assets affected |
| Critical | Count of critical assets (fact tables, reports) |
| Databases | Number of different databases affected |
| Max Depth | Maximum depth level of impact |

**Impact Table:**

Lists all impacted assets with:
- Asset name (table.column format)
- Database name
- Depth level (how many hops from the source)
- Impact type badge (Direct = depth 1, Indirect = depth 2+)

### Graph Visualization Features

The lineage graph includes several advanced features for exploring complex data flows:

**View Modes:**

| Mode | Description |
|------|-------------|
| **Graph View** | Interactive directed graph visualization using React Flow with ELKjs layout. Table nodes contain columns as rows with per-column edge connections. |
| **Table View** | Tabular list of all lineage relationships with sorting, filtering, and CSV export capabilities |

**Table View Features:**
- Sortable columns (click header to sort)
- Text filtering across all columns
- Pagination (50 rows per page)
- CSV export button
- Click a row to highlight the corresponding edge in graph view

**In-Graph Search:**

Use the autocomplete search box in the toolbar to find and navigate to specific columns:
- Type at least 2 characters to see matching results
- Results are ranked by relevance (exact match > starts with > contains)
- Selecting a result centers and highlights that column in the graph

**Multi-Select and Group Move:**

Select multiple nodes and move them as a group:
- **Toolbar toggle:** Click the Multi-Select button (MousePointerClick icon) in the toolbar to enter multi-select mode. The button highlights blue when active
- **Click to select:** In multi-select mode, click any table node to add or remove it from the selection. Selected nodes display a blue ring
- **Cmd+Click:** When not in toolbar multi-select mode, hold Cmd (Mac) and click nodes to multi-select
- **Group drag:** Drag any selected node to move the entire selection together
- **Exit:** Press Escape or click the toolbar button again to exit multi-select mode

**Note:** Entering multi-select mode clears any active lineage path highlighting to avoid visual conflicts.

**Database Clustering:**

Tables are visually grouped by their parent database with semi-transparent colored backgrounds:
- Toggle visibility with Ctrl+G or the toolbar button
- Each database gets a distinct background color
- Database name label appears at the top of each cluster region
- Databases are ordered left-to-right following data flow direction (upstream databases on the left, downstream on the right) using topological sorting
- Cluster bounding boxes are guaranteed not to overlap, with automatic spacing applied after layout
- Helps understand cross-database data flows in complex lineage graphs

**Path Highlighting:**

![Highlighted lineage path with dimmed non-path nodes](screenshots/lineage-graph-highlighted.png)

When you click on a column:
- The full upstream and downstream lineage path is highlighted
- Nodes not in the path are dimmed to 20% opacity
- Edges in the path become animated
- Selected edges show a glow effect
- Click on empty space or press Escape to clear the selection

**Export Options:**

Export the current lineage graph in multiple formats:
- **PNG**: High-resolution raster image (2x pixel ratio)
- **SVG**: Scalable vector graphic for editing
- **JSON**: Raw graph data (nodes, edges, metadata)

Files are downloaded with timestamp: `lineage-graph-YYYY-MM-DD.{format}`

**Fullscreen Mode:**

Toggle fullscreen mode for detailed analysis of complex lineages. The graph expands to fill the entire screen, hiding other UI elements.

### Search

Access the Search page via the header search form or the sidebar search icon. You can also navigate directly to `/search?q=your-query`.

![Search results with grouped databases and tables](screenshots/search-results.png)

**Search Features:**
- Minimum 2 characters to trigger search
- Real-time results as you type
- URL persists the search query (`/search?q=your-query`) so you can bookmark or share searches
- Results limited to 50 by default

**Grouped Results:**

Search results are organized into two sections:

| Section | Icon | What It Shows |
|---------|------|---------------|
| **Databases** | Blue database icon | Databases matching your query, with a count of matching tables |
| **Tables** | Green table icon | Tables/datasets matching your query, with the full `database.table` path |

A summary line at the top shows the total result count (e.g., "5 results found (2 databases, 3 tables)").

**Expandable Result Items:**

Each result has an expand/collapse arrow:
- **Expand a database** to see the tables within it that match the search. Click any listed table to navigate to its lineage.
- **Expand a table** to see its columns (fields). Each column shows its name and data type. Click any column to navigate directly to that column's lineage graph.

**Search Result Actions:**
- Click a **database name** to view all table-to-table relationships in that database (database-level lineage)
- Click a **table name** to view lineage for all columns in that table (table-level lineage)
- Click a **column name** (within an expanded table) to view upstream and downstream lineage for that specific column

### View Lineage

Views are surfaced as visible intermediate nodes in lineage graphs, showing how data flows from source tables through views to downstream consumers.

**Visual Indicators:**
- **Orange border:** View nodes have an orange border (vs gray for tables, violet for materialized views)
- **VIEW badge:** A "VIEW" badge appears next to view names in the Asset Browser and graph nodes
- **Transitive lineage:** Clicking a column in a view shows lineage flowing from the view's source tables through the view to downstream targets

**How view lineage is populated:**

View lineage is automatically derived from view SQL definitions stored in Teradata's `DBC.TablesV.RequestText`. The system parses view SQL using SQLGlot to extract column-level mappings from source tables to view columns. Run `populate_lineage.py --views` to populate view lineage (see [DBQL-Based Lineage Extraction](#dbql-based-lineage-extraction)).

### Lineage Levels

The application supports viewing lineage at three different granularity levels:

#### Column-Level Lineage (Finest Granularity)

View the lineage for a specific column to see exactly where its data comes from and where it flows to.

**How to access:**
- Click a column name in the Asset Browser
- Search for a column and click the result
- Navigate directly to `/lineage/{database}.{table}.{column}`

**Display:**
- Table nodes with column rows
- Edges connect individual columns showing data flow
- Detail panel shows column metadata (data type, nullable, upstream/downstream counts)

**Use case:** Tracing a specific data quality issue or understanding how a business metric is calculated.

#### Table-Level Lineage

View lineage for all columns in a table at once. This shows how the entire table participates in data flows.

**How to access:**
- Click a table name (not the expand arrow) in the Asset Browser
- Search for a table and click the result
- Navigate directly to `/lineage/{database}.{table}`

**Display:**
- Selected table node is expanded showing all columns
- All column-level edges for that table are displayed
- Related upstream and downstream tables are shown

**Use case:** Understanding all the data dependencies for a table before making schema changes.

#### Database-Level Lineage

View all table-to-table relationships within a database. This provides a high-level overview of data flows.

**How to access:**
- Click a database name in the Asset Browser
- Search for a database and click the result
- Navigate directly to `/lineage/database/{databaseName}`

**Display:**
- All tables in the database as nodes
- Table-level relationship edges
- Database cluster backgrounds group related tables
- Pagination controls for large databases (see "Loading More Tables" below)

**Use case:** Understanding the overall architecture of a data warehouse or identifying cross-table dependencies.

### Loading More Tables (Database-Level View)

When viewing database-level lineage (accessed by clicking a database name in the Asset Browser or navigating to `/lineage/database/{databaseName}`), the graph uses pagination to maintain performance with large databases.

![Database lineage view with Load More pagination](screenshots/database-lineage.png)

**Pagination Controls:**

The database-level lineage view header shows:
```
Database: SALES_DW (50 of 200 tables loaded)
                         [Page Size ▼] [Load More Tables]
```

**Page Size Options:**
- 10 tables per page (fastest loading)
- 20 tables per page (default for cross-database views)
- 50 tables per page (default for single database)

**How to load more:**
1. View the "(X of Y tables loaded)" indicator in the header
2. Click the **Page Size** dropdown to change how many tables load at once
3. Click **Load More Tables** to fetch the next batch
4. Repeat until all tables are loaded or you have sufficient context

**Behavior:**
- Tables are deduplicated automatically when loading additional pages
- Edges between already-loaded tables appear immediately
- Loading indicator shows "Loading..." while fetching
- The button is disabled during loading and when all tables are loaded

**Tips for large databases:**
- Start with a smaller page size (10-20) to quickly see the structure
- Use the direction filter (Upstream/Downstream) to focus on relevant relationships
- Use a lower max depth (2-3) for initial exploration
- Once you identify the area of interest, increase depth or load more tables

---

## Common Tasks

### Task 1: Analyze Change Impact

**Scenario:** You need to modify the `email` column in `SRC_CUSTOMER` and want to understand the impact.

1. Navigate to **Search** and search for `SRC_CUSTOMER.email`
2. Click the result to view its lineage
3. Select **Downstream** direction
4. Set depth to **10** to see full impact
5. Click **Impact Analysis** for detailed breakdown

**What to look for:**
- Total number of impacted columns
- Which databases are affected
- Critical columns (fact tables, reports)

### Task 2: Trace Data Quality Issue

**Scenario:** `FACT_SALES.profit_amount` has incorrect values and you need to find the source.

1. Search for `FACT_SALES.profit_amount`
2. View its lineage with **Upstream** direction
3. Trace through each transformation
4. Check transformation types (calculation vs. direct copy)
5. Identify the problematic source column

**What to look for:**
- Calculation transformations where logic may be wrong
- Multiple source columns being combined
- Unexpected data sources

### Task 3: Document PII Flow

**Scenario:** Compliance requires documentation of where personally identifiable information flows.

1. Search for PII-related terms: `email`, `phone`, `address`, `ssn`
2. For each result, view **Both** directions
3. Export or document the lineage paths
4. Identify all systems containing PII

### Task 4: Understand a Business Metric

**Scenario:** You need to understand how `TOTAL_REVENUE` is calculated.

1. Search for the metric column
2. View **Upstream** lineage with maximum depth
3. Note all transformation types along the path
4. Trace back to source system columns

---

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to the API

**Solutions:**
1. Verify the backend is running: `curl http://localhost:8080/health`
2. Check Teradata connection settings in environment variables
3. Verify network connectivity to Teradata host

### Empty Lineage Results

**Problem:** Lineage graph shows no relationships

**Solutions:**
1. Verify lineage data exists: Check `OL_COLUMN_LINEAGE` table
2. Run `scripts/populate/populate_lineage.py` to populate lineage data
3. Ensure the asset ID format is correct: `database.table.column`

### Slow Performance

**Problem:** Lineage queries are slow

**Solutions:**
1. Reduce traversal depth (use 3-5 instead of 10)
2. Check database indexes exist on lineage tables
3. Check graph engine status: `curl http://localhost:8080/api/v2/graph/status` — if `ready: true`, queries use fast in-memory BFS (<50ms); if `ready: false`, queries fall back to slower CTE (2-4s)
4. For subsequent visits after a server restart, the graph engine should restore from Redis in <20ms

### Graph Rendering Issues

**Problem:** Graph is cluttered or nodes overlap

**Solutions:**
1. Reduce depth to show fewer nodes
2. Use direction filter (upstream or downstream only)
3. Use zoom and pan to navigate
4. Double-click to fit view

### QVCI Disabled Info Message

**Message:** Informational log noting QVCI is disabled during `populate_lineage.py` preflight checks.

**Impact:** None. The application uses Teradata's `HELP COLUMN` command to resolve view column types, which works on all environments regardless of QVCI status. View column types (INTEGER, VARCHAR, etc.) resolve correctly without QVCI enabled.

---

## Glossary

| Term | Definition |
|------|------------|
| **Asset** | A database, table, or column tracked in the lineage system |
| **Upstream Lineage** | The source data that feeds into an asset |
| **Downstream Lineage** | The targets that consume data from an asset |
| **Transformation** | How data changes from source to target (e.g., DIRECT, DERIVED, AGGREGATED, JOINED) |
| **Confidence Score** | A 0.0-1.0 measure of certainty about a lineage relationship |
| **DBQL** | Database Query Log - Teradata's query logging system used to extract lineage |
| **DAG** | Directed Acyclic Graph - the graph structure used to represent lineage |
| **Impact Analysis** | Assessment of all downstream effects of changing an asset |
| **Traversal Depth** | How many relationship levels to follow when building a lineage graph |
| **Table Node** | A visual card representing a table, containing column rows with connection handles |
| **Column Row** | A row within a table node showing column name, data type, and lineage indicators |
| **Edge** | A visual arrow representing a data flow relationship between columns |
| **Path Highlighting** | Visual emphasis of the complete lineage path when a column is selected |
| **Database Cluster** | A colored background region grouping tables from the same database |
| **Detail Panel** | A slide-out panel showing metadata for selected columns or edges |
| **ELKjs** | Eclipse Layout Kernel for JavaScript - the library used for automatic graph layout |
| **React Flow** | The React library used for rendering interactive node-based graphs |
| **Wildcard Expansion** | The process of resolving `SELECT *` and `t1.*` patterns to actual column names using table metadata |
| **View Lineage** | Column-level lineage derived from view SQL definitions, showing data flow through views to source tables |
| **Multi-Select** | A graph interaction mode where multiple nodes can be selected and moved as a group |
| **Topological Sort** | An ordering of database clusters based on data flow direction, placing upstream databases on the left |

---

## Support

For issues and feature requests, please refer to the project repository or contact your system administrator.
