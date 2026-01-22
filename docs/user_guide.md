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
pip install teradatasql flask flask-cors requests
```

### Step 1: Database Setup

The database connection is configured in `database/db_config.py`. For ClearScape Analytics (test environment):

```python
# database/db_config.py
CONFIG = {
    'host': 'test-sad3sstx4u4llczi.env.clearscape.teradata.com',
    'user': 'demo_user',
    'password': 'password',
    'database': 'demo_user'
}
```

Alternatively, set environment variables:

```bash
export TD_HOST="your-teradata-host"
export TD_USER="your-username"
export TD_PASSWORD="your-password"
export TD_DATABASE="demo_user"
```

Create the lineage schema:

```bash
cd database/
python3 setup_lineage_schema.py
```

This creates the following tables in your `demo_user` database:
- `LIN_DATABASE` - Database registry
- `LIN_TABLE` - Table registry
- `LIN_COLUMN` - Column registry with metadata
- `LIN_COLUMN_LINEAGE` - Column-to-column relationships
- `LIN_TABLE_LINEAGE` - Table-level lineage
- `LIN_TRANSFORMATION` - Transformation metadata
- `LIN_QUERY` - Query registry
- `LIN_WATERMARK` - Extraction tracking

Plus 13 performance indexes for efficient lineage traversal.

### Step 2: Load Test Data

Create test tables representing a medallion architecture ETL pipeline:

```bash
python3 setup_test_data.py
```

This creates a realistic data pipeline with 4 layers:

| Layer | Tables |
|-------|--------|
| Source | SRC_CUSTOMER, SRC_PRODUCT, SRC_SALES, SRC_STORE |
| Staging | STG_CUSTOMER, STG_PRODUCT, STG_SALES |
| Dimension | DIM_CUSTOMER, DIM_PRODUCT, DIM_STORE, DIM_DATE |
| Fact/Report | FACT_SALES, FACT_SALES_DAILY, RPT_MONTHLY_SALES |

### Step 3: Populate Lineage Metadata

Extract metadata from Teradata system views and populate lineage relationships:

```bash
python3 populate_lineage.py
```

This extracts databases, tables, and columns from DBC views and creates 93 column-level lineage relationships with transformation types (DIRECT, CALCULATION, AGGREGATION, JOIN).

### Step 4: Add Edge Case Test Data (Optional)

For testing recursive CTE functionality:

```bash
python3 insert_cte_test_data.py
```

This adds test cases for cycles, diamond patterns, fan-out, and multi-source scenarios.

### Step 5: Validate Setup (Optional)

Run the test suite to validate your setup:

```bash
python3 run_tests.py
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
| `/lineage/:assetId` | Lineage | Dedicated full-screen lineage view with advanced controls |
| `/impact/:assetId` | Impact | Impact analysis view for a specific asset |
| `/search` | Search | Global search with results list |

### Asset Browser (Explore Page)

The Asset Browser provides hierarchical navigation through your data assets in the left panel of the Explore page.

**Navigation Structure:**
```
Databases (blue icon)
  └── Tables (green icon)
       └── Columns (purple icon)
```

**Interactions:**
- Click the expand arrow on a database to see its tables
- Click the expand arrow on a table to see its columns
- Click a column name to select it and view its lineage in the right panel
- Data is lazy-loaded: tables load when database is expanded, columns load when table is expanded

### Lineage Graph

The Lineage Graph visualizes data relationships as an interactive directed graph using React Flow with ELKjs layout.

**Graph Elements:**

| Element | Description |
|---------|-------------|
| **Column Nodes** | White rectangles showing database.table (small) and column name (large) |
| **Table Nodes** | Slate-colored rectangles for table-level grouping |
| **Edges** | Arrows connecting source to target, color-coded by transformation type |
| **Selected Node** | Highlighted with blue border and ring |
| **Highlighted Nodes** | Light blue border when hovering related nodes |

**Edge Colors by Transformation Type:**

| Type | Color |
|------|-------|
| DIRECT | Green |
| AGGREGATION | Amber |
| CALCULATION | Purple |
| Default | Slate |

**Interactions:**

- **Pan**: Click and drag on the background
- **Zoom**: Scroll wheel (range: 0.1x to 2x)
- **Select Node**: Click on a node to make it the new focus
- **Hover**: Highlights connected nodes in the path
- **Fit View**: Use the controls to fit all nodes in view
- **MiniMap**: Corner minimap for navigation in large graphs

**Controls (Lineage Page):**

