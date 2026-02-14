# Coding Conventions

**Analysis Date:** 2026-02-13

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `Button.tsx`, `ErrorBoundary.tsx`, `AppShell.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useUIStore.ts`, `useLineage.ts`, `useAssets.ts`)
- Utilities: camelCase (e.g., `layoutEngine.ts`, `test-utils.tsx`)
- Tests: Same as source file + `.test.ts` or `.spec.ts` suffix (e.g., `Button.test.tsx`, `layoutEngine.test.ts`)
- Python modules: snake_case (e.g., `db_config.py`, `populate_lineage.py`, `test_correctness.py`)
- Python functions: snake_case (e.g., `get_db_connection()`, `validate_required_credentials()`)

**Functions (TypeScript/React):**
- camelCase for all functions: `getNodeWidth()`, `layoutGraph()`, `handleClick()`
- Event handlers: prefix with `handle` (e.g., `onClick={handleClick}`)
- Custom React hooks: start with `use` (e.g., `useLineageHighlight()`, `useGraphSearch()`)

**Variables (TypeScript):**
- camelCase for variables: `sidebarOpen`, `selectedAssetId`, `searchQuery`
- Constants: UPPER_SNAKE_CASE (e.g., `REQUIRED_CREDENTIALS`, `DATABASE`)
- Boolean flags: prefix with `is` or `has` (e.g., `isError`, `hasError`, `enabled`)

**Types (TypeScript):**
- Interface names: PascalCase, typically start with capital letter (e.g., `ButtonProps`, `UIState`, `ErrorBoundaryProps`)
- Type aliases: PascalCase (e.g., `LineageNode`, `LineageEdge`, `PaginatedResult<T>`)
- Enum values: UPPER_CASE (e.g., `DIRECT`, `AGGREGATION`, `CALCULATION`)

**Python:**
- Class names: PascalCase (e.g., `TestResults`, `ErrorBoundaryState`)
- Function names: snake_case (e.g., `get_env()`, `get_config()`, `log_result()`)
- Constants: UPPER_SNAKE_CASE (e.g., `BASE_URL`, `REQUIRED_CREDENTIALS`)

## Code Style

**Formatting:**
- No explicit ESLint/Prettier configuration found in frontend repo
- Code appears to follow standard ES6+ formatting conventions
- TypeScript strict mode enabled (tsconfig.json: `"strict": true`)
- Imports are organized but no barrel files strategy visible

**Linting (Frontend):**
- ESLint configured: `npm run lint` command exists in package.json
- Config file not found in repo, likely using default or local configuration
- TypeScript strict checking enabled with: `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`

**Python:**
- No explicit linting or formatting configuration found
- Code follows PEP 8-ish conventions
- Docstrings present for module-level documentation and public functions
- Type hints used sparsely (older style Python)

## Import Organization

**Order (TypeScript/React):**
1. External libraries (React, third-party packages)
2. Types from external libraries
3. Local relative imports (api, components, stores, utils)
4. Type imports from local files
5. Side effects (CSS imports)

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LineageNode, LineageEdge } from '../../types';
import { layoutGraph } from './layoutEngine';
import '@testing-library/jest-dom';
```

**Path Aliases:**
- Based on tsconfig.json, no path aliases are configured (`moduleResolution: bundler`)
- All imports use relative paths: `../`, `../../`

**Python:**
- Standard library imports first
- Third-party imports second (teradatasql, flask, etc.)
- Local module imports last
- Type hints imported from `typing` module

## Error Handling

**React/TypeScript:**
- Error Boundary component pattern used for catching React errors: `ErrorBoundary.tsx`
- Error states tracked in component state or query state: `isError` flag in TanStack Query
- Error messages displayed in UI via fallback UI or error alerts
- No explicit try-catch in most components; errors bubble up to Error Boundary
- API errors handled via axios/fetch with response status checking

**Python/Flask:**
- try-except blocks used in API endpoints to catch database errors
- All errors return `(jsonify({"error": str(e)}), 500)` for 500 errors
- Credential validation happens at module load time, exits with `sys.exit(1)` on failure
- Database connection errors logged via `import traceback; traceback.print_exc()`
- Exception raised when required env vars missing

**Pattern:**
```python
try:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(...)
            rows = cur.fetchall()
