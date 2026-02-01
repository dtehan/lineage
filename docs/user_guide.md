# Data Lineage Application User Guide

A comprehensive guide for using the column-level data lineage application for Teradata databases.

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Core Concepts](#core-concepts)
4. [Using the Application](#using-the-application)
5. [API Reference](#api-reference)
6. [Common Tasks](#common-tasks)
7. [Troubleshooting](#troubleshooting)
8. [Glossary](#glossary)
9. [OpenLineage Integration](#openlineage-integration)
10. [DBQL-Based Lineage Extraction](#dbql-based-lineage-extraction)

---

## Introduction

### What is Data Lineage?

Data lineage tracks the flow of data from its source to its destination, showing how data is transformed along the way. This application provides **column-level lineage**, meaning you can trace individual columns through your data pipelines.

### Key Capabilities

- **Asset Browsing**: Explore databases, tables, and columns hierarchically
- **Lineage Visualization**: Interactive graphs showing data relationships
- **Impact Analysis**: Assess downstream effects before making changes
- **Search**: Find assets across your entire Teradata environment

### Use Cases

| Use Case | Description |
|----------|-------------|
| Change Impact Analysis | Before modifying a source column, see all affected downstream tables |
| Root Cause Analysis | Trace data quality issues back to their source |
| Regulatory Compliance | Document PII data flows for audits |
| Data Governance | Understand how business metrics are calculated |

---

## Getting Started

### Prerequisites

- **Teradata Database**: Access to a Teradata instance (or ClearScape Analytics)
- **Python 3.9+**: For database setup scripts and Python backend
- **Go 1.21+**: For the Go backend API (optional - Python alternative available)
- **Node.js 18+**: For the frontend
- **Redis** (optional): For caching (falls back gracefully if unavailable)

### Python Environment Setup

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate

# Install required packages
pip install teradatasql flask flask-cors requests python-dotenv
```

### Step 1: Database Setup

The database connection can be configured using a `.env` file or environment variables.

**Option A: Using .env file (recommended)**

Copy the example file and edit with your credentials:

```bash
cp .env.example .env
# Edit .env with your Teradata credentials
```

**Option B: Using environment variables**

```bash
export TERADATA_HOST="your-teradata-host"
export TERADATA_USER="your-username"
export TERADATA_PASSWORD="your-password"
export TERADATA_DATABASE="demo_user"
```

**Note:** Environment variables take precedence over `.env` file values. Legacy `TD_*` variables are supported as fallbacks.

Create the OpenLineage schema:

```bash
cd database/
python3 scripts/setup/setup_lineage_schema.py --openlineage
```

This creates the following OpenLineage tables in your `demo_user` database:
- `OL_NAMESPACE` - Data source namespaces (URI format)
- `OL_DATASET` - Dataset registry (tables/views)
- `OL_DATASET_FIELD` - Field definitions (columns)
- `OL_JOB` - Job definitions (ETL processes)
- `OL_RUN` - Job execution runs
- `OL_RUN_INPUT` - Run input datasets
- `OL_RUN_OUTPUT` - Run output datasets
- `OL_COLUMN_LINEAGE` - Column-level lineage with transformation types
- `OL_SCHEMA_VERSION` - Schema version tracking

Plus performance indexes for efficient lineage traversal.

**Note:** The legacy LIN_* tables are deprecated. Use `--openlineage` flag to create OpenLineage-compliant tables.

### Step 2: Load Test Data

Create test tables representing a medallion architecture ETL pipeline:

```bash
python3 scripts/setup/setup_test_data.py
```

This creates a realistic data pipeline with 4 layers:

| Layer | Tables |
|-------|--------|
| Source | SRC_CUSTOMER, SRC_PRODUCT, SRC_SALES, SRC_STORE |
| Staging | STG_CUSTOMER, STG_PRODUCT, STG_SALES |
| Dimension | DIM_CUSTOMER, DIM_PRODUCT, DIM_STORE, DIM_DATE |
| Fact/Report | FACT_SALES, FACT_SALES_DAILY, RPT_MONTHLY_SALES |

### Step 3: Populate Lineage Metadata

Extract metadata from Teradata system views and populate OpenLineage tables.

```bash
# Standard population (manual mappings)
python3 scripts/populate/populate_lineage.py

# Preview what would be populated
python3 scripts/populate/populate_lineage.py --dry-run

# Append mode (don't clear existing data)
python3 scripts/populate/populate_lineage.py --skip-clear
```

This populates OpenLineage tables with:
- Databases and tables from `DBC.TablesV`
- Columns and their types from `DBC.ColumnsV`
- 93 predefined column-level lineage relationships with OpenLineage transformation types (DIRECT/IDENTITY, DIRECT/TRANSFORMATION, DIRECT/AGGREGATION, INDIRECT/JOIN, INDIRECT/FILTER)

**Use for:**
- Initial setup and testing
- Demo environments
- ClearScape Analytics environments
- Development and debugging
- Scheduled/automated extraction jobs

See [DBQL-Based Lineage Extraction](#dbql-based-lineage-extraction) for detailed documentation.

### Step 4: Add Edge Case Test Data (Optional)

For testing recursive CTE functionality:

```bash
python3 scripts/utils/insert_cte_test_data.py
```

This adds test cases for cycles, diamond patterns, fan-out, and multi-source scenarios.

### Step 5: Validate Setup (Optional)

Run the test suite to validate your setup:

```bash
python3 tests/run_tests.py
```

This executes 73 test cases covering schema validation, data extraction, recursive CTEs, edge cases, and data integrity.

### Step 6: Start the Backend API

You have two options for running the backend API:

#### Option A: Python Flask Server (Recommended for Testing)

The Python server uses the same connection config as the database scripts:

```bash
cd lineage-api/

# Activate virtual environment
source ../.venv/bin/activate

# Start the Flask server
python python_server.py
```

#### Option B: Go Server

```bash
cd lineage-api/

# Set configuration
export TERADATA_HOST="your-host"
export TERADATA_USER="your-user"
export TERADATA_PASSWORD="your-password"

# Run the server (option 1: direct)
go run cmd/server/main.go

# Run the server (option 2: using Makefile)
make run

# Build and run (option 3: compiled binary)
make build
./bin/server
```

Both servers start on `http://localhost:8080`. Verify with:

```bash
curl http://localhost:8080/health
# Response: {"status":"ok"}
```

### Step 7: Start the Frontend

```bash
cd lineage-ui/
npm install
npm run dev
```

The UI opens at `http://localhost:3000`.

The frontend is configured to proxy API requests to `http://localhost:8080` (see `vite.config.ts`).

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

**Interactions:**

- **Pan**: Click and drag on the background
- **Zoom**: Scroll wheel or +/- keys (range: 0.1x to 2x)
- **Select Column**: Click a column row to highlight its full lineage path
- **Select Edge**: Click an edge to view transformation details
- **Clear Selection**: Click on empty space or press Escape
- **Fit View**: Press F or use toolbar button
- **MiniMap**: Corner minimap for navigation in large graphs

**Keyboard Shortcuts:**

| Shortcut | Action |
|----------|--------|
| `Escape` | Clear selection and close panel |
| `F` | Fit graph to view |
| `+` / `-` | Zoom in / out |
| `Ctrl+F` or `/` | Focus search box |
| `Ctrl+G` | Toggle database cluster backgrounds |

### Toolbar Controls

The lineage graph includes an advanced toolbar with the following controls:

| Control | Description |
|---------|-------------|
| **View Mode Toggle** | Switch between Graph view (visual) and Table view (tabular list) |
| **Search Box** | Autocomplete search for columns within the current lineage graph |
| **Direction Dropdown** | Select Upstream, Downstream, or Both directions |
| **Depth Slider** | Interactive slider to adjust traversal depth (1-10) |
| **Fit View Button** | Automatically fit all nodes within the viewport (or press F) |
| **Export Button** | Export the current lineage graph as PNG, SVG, or JSON |
| **Fullscreen Button** | Toggle fullscreen mode for the graph view |

**Search Autocomplete:**

The search box provides real-time autocomplete as you type:
- Minimum 2 characters to trigger search
- Results show column name, table path, and data type
- Use arrow keys to navigate results, Enter to select
- Selected column is highlighted and centered in view
- Press Escape to close the dropdown

### Detail Panel

When you click on a column or edge in the lineage graph, a **Detail Panel** slides in from the right side of the screen showing detailed information. Click the X button or press Escape to close the panel.

**Column Details:**

When a column is selected, the panel displays:
- **Full Path**: `database.table.column` identifier with breadcrumb navigation
- **Metadata Section**:
  - Data type (e.g., VARCHAR(100), INTEGER)
  - Nullable status (Yes/No badge)
  - Primary key indicator (badge if applicable)
- **Description**: Column description (if available in metadata)
- **Lineage Statistics**:
  - Count of upstream connections (data sources)
  - Count of downstream connections (data consumers)

**Quick Actions (Column Panel):**
- **View Full Lineage**: Highlights the complete lineage path for this column
- **View Impact Analysis**: Navigate to impact analysis page for change assessment

**Edge/Connection Details:**

When an edge (connection) is selected, the panel displays:
- **Source Column**: Full path of the data source (`database.table.column`)
- **Target Column**: Full path of the data destination
- **Transformation Type**: Color-coded badge (DIRECT, DERIVED, AGGREGATED, JOINED, etc.)
- **Confidence Score**: Visual progress bar showing confidence level (0-100%)
  - Green (≥90%): High confidence
  - Yellow (70-89%): Medium confidence
  - Orange (50-69%): Low confidence
  - Red (<50%): Very low confidence

### Impact Analysis

Access the Impact Analysis page by navigating to `/impact/:assetId`. This shows the downstream effects of changes to a column.

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

**Database Clustering:**

Tables are visually grouped by their parent database with semi-transparent colored backgrounds:
- Toggle visibility with Ctrl+G or the toolbar button
- Each database gets a distinct background color
- Database name label appears at the top of each cluster region
- Helps understand cross-database data flows in complex lineage graphs

**Path Highlighting:**

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

Access the Search page via the header search form or sidebar icon.

**What You Can Search:**

| Asset Type | Example Search | Result Navigation |
|------------|----------------|-------------------|
| **Database** | `SALES_DW` | `/lineage/database/SALES_DW` (database-level lineage) |
| **Table** | `DIM_CUSTOMER` | `/lineage/SALES_DW.DIM_CUSTOMER` (table-level lineage) |
| **Column** | `customer_id` | `/lineage/SALES_DW.DIM_CUSTOMER.customer_id` (column-level lineage) |

**Search Features:**
- Minimum 2 characters to trigger search
- Real-time results as you type (with debouncing)
- URL persists search query (`/search?q=your-query`)
- Results limited to 50 by default
- Results ranked by relevance score

**Search Parameters:**
- `q` - Search query text (required, minimum 2 characters)
- `type` - Filter by asset type: `database`, `table`, or `column` (can specify multiple)
- `limit` - Maximum results (default: 50)

Example URL with filters: `/search?q=customer&type=table&type=column&limit=20`

**Result Cards:**

Each result shows:
```
┌─────────────────────────────────────────┐
│ [Icon] asset_name            [Type Badge]│
│        database.table.column             │
└─────────────────────────────────────────┘
```

| Asset Type | Icon Color | Badge |
|------------|------------|-------|
| Database | Blue (#3b82f6) | "DATABASE" |
| Table | Green (#22c55e) | "TABLE" |
| Column | Purple (#a855f7) | "COLUMN" |

**Search Result Actions:**
- Click a **database** result to view all table-to-table relationships in that database
- Click a **table** result to view lineage for all columns in that table
- Click a **column** result to view upstream and downstream lineage for that specific column

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

### Loading More Tables

For databases with many tables, the lineage graph uses pagination to maintain performance.

**Pagination Controls:**

The database lineage view header shows:
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

## API Reference

### Health Check

```http
GET /health
```

Returns server health status.

**Response:**
```json
{
  "status": "ok"
}
```

### List Databases

```http
GET /api/v1/assets/databases
```

Returns all databases with lineage data.

**Response:**
```json
{
  "databases": [
    {
      "id": "SALES_DW",
      "name": "SALES_DW",
      "ownerName": "dbc",
      "commentString": "Sales data warehouse"
    }
  ],
  "total": 5
}
```

### List Tables

```http
GET /api/v1/assets/databases/{database}/tables
```

Returns tables in a database.

**Parameters:**
- `database` (path): Database name

**Response:**
```json
{
  "tables": [
    {
      "id": "SALES_DW.DIM_CUSTOMER",
      "databaseName": "SALES_DW",
      "tableName": "DIM_CUSTOMER",
      "tableKind": "T",
      "rowCount": 50000
    }
  ],
  "total": 15
}
```

### List Columns

```http
GET /api/v1/assets/databases/{database}/tables/{table}/columns
```

Returns columns in a table.

**Parameters:**
- `database` (path): Database name
- `table` (path): Table name

**Response:**
```json
{
  "columns": [
    {
      "id": "SALES_DW.DIM_CUSTOMER.customer_id",
      "databaseName": "SALES_DW",
      "tableName": "DIM_CUSTOMER",
      "columnName": "customer_id",
      "columnType": "INTEGER",
      "nullable": false,
      "columnPosition": 1
    }
  ],
  "total": 10
}
```

### Get Lineage

```http
GET /api/v1/lineage/{assetId}
```

Returns the lineage graph for an asset.

**Parameters:**
- `assetId` (path): Asset identifier (e.g., `SALES_DW.DIM_CUSTOMER.customer_id`)
- `direction` (query): `upstream`, `downstream`, or `both` (default: `both`)
- `maxDepth` (query): Traversal depth 1-10 (default: `5`)

**Response:**
```json
{
  "assetId": "SALES_DW.DIM_CUSTOMER.customer_id",
  "nodes": [
    {
      "id": "SALES_DW.DIM_CUSTOMER.customer_id",
      "type": "column",
      "databaseName": "SALES_DW",
      "tableName": "DIM_CUSTOMER",
      "columnName": "customer_id",
      "metadata": {
        "dataType": "INTEGER"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "SALES_DW.STG_CUSTOMER.customer_id",
      "target": "SALES_DW.DIM_CUSTOMER.customer_id",
      "transformationType": "DIRECT",
      "confidenceScore": 1.0
    }
  ]
}
```

### Get Upstream Lineage

```http
GET /api/v1/lineage/{assetId}/upstream
```

Returns only upstream (source) lineage.

**Parameters:**
- `assetId` (path): Asset identifier
- `maxDepth` (query): Traversal depth 1-10 (default: `10`)

### Get Downstream Lineage

```http
GET /api/v1/lineage/{assetId}/downstream
```

Returns only downstream (target) lineage.

**Parameters:**
- `assetId` (path): Asset identifier
- `maxDepth` (query): Traversal depth 1-10 (default: `10`)

### Get Impact Analysis

```http
GET /api/v1/lineage/{assetId}/impact
```

Returns detailed impact analysis.

**Parameters:**
- `assetId` (path): Asset identifier
- `maxDepth` (query): Traversal depth 1-10 (default: `10`)

**Response:**
```json
{
  "sourceAsset": "SALES_DW.DIM_CUSTOMER.customer_id",
  "totalImpactedAssets": 25,
  "impactedAssets": [
    {
      "id": "SALES_DW.FACT_SALES.customer_id",
      "databaseName": "SALES_DW",
      "tableName": "FACT_SALES",
      "columnName": "customer_id",
      "depth": 1,
      "impactType": "direct"
    }
  ],
  "summary": {
    "totalImpacted": 25,
    "byDatabase": {
      "SALES_DW": 20,
      "REPORTING": 5
    },
    "byDepth": {
      "1": 5,
      "2": 10,
      "3": 7,
      "4": 3
    },
    "criticalCount": 3
  }
}
```

### Search Assets

```http
GET /api/v1/search
```

Searches for assets by name.

**Parameters:**
- `q` (query): Search query
- `type` (query): Filter by type (`database`, `table`, `column`)
- `limit` (query): Maximum results (default: 50)

**Response:**
```json
{
  "results": [
    {
      "id": "SALES_DW.DIM_CUSTOMER",
      "type": "table",
      "databaseName": "SALES_DW",
      "tableName": "DIM_CUSTOMER",
      "matchedOn": "tableName",
      "score": 0.95
    }
  ],
  "total": 15,
  "query": "customer"
}
```

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
2. Enable Redis caching
3. Check database indexes exist on lineage tables

### Graph Rendering Issues

**Problem:** Graph is cluttered or nodes overlap

**Solutions:**
1. Reduce depth to show fewer nodes
2. Use direction filter (upstream or downstream only)
3. Use zoom and pan to navigate
4. Double-click to fit view

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

---

## Configuration Reference

### .env File Support

The project supports configuration via a `.env` file in the project root. Copy the example file to get started:

```bash
cp .env.example .env
# Edit .env with your credentials
```

**Configuration precedence (highest to lowest):**
1. Environment variables
2. `.env` file
3. `config.yaml` (Go server only)
4. Default values

### Environment Variables

**Database Connection (All Components):**

| Variable | Description | Default |
|----------|-------------|---------|
| `TERADATA_HOST` | Teradata server hostname | `localhost` |
| `TERADATA_USER` | Teradata username | `demo_user` |
| `TERADATA_PASSWORD` | Teradata password | (required) |
| `TERADATA_DATABASE` | Default database | `demo_user` |
| `TERADATA_PORT` | Teradata port | `1025` |

*Legacy aliases `TD_HOST`, `TD_USER`, `TD_PASSWORD`, `TD_DATABASE` are supported for backwards compatibility.*

**Server Configuration:**

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | HTTP server port | `8080` |
| `REDIS_ADDR` | Redis server address | `localhost:6379` |
| `REDIS_PASSWORD` | Redis password | (empty) |
| `REDIS_DB` | Redis database number | `0` |

*Legacy alias `PORT` is supported as a fallback for `API_PORT`.*

**Note:** All Python scripts and both Go/Python servers use the same `TERADATA_*` environment variables. Legacy `TD_*` variables are checked as fallbacks if `TERADATA_*` are not set.

**Frontend (Vite):**

The frontend uses Vite's proxy configuration (in `vite.config.ts`) to forward API requests:

```typescript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,
    },
  },
}
```

No environment variables needed - API calls to `/api/*` are automatically proxied to the backend.

### Backend Configuration (config.yaml)

```yaml
port: 8080

teradata:
  host: ${TERADATA_HOST}
  port: 1025
  user: ${TERADATA_USER}
  password: ${TERADATA_PASSWORD}
  database: ${TERADATA_DATABASE:demo_user}

redis:
  addr: ${REDIS_ADDR:localhost:6379}
  password: ${REDIS_PASSWORD:}
  db: 0

logging:
  level: info
  format: json
```

### Backend Server Settings

The Go backend has the following built-in settings:

| Setting | Value |
|---------|-------|
| HTTP Read Timeout | 15 seconds |
| HTTP Write Timeout | 60 seconds |
| HTTP Idle Timeout | 60 seconds |
| Request Timeout (middleware) | 60 seconds |
| Graceful Shutdown Timeout | 30 seconds |
| Teradata Max Open Connections | 25 |
| Teradata Max Idle Connections | 5 |
| Cache TTL | 5 minutes |

### CORS Configuration

The backend allows cross-origin requests from:
- `http://localhost:3000` (Vite configured port)
- `http://localhost:5173` (Vite default)

Allowed methods: GET, POST, PUT, DELETE, OPTIONS

**Note:** The frontend is configured to use port 3000 in `vite.config.ts`.

### Caching

Lineage graph results are cached in Redis with a 5-minute TTL. Cache keys follow the pattern:

```
lineage:{assetId}:{direction}:{maxDepth}
```

If Redis is unavailable, the application falls back to a no-op cache and continues working without caching.

---

## Build Commands

### Backend (Makefile)

```bash
cd lineage-api/

# Build the server binary
make build            # Output: bin/server

# Run directly without building
make run

# Run tests with race detection and coverage
make test

# Generate HTML coverage report
make test-coverage

# Run linter (golangci-lint)
make lint

# Format code
make fmt

# Download and tidy dependencies
make deps

# Verify dependencies
make verify
```

### Frontend (npm)

```bash
cd lineage-ui/

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run linter
npm run lint
```

---

## Running Tests

The application includes comprehensive test suites for all components. Test plans are documented in the `specs/` directory:
- `specs/test_plan_database.md` - 73 database test cases
- `specs/test_plan_backend.md` - 79 backend test cases
- `specs/test_plan_frontend.md` - 68 frontend test cases

**Test Summary:**

| Test Suite | Tests | Description |
|------------|-------|-------------|
| Database (Python) | 73 | Schema validation, data extraction, recursive CTEs |
| Backend API (Python) | 20 | API endpoint validation |
| Frontend Unit (Vitest) | 260+ | Component, hook, and utility tests |
| Frontend E2E (Playwright) | 21 | End-to-end user flow tests |
| **Total** | **370+** | |

### Database Tests

Run the database test suite (73 test cases covering schema validation, data extraction, recursive CTEs, edge cases, and data integrity):

```bash
cd database/
source ../.venv/bin/activate
python tests/run_tests.py
```

**Expected Output:**
```
============================================================
DATA LINEAGE DATABASE TEST RUNNER
============================================================
...
============================================================
TEST SUMMARY
============================================================
  Total tests: 73
  ✓ Passed:  44
  ✗ Failed:  0
  ○ Skipped: 29

Pass rate (excluding skipped): 100.0%
============================================================
```

**Note:** 29 tests are skipped in ClearScape Analytics due to:
- DBQL (Database Query Log) not being available
- Secondary indexes not supported in the free tier

### Backend API Tests

Run the backend API test suite (20 endpoint tests):

```bash
cd lineage-api/
source ../.venv/bin/activate
python tests/run_api_tests.py
```

**Expected Output:**
```
============================================================
BACKEND API TEST RUNNER
============================================================

Target: http://localhost:8080
...
============================================================
SUMMARY
============================================================
  Total: 20
  Passed: 20
  Failed: 0
  Pass Rate: 100.0%
============================================================
```

**Test Coverage:**
- Health check endpoint
- Asset listing (databases, tables, columns)
- Lineage endpoints (both, upstream, downstream)
- Impact analysis
- Search functionality
- Response structure validation
- CORS and content-type headers

### Frontend Unit Tests (Vitest)

Run the Vitest unit test suite (260+ test cases):

```bash
cd lineage-ui/

# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

**Expected Output:**
```
 ✓ src/utils/graph/layoutEngine.test.ts (50 tests)
 ✓ src/components/domain/LineageGraph/Toolbar.test.tsx (29 tests)
 ✓ src/test/accessibility.test.tsx (28 tests)
 ✓ src/components/domain/LineageGraph/DetailPanel.test.tsx (16 tests)
 ✓ src/components/domain/LineageGraph/LineageGraph.test.tsx (18 tests)
 ... (21 test files total)

 Test Files  21 passed (21)
      Tests  260+ passed
```

**Test Coverage:**
- Layout engine (table grouping, edge colors, node positioning)
- Graph components (TableNode, LineageEdge, DetailPanel, Toolbar)
- Hooks (useLineageHighlight, useDatabaseClusters, useGraphSearch)
- Store (useLineageStore state management)
- API hooks (useLineage, useAssets, useSearch)
- Accessibility (keyboard navigation, ARIA attributes)

### Frontend E2E Tests (Playwright)

Run the Playwright E2E test suite (21 test cases):

```bash
cd lineage-ui/

# Install Playwright browsers (first time only)
npx playwright install chromium

# Run tests
npx playwright test

# Run with visible browser
npx playwright test --headed

# Run with detailed output
npx playwright test --reporter=list

# Open HTML report after running
npx playwright show-report
```

**Expected Output:**
```
Running 21 tests using 5 workers

  ✓ TC-E2E-001: displays databases in asset browser
  ✓ TC-E2E-002: expands database to show tables
  ...
  ✓ TC-E2E-021: verify aggregation lineage FACT -> FACT_DAILY

  21 passed (25.9s)
```

**Test Coverage:**
- Asset Browser navigation (databases → tables → columns)
- Lineage graph rendering
- Upstream/downstream lineage views
- Search functionality
- Navigation between pages
- Impact analysis page
- API integration tests
- Data lineage chain verification

### Running All Tests

To run a complete end-to-end validation:

```bash
# 1. Start the backend (in terminal 1)
cd lineage-api/
source ../.venv/bin/activate
python python_server.py

# 2. Start the frontend (in terminal 2)
cd lineage-ui/
npm run dev

# 3. Run all tests (in terminal 3)
# Database tests
cd database/
source ../.venv/bin/activate
python tests/run_tests.py

# Backend API tests
cd ../lineage-api/
python tests/run_api_tests.py

# Frontend unit tests
cd ../lineage-ui/
npm test

# Frontend E2E tests
npx playwright test
```

**Expected Results:**
- Database tests: 44 passed, 29 skipped (ClearScape limitations)
- Backend API tests: 20 passed
- Frontend unit tests: 260+ passed
- Frontend E2E tests: 21 passed
- **Total: 345+ tests passed**

### Playwright Configuration

The Playwright configuration is in `lineage-ui/playwright.config.ts`:

```typescript
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
});
```

---

## Quick Start (ClearScape Analytics)

For quick testing with the provided ClearScape Analytics test database:

```bash
# 1. Clone and setup Python environment
cd play/
python3 -m venv .venv
source .venv/bin/activate
pip install teradatasql flask flask-cors requests

# 2. Setup database schema and load test data
cd database/
python scripts/setup/setup_lineage_schema.py --openlineage
python scripts/setup/setup_test_data.py
python scripts/populate/populate_lineage.py
python scripts/utils/insert_cte_test_data.py

# 3. Run database tests (optional)
python tests/run_tests.py

# 4. Start backend API
cd ../lineage-api/
python python_server.py &

# 5. Start frontend
cd ../lineage-ui/
npm install
npm run dev &

# 6. Run E2E tests
npx playwright install chromium
npx playwright test

# 7. Access the application
# Open http://localhost:3000 in your browser
```

### Test Database Connection Details

For the ClearScape Analytics test environment:

| Setting | Value |
|---------|-------|
| Host | `test-sad3sstx4u4llczi.env.clearscape.teradata.com` |
| Username | `demo_user` |
| Password | `password` |
| Database | `demo_user` |

---

---

## OpenLineage Integration

This application supports the [OpenLineage](https://openlineage.io/) standard (spec version 2-0-2) for data lineage metadata interoperability.

### OpenLineage Schema

The OpenLineage-aligned schema provides:

- **Namespace-based identification**: Assets are identified using URIs (e.g., `teradata://host:1025`)
- **Standardized transformation types**: DIRECT/INDIRECT with subtypes (IDENTITY, TRANSFORMATION, AGGREGATION, JOIN, FILTER, etc.)
- **Event-based model**: Supports tracking lineage discovery through job runs
- **Facet extensibility**: Schema designed for future facet additions

### Setting Up OpenLineage Tables

```bash
# Create OpenLineage tables
cd database
python scripts/setup/setup_lineage_schema.py --openlineage

# Populate OpenLineage tables (now default behavior)
python scripts/populate/populate_lineage.py
```

### v2 API Endpoints

The v2 API follows OpenLineage conventions:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v2/openlineage/namespaces` | List all data source namespaces |
| `GET /api/v2/openlineage/namespaces/{id}` | Get namespace details |
| `GET /api/v2/openlineage/namespaces/{id}/datasets` | List datasets in namespace |
| `GET /api/v2/openlineage/datasets/{id}` | Get dataset with fields |
| `GET /api/v2/openlineage/datasets/search?q=query` | Search datasets |
| `GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}` | Get field lineage graph |

### Lineage Query Parameters

The lineage endpoint supports:

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `direction` | `upstream`, `downstream`, `both` | `both` | Lineage direction to traverse |
| `maxDepth` | 1-20 | 5 | Maximum traversal depth |

### Transformation Types

OpenLineage defines two primary transformation types:

| Type | Subtypes | Description |
|------|----------|-------------|
| DIRECT | IDENTITY, TRANSFORMATION, AGGREGATION | Value directly derived from source |
| INDIRECT | JOIN, FILTER, GROUP_BY, SORT, WINDOW, CONDITIONAL | Value influenced by source but not directly derived |

### Example: Fetching Lineage

```bash
# v2 API example
curl "http://localhost:8080/api/v2/openlineage/lineage/demo_user.STG_CUSTOMER/customer_id?direction=upstream&maxDepth=3"
```

Response includes OpenLineage-structured graph with transformation type/subtype:

```json
{
  "datasetId": "demo_user.STG_CUSTOMER",
  "fieldName": "customer_id",
  "direction": "upstream",
  "maxDepth": 3,
  "graph": {
    "nodes": [...],
    "edges": [
      {
        "id": "...",
        "source": "demo_user.SRC_CUSTOMER/customer_id",
        "target": "demo_user.STG_CUSTOMER/customer_id",
        "transformationType": "DIRECT",
        "transformationSubtype": "IDENTITY"
      }
    ]
  }
}
```

---

## Future Lineage Extraction Options

Currently, lineage is populated using manual mappings. Future options for automated lineage discovery:

1. **DBQL Integration**: Extract lineage from Teradata Query Log
2. **SQL File Ingestion**: Parse ETL script files directly
3. **DDL-Based Lineage**: Extract from view definitions
4. **API Registration**: Applications register lineage at runtime
5. **Metadata Import**: Import from dbt, DataHub, etc.

---

## Support

For issues and feature requests, please refer to the project repository or contact your system administrator.