- **Direction Dropdown**: Switch between Upstream, Downstream, or Both
- **Depth Dropdown**: Select traversal depth (1, 2, 3, 5, or 10 levels)

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

### Search

Access the Search page via the header search form or sidebar icon.

**Search Features:**
- Minimum 2 characters to trigger search
- Real-time results as you type
- URL persists search query (`/search?q=your-query`)
- Results limited to 50 by default

**Search Parameters:**
- `q` - Search query text
- `type` - Filter by asset type (database, table, column)
- `limit` - Maximum results

**Result Cards:**

Each result shows:
- Asset type icon (database/table/column)
- Asset name with full path breadcrumb
- Color-coded type badge
- Click to navigate to `/lineage/{assetId}`

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
      "tableCount": 15
    }
  ]
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
      "name": "DIM_CUSTOMER",
      "database": "SALES_DW",
      "columnCount": 10,
      "rowCount": 50000
    }
  ]
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
      "name": "customer_id",
      "dataType": "INTEGER",
      "nullable": false,
      "comment": "Primary key"
    }
  ]
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
  "nodes": [
    {
      "id": "SALES_DW.DIM_CUSTOMER.customer_id",
      "database": "SALES_DW",
      "table": "DIM_CUSTOMER",
      "column": "customer_id",
      "dataType": "INTEGER"
    }
  ],
  "edges": [
    {
      "source": "SALES_DW.STG_CUSTOMER.customer_id",
      "target": "SALES_DW.DIM_CUSTOMER.customer_id",
      "transformationType": "DIRECT",
      "confidence": 1.0
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
  "impactedDatabases": ["SALES_DW", "REPORTING"],
  "impactByDepth": {
    "1": 5,
    "2": 10,
    "3": 7,
    "4": 3
  },
  "impactedAssets": [
    {
      "id": "SALES_DW.FACT_SALES.customer_id",
      "depth": 1,
      "path": ["SALES_DW.DIM_CUSTOMER.customer_id", "SALES_DW.FACT_SALES.customer_id"]
    }
  ]
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
      "name": "DIM_CUSTOMER",
      "database": "SALES_DW",
      "relevanceScore": 0.95
    }
  ],
  "totalCount": 15
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
1. Verify lineage data exists: Check `LIN_COLUMN_LINEAGE` table
2. Run `populate_lineage.py` to extract from DBQL
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
| **Transformation** | How data changes from source to target (e.g., copy, aggregate, calculate) |
| **Confidence Score** | A 0.0-1.0 measure of certainty about a lineage relationship |
| **DBQL** | Database Query Log - Teradata's query logging system used to extract lineage |
| **DAG** | Directed Acyclic Graph - the graph structure used to represent lineage |
| **Impact Analysis** | Assessment of all downstream effects of changing an asset |
| **Traversal Depth** | How many relationship levels to follow when building a lineage graph |
| **Node** | A visual element representing an asset in the lineage graph |
| **Edge** | A visual element representing a relationship between assets |

---

## Configuration Reference

### Environment Variables

**Database Scripts (Python):**

| Variable | Description | Default |
|----------|-------------|---------|
| `TD_HOST` | Teradata server hostname | `localhost` |
| `TD_USER` | Teradata username | `demo_user` |
| `TD_PASSWORD` | Teradata password | (empty) |
| `TD_DATABASE` | Default database | `demo_user` |

**Backend API (Go):**

| Variable | Description | Default |
|----------|-------------|---------|
| `TERADATA_HOST` | Teradata server hostname | - |
| `TERADATA_USER` | Teradata username | - |
| `TERADATA_PASSWORD` | Teradata password | - |
| `REDIS_ADDR` | Redis server address | `localhost:6379` |
| `REDIS_PASSWORD` | Redis password | (empty) |

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
  database: lineage

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

### Database Tests

Run the database test suite (73 test cases covering schema validation, data extraction, recursive CTEs, edge cases, and data integrity):

```bash
cd database/
source ../.venv/bin/activate
python run_tests.py
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
python run_api_tests.py
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
python run_tests.py

# Backend API tests
cd ../lineage-api/
python run_api_tests.py

# Frontend E2E tests
cd ../lineage-ui/
npx playwright test
```

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
python setup_lineage_schema.py
python setup_test_data.py
python populate_lineage.py
python insert_cte_test_data.py

# 3. Run database tests (optional)
python run_tests.py

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

## Support

For issues and feature requests, please refer to the project repository or contact your system administrator.
