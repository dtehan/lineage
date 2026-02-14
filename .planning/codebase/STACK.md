# Technology Stack

**Analysis Date:** 2026-02-13

## Languages

**Primary:**
- **TypeScript** 5.3+ - Frontend application (`lineage-ui/`)
- **Python** 3.9+ - Backend API and database scripts
- **JavaScript** - Package and configuration files

**Secondary:**
- **SQL** - Teradata-specific queries with CTEs and recursive lineage traversal

## Runtime

**Frontend Environment:**
- **Node.js** 20.18.0+ - JavaScript runtime
- **npm** - Package manager for frontend

**Backend Environment:**
- **Python** 3.9+ (tested with 3.14.3)
- **pip** - Package manager for Python dependencies

## Frameworks

**Frontend Core:**
- **React** 18.2.0 - UI framework
- **React Router** 6.21.0 - Client-side routing and navigation
- **Vite** 5.0.0 - Module bundler and dev server (port 3000 default)

**Frontend State & Data:**
- **Zustand** 4.4.0 - Client state management (`useLineageStore`, `useUIStore`)
- **TanStack Query (React Query)** 5.17.0 - Server state management with caching
- **TanStack Query DevTools** 5.17.0 - Development debugging for query cache

**Frontend Graph Visualization:**
- **React Flow** (@xyflow/react) 12.0.0 - Interactive graph rendering
- **ELKjs** 0.9.0 - Automatic graph layout algorithm (hierarchical/layered)

**Backend Web:**
- **Flask** 3.0.0+ - HTTP web framework
- **Flask-CORS** 4.0.0+ - Cross-origin request handling

**Backend Database:**
- **teradatasql** 17.20.0+ - Native Teradata database driver

## Key Dependencies

**Critical Backend:**
- `teradatasql` 17.20.0+ - **Why it matters:** Native connection to Teradata database, supports QVCI (DBC.ColumnsJQV views) for complete column metadata extraction
- `flask` 3.0.0+ - **Why it matters:** Single-file Flask app (`lineage-api/python_server.py`) serves all API endpoints
- `python-dotenv` 1.0.0+ - **Why it matters:** Environment variable loading from `.env` file (optional, graceful fallback to env vars only)

**Critical Frontend:**
- `@xyflow/react` 12.0.0 - **Why it matters:** Graph visualization and interactive node/edge interactions
- `elkjs` 0.9.0 - **Why it matters:** Automatic layout prevents manual coordinate management
- `axios` 1.6.0+ - **Why it matters:** HTTP client for all REST API calls to backend

**SQL Parsing (Backend):**
- `sqlglot` 25.0.0+ - **Why it matters:** Column-level lineage extraction for DBQL-based mode (Phase 3)

**Testing Infrastructure:**
- `vitest` 1.1.0 - Frontend unit testing framework
- `@playwright/test` 1.57.0 - Frontend E2E testing
- `jsdom` 24.0.0 - DOM environment for tests
- `@testing-library/react` 14.2.0 - React component testing utilities
- `@testing-library/user-event` 14.5.0 - User interaction simulation
- `msw` 2.1.0 - Mock Service Worker for API mocking in tests

**Styling & UI:**
- `Tailwind CSS` 3.4.0 - Utility-first CSS framework
- `PostCSS` 8.4.0 - CSS transformation
- `AutoPrefixer` 10.4.0 - Vendor prefix support
- `lucide-react` 0.300.0 - Icon library

**Code Quality:**
- `ESLint` - Linting (config: `.eslintrc*`)
- `Prettier` - Code formatting (config: `.prettierrc`)

## Configuration

**Frontend Build Configuration:**
- `vite.config.ts` - Vite bundler config with React plugin, proxy to backend at `http://localhost:8080`
- `tsconfig.json` - TypeScript compiler options (ES2020 target, strict mode enabled)
- `tailwind.config.js` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS plugins

**Frontend Testing Configuration:**
- `vitest.config.ts` - Unit test runner with jsdom environment
- `playwright.config.ts` - E2E test configuration (Chromium only, baseURL `http://localhost:5173`)

**Backend Configuration:**
- `.env` (root directory) - Database and server environment variables
- `python_server.py` - Flask app loads `.env` via `python-dotenv` (optional)
- `database/db_config.py` - Database configuration module with credential fallbacks

**Environment Variables (Required):**
- `TERADATA_PASSWORD` (or fallback `TD_PASSWORD`) - **Required** - Teradata database password
- `TERADATA_HOST` - Teradata host (default: `test-sad3sstx4u4llczi.env.clearscape.teradata.com`)
- `TERADATA_USER` - Teradata username (default: `demo_user`)
- `TERADATA_DATABASE` - Default database (default: `demo_user`)
- `TERADATA_PORT` - Teradata port (default: `1025`)
- `API_PORT` - Flask server port (default: `8080`)

**Environment Variables (Legacy Fallback):**
- `TD_HOST`, `TD_USER`, `TD_PASSWORD`, `TD_DATABASE`, `TD_PORT` - Deprecated aliases, still supported
- `PORT` - Fallback for `API_PORT`

## Platform Requirements

**Development:**
- **Node.js** 20.18.0+
- **Python** 3.9+
- **Teradata database** access (ClearScape test environment or self-hosted)
- QVCI enabled on Teradata (required for `DBC.ColumnsJQV` queries)

**Production:**
- **Teradata database** 16.0+ (QVCI support)
- **Network access** to Teradata host on port 1025 (default) or custom port
- **Python 3.9+** runtime for Flask backend
- **Node.js 18+** for frontend build artifact hosting

## API Proxy Architecture

**Frontend (Vite):**
- Dev server runs on port 3000
- Proxy configuration in `vite.config.ts` routes `/api/*` requests to `http://localhost:8080`
- Frontend sends requests to relative `/api/` URLs, Vite dev server routes to backend

**Backend (Flask):**
- Runs on port 8080 (configurable via `API_PORT`)
- CORS enabled for localhost:3000, 3001, 3004, 5173 (development ports)
- Serves JSON API responses

---

*Stack analysis: 2026-02-13*