except Exception as e:
    import traceback
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500
```

## Logging

**Framework:**
- Frontend: No dedicated logger; uses `console.log()`, `console.error()` implicitly (not found in codebase)
- Python: Uses `print()` to stderr for errors: `print(..., file=sys.stderr)`

**Patterns:**
- Python: Errors printed to stderr with context
- Python test runner: Uses custom `log_result()` function to track and display test status
- Frontend: No logging patterns found; relies on browser console and error boundaries

**Example (Python):**
```python
print("ERROR: Missing required environment variables:", file=sys.stderr)
for var in missing:
    print(f"  - {var}", file=sys.stderr)
sys.exit(1)
```

## Comments

**When to Comment:**
- Module-level docstrings required for all Python modules (file header)
- Function-level docstrings for public functions in Python
- Inline comments rare; code should be self-documenting
- Test comments include test case IDs: `// TC-UNIT-001: getNodeWidth Function`

**JSDoc/TSDoc:**
- TypeScript interfaces use no comments; property types are self-documenting
- Python uses triple-quoted docstrings (""") for module and function documentation
- No TypeScript JSDoc comments found in codebase

**Example (Python):**
```python
#!/usr/bin/env python3
"""
Database Configuration Module

Reads database credentials from .env file and environment variables with fallback defaults.
Environment variables take precedence over .env file values.
"""

def get_env(*names: str, required: bool = False, default: str = None) -> str:
    """
    Get an environment variable, trying multiple names in priority order.

    Args:
        *names: Variable names to try, in priority order
        required: If True, exit with error if no value found
        default: Default value if not required and no value found

    Returns:
        First non-empty value found, or default if none found
    """
```

## Function Design

**Size:**
- Frontend: Generally small functions (10-50 lines)
- API routes: 20-40 lines; queries extracted to separate SQL strings
- Utility functions: Keep to single responsibility (e.g., `getNodeWidth()` only calculates width)

**Parameters:**
- Prefer explicit parameters over options objects for < 3 params
- Use options objects for > 3 params or optional config: `layoutGraph(nodes, edges, { direction: 'RIGHT' })`
- TypeScript requires full type annotations on parameters
- Python uses type hints optionally

**Return Values:**
- Single, clear return type per function
- Async functions return Promises in TypeScript: `async (): Promise<OpenLineageLineageResponse>`
- Python functions return typed values: `-> str`, `-> dict`
- No implicit returns; explicit `return` statements

**Example (TypeScript):**
```typescript
export async function getLineageGraph(
  datasetId: string,
  fieldName: string,
  params?: LineageQueryParams
): Promise<OpenLineageLineageResponse> {
  const { refresh, ...queryParams } = params || {};
  const response = await apiClientV2.get<OpenLineageLineageResponse>(
    `/api/v2/openlineage/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}`,
    { params: { ...queryParams, ...(refresh ? { refresh: 'true' } : {}) } }
  );
  return response.data;
}
```

## Module Design

**Exports:**
- Named exports for all public functions: `export function Button() {}`
- Default exports avoided (no `export default`)
- Re-exports from barrel files common (e.g., `src/components/common/index.ts` exports `ErrorBoundary`)

**Barrel Files:**
- Location: `src/components/common/index.ts`, `src/components/layout/index.ts`
- Purpose: Consolidate exports for easier imports
- Pattern: `export { Button } from './Button';`

**Example (TypeScript):**
```typescript
// components/common/index.ts
export { Button } from './Button';
export { ErrorBoundary } from './ErrorBoundary';
export { LoadingSpinner } from './LoadingSpinner';
export { Input } from './Input';
```

---

*Convention analysis: 2026-02-13*
