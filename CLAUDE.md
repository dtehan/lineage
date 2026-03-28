# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Column-level data lineage application for Teradata databases. Visualizes data flow between database columns for impact analysis and change management.

## Technology Stack

- **Backend:** Python Flask
- **Frontend:** React 18 with TypeScript, Vite, TanStack Query, Zustand
- **Graph Visualization:** React Flow (@xyflow/react) + ELKjs
- **Database:** Teradata (lineage metadata in `demo_user` database)
- **Testing:** Vitest + React Testing Library (unit), Playwright (E2E)

## Architecture

```
React Frontend (Asset Browser, Lineage Graph, Impact Analysis, Search)
    │ REST API (/api/v2/openlineage/*)
    ▼
Python Backend (Flask) → Teradata (OL_* tables)
```

The frontend proxies `/api/*` requests to `http://localhost:8080` via Vite config.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt  # requirements.txt is at project root
cp .env.example .env             # Edit with your Teradata credentials
cd database && python scripts/setup/setup_lineage_schema.py  # Create OL_* tables
```

## Common Commands

```bash
# Backend
cd lineage-api && python python_server.py

# Frontend
cd lineage-ui
npm run dev                      # Dev server with hot reload
npm run build                    # Production build
npm test                         # Run Vitest unit tests
npx playwright test              # Run E2E tests

# Database
cd database
python tests/run_tests.py              # Run 73 database tests
python scripts/setup/setup_lineage_schema.py  # Create OL_* tables
python scripts/utils/insert_cte_test_data.py   # Insert test lineage patterns (cycles, diamonds, fans)
python scripts/populate/populate_test_metadata.py # Populate OL_* metadata for test tables (run after insert_cte_test_data.py)

# Populate lineage (two modes available, view lineage included by default)
python scripts/populate/populate_lineage.py                # DBQL + view lineage (default)
python scripts/populate/populate_lineage.py --fixtures     # Fixtures mode - hardcoded mappings for demo/testing
python scripts/populate/populate_lineage.py --dbql --since "2024-01-01"  # DBQL since specific date
python scripts/populate/populate_lineage.py --no-views     # Skip view-based lineage extraction
python scripts/populate/populate_lineage.py --dry-run      # Preview what would be populated
```

## Testing

| Suite | Count | Command |
|-------|-------|---------|
| Database (Python) | 73 | `cd database && python tests/run_tests.py` |
| Backend API (Python) | 20 | `cd lineage-api && python tests/run_api_tests.py` |
| Frontend Unit (Vitest) | 260+ | `cd lineage-ui && npm test` |
| Frontend E2E (Playwright) | 21 | `cd lineage-ui && npx playwright test` |

**Note:** Database tests have 29 skipped tests in ClearScape Analytics due to DBQL/index limitations.

## Key Domain Concepts

- **OpenLineage Schema:** OL_* tables aligned with [OpenLineage spec v2-0-2](https://openlineage.io/docs/spec/object-model). See `database/scripts/setup/setup_lineage_schema.py` for table definitions.
- **Lineage Traversal:** Recursive CTEs traverse `OL_COLUMN_LINEAGE` -- upstream follows target->source, downstream follows source->target, with cycle detection via path tracking.
- **QVCI:** Teradata feature for view column metadata via `DBC.ColumnsJQV`. No longer required — the application uses `HELP COLUMN` to resolve view column types on all environments. The populate script auto-detects QVCI availability as informational only.
- **Configuration:** Copy `.env.example` to `.env`. Key vars: `TERADATA_HOST`, `TERADATA_USER`, `TERADATA_PASSWORD`, `TERADATA_DATABASE`, `API_PORT` (default 8080).
