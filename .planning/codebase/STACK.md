# Technology Stack

**Analysis Date:** 2026-01-29

## Languages

**Primary:**
- Go 1.23.0 - Backend API server and command-line tools
- TypeScript 5.3.0 - Frontend React application with strict type checking
- Python 3.x - Database setup, testing, and alternative backend (Flask)
- SQL (Teradata) - Lineage metadata queries, CTEs for graph traversal

**Secondary:**
- JavaScript (ES2020) - Runtime target for frontend bundling

## Runtime

**Environment:**
- Node.js (LTS) - Required for frontend development and build
- Go runtime - Backend server execution
- Python 3.7+ - Database scripts and optional Flask backend

**Package Manager:**
- npm - JavaScript dependency management (`lineage-ui/package.json`)
  - Lockfile: `package-lock.json` (present)
- Go modules - Dependency management (`lineage-api/go.mod`)
  - Lockfile: `go.sum` (present)
- pip - Python dependency management (`requirements.txt`)
  - No lockfile (loose versioning with `>=` constraints)

## Frameworks

**Core:**
- React 18.2.0 - UI framework for frontend (`lineage-ui/`)
- Chi v5.0.11 - HTTP router for Go backend (`github.com/go-chi/chi/v5`)
- Flask 3.0.0 - Alternative Python web framework (fallback for testing)

**Frontend Libraries:**
- Vite 5.0.0 - Build tool and dev server with HMR
- TanStack Query (React Query) 5.17.0 - Data fetching and caching (`@tanstack/react-query`)
- React Router DOM 6.21.0 - Client-side routing
- React Flow 12.0.0 - Graph visualization library (`@xyflow/react`)
- ELKjs 0.9.0 - Hierarchical graph layout engine
- Zustand 4.4.0 - Lightweight state management
- Tailwind CSS 3.4.0 - Utility-first CSS framework
- Lucide React 0.300.0 - Icon library

**Testing:**
- Vitest 1.1.0 - Unit test runner (frontend)
- React Testing Library 14.2.0 - Component testing utilities
- Playwright 1.57.0 - E2E testing framework
- msw 2.1.0 - Mock Service Worker for API mocking
- axe-core 4.11.1 - Accessibility testing

**Go Backend:**
- sqlx 1.3.5 - SQL query builder and result scanning
- Viper 1.21.0 - Configuration management
- Testify 1.11.1 - Testing assertions and mocking

## Key Dependencies

**Critical:**
- teradatasql 17.20.0+ - Teradata database driver (Python)
  - Why: Primary data source for lineage metadata
- github.com/Teradata/gosql-driver - Teradata ODBC driver (Go alternative)
  - Why: Enables native Go database connectivity
- axios 1.6.0 - HTTP client for frontend API calls
  - Why: Handles all REST API communication with backend

**Infrastructure:**
- redis/go-redis v9.4.0 - Redis client for caching
  - Why: Optional caching layer for lineage graph queries (graceful fallback if unavailable)
- sqlglot 25.0.0 - SQL parser for column-level lineage extraction
  - Why: Parses Teradata SQL to extract column-to-column relationships
- flask-cors 4.0.0 - CORS middleware for Python Flask
  - Why: Enables cross-origin requests from frontend
- go-chi/cors v1.2.1 - CORS middleware for Go
  - Why: Enables cross-origin requests from frontend to Go backend

**Frontend Utilities:**
- html-to-image 1.11.13 - Convert graph to PNG/JPEG for export
- autoprefixer 10.4.0 - PostCSS plugin for vendor prefixes
- postcss 8.4.0 - CSS transformations

## Configuration

**Environment:**
- Configuration via `.env` file or environment variables
- Environment variables take precedence over `.env` file
- `python-dotenv 1.0.0+` for loading `.env` files in Python scripts
- Viper for loading in Go applications

**Key Environment Variables:**
- `TERADATA_HOST`, `TERADATA_USER`, `TERADATA_PASSWORD`, `TERADATA_DATABASE` - Database connection (Go/Python server)
- `TD_HOST`, `TD_USER`, `TD_PASSWORD`, `TD_DATABASE` - Database connection (Python database scripts)
- `TERADATA_PORT` - Database port (default: 1025)
- `REDIS_ADDR`, `REDIS_PASSWORD`, `REDIS_DB` - Redis cache configuration (optional)
- `PORT` - HTTP server port (default: 8080)
- `VITE_API_URL` - Frontend API base URL (default: `http://localhost:8080/api/v1`)

**Build Configuration:**
- `vite.config.ts` - Vite build config with React plugin and dev server proxy
- `vitest.config.ts` - Vitest test runner configuration
- `tsconfig.json` - TypeScript compiler options (strict mode, ES2020 target)
- `Makefile` - Go build targets (build, test, coverage, lint, fmt)
- `config.yaml` - Go backend configuration template with environment variable substitution

## Platform Requirements

**Development:**
- Node.js 16+ (for frontend tooling)
- Go 1.23.0 (for backend compilation)
- Python 3.7+ (for database scripts)
- Teradata credentials and network access
- Optional: Redis server (for caching)
- Optional: golangci-lint (for Go linting)

**Production:**
- Teradata database (lineage metadata storage)
- Optional: Redis server (for caching lineage queries)
- Backend: Go binary or Python Flask server on port 8080
- Frontend: Static assets served from Vite build or CDN

---

*Stack analysis: 2026-01-29*
