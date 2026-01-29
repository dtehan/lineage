# Codebase Concerns

**Analysis Date:** 2026-01-29

## Tech Debt

### Input Validation and Bounds Checking

**Area:** HTTP handlers - maxDepth parameter

- **Issue:** No maximum bounds validation on recursive depth parameter. Users can specify `maxDepth=999` causing expensive recursive CTEs on large lineage graphs
- **Files:** `lineage-api/internal/adapter/inbound/http/handlers.go` (lines 85-95, 117-123, 138-144)
- **Impact:** Potential denial of service through unbounded query execution; slow recursive CTE traversal without maximum depth enforcement
- **Fix approach:** Implement bounds checking: validate `maxDepth` with max value of 20-50 depending on performance testing. Return 400 Bad Request for invalid values
- **Priority:** High - directly affects system stability

**Area:** HTTP handlers - direction parameter

- **Issue:** No validation that direction parameter is one of valid values ("upstream", "downstream", "both"). Invalid values silently default to "both"
- **Files:** `lineage-api/internal/adapter/inbound/http/handlers.go` (lines 85-88)
- **Impact:** Unclear API behavior; caller cannot distinguish between intentional "both" and malformed request
- **Fix approach:** Validate direction against whitelist, return 400 Bad Request with error message for invalid values
- **Priority:** Medium - affects API clarity

### SQL Injection Risk

**Area:** Database cleanup in populate_lineage.py

- **Issue:** Dynamic table names constructed with f-string in `cursor.execute(f"DELETE FROM demo_user.{table}")` (line 253, 421)
- **Files:** `database/populate_lineage.py` (lines 251-255, 419-425)
- **Impact:** While table list is hardcoded internally, pattern creates risk if code is later modified or refactored
- **Fix approach:** Use parameterized queries or whitelist validation for table names instead of f-string formatting
- **Priority:** Low - currently mitigated by hardcoded table list, but poor practice

### Default Credentials Exposed

**Area:** Database configuration

- **Issue:** Hardcoded default credentials in configuration files: `db_config.py` has `password="password"` and `host="test-sad3sstx4u4llczi.env.clearscape.teradata.com"` as defaults (lines 35-37)
- **Files:** `database/db_config.py` (lines 35-37)
- **Impact:** If .env file is missing, application falls back to demo credentials; credentials visible in source control history
- **Fix approach:**
  1. Remove default password entirely; require TERADATA_PASSWORD env var
  2. Use distinct development vs production host configuration
  3. Document that .env.example should not contain real credentials
- **Priority:** High - security concern

### Missing Error Handling Edge Cases

**Area:** Database connection and closure

- **Issue:** No graceful degradation when database connection fails after successful initial connection. If DB fails mid-request, responses expose raw database error messages to API consumers
- **Files:** `lineage-api/internal/adapter/inbound/http/handlers.go` (lines 38, 54, 70, 106)
- **Impact:** Information disclosure through error messages; poor user experience
- **Fix approach:**
  1. Wrap database errors in generic error responses
  2. Log detailed errors server-side only
  3. Return consistent API error format
  4. Implement connection retry logic
- **Priority:** High - affects both security and reliability

### Unbounded Query Results

**Area:** Asset listing endpoints

- **Issue:** `ListDatabases`, `ListTables`, `ListColumns` return all results without pagination. For systems with thousands of columns, response could be huge
- **Files:** `lineage-api/internal/adapter/outbound/teradata/asset_repo.go` (ListDatabases lines 22-72, GetColumns lines 165-200)
- **Impact:** Memory consumption, slow responses, large JSON payloads. Violates API scalability principles
- **Fix approach:**
  1. Implement cursor/offset pagination with configurable page size (50-500 items default)
  2. Add `limit` and `offset` query parameters to handlers
  3. Return total count and has_next in response metadata
- **Priority:** High - critical for production scale

### Redis Fallback Not Integrated

**Area:** Caching layer

- **Issue:** Redis cache infrastructure exists (`cache.go` with NoOp fallback), but is not actually used by any repository or service layer. Code organization suggests caching was planned but abandoned
- **Files:** `lineage-api/internal/adapter/outbound/redis/cache.go` (entire file) - referenced in config but never instantiated in main.go
- **Impact:** Dead code; misleading architecture; cache benefits never realized
- **Fix approach:**
  1. Either fully integrate Redis caching into repositories with TTL
  2. Or remove Redis infrastructure entirely
  3. If keeping Redis: wrap lineage graph queries and asset lists with cache layer
- **Priority:** Medium - affects maintainability; moderate performance impact

### Missing Validation for Asset IDs

**Area:** Asset repository search

- **Issue:** Search endpoints in `asset_repo.go` (lines 241-290) accept search patterns directly without validating they are valid SQL LIKE patterns. Could allow performance attacks through expensive wildcard patterns (`%a%b%c%...`)
- **Files:** `lineage-api/internal/adapter/outbound/teradata/asset_repo.go` (lines 241-290)
- **Impact:** Potential query performance degradation; no protection against malicious search patterns
- **Fix approach:**
  1. Validate search pattern length (max 100 chars)
  2. Escape special SQL wildcards or pre-process pattern
  3. Add query timeout to search operations
- **Priority:** Medium - affects search performance

## Known Bugs

### Test TC-EXT-009 Fails Permanently

**Symptom:** Database test fails with "Got nullable=None" every time

**Files:** `database/run_tests.py` - test TC-EXT-009 (Extract Columns - Nullable and Default Values)

**Trigger:** Run `python run_tests.py` - test always fails because it looks for `LIN_DATABASE.database_id` which is excluded from extraction

**Current status:** Test documented in `specs/tech_debt.md` (TD-003) as OPEN. Workaround exists but test not fixed

**Impact:** 1 failing test in CI/CD pipeline; noise in test results; indicates untested extraction logic for nullable fields

**Fix approach:** Update test to use actual extracted column like `demo_user.FACT_SALES.sales_sk` instead of `LIN_DATABASE.database_id`

**Priority:** Low - well-documented, non-blocking

## Security Considerations

### Credentials in Environment Variables Without Encryption

**Area:** All services

- **Risk:** Teradata password and Redis password stored as plaintext environment variables
- **Files:** `lineage-api/internal/infrastructure/config/config.go` (lines 46-47, 52)
- **Current mitigation:** Relies on OS-level environment variable protection and secrets management at deployment time
- **Recommendations:**
  1. Document requirement for secrets vault (HashiCorp Vault, AWS Secrets Manager, etc.)
  2. Implement credential rotation for service accounts
  3. Use short-lived tokens if possible instead of static passwords
  4. Add audit logging for credential access
- **Priority:** High - fundamental security requirement

### No Authentication on API Endpoints

**Area:** All HTTP endpoints

- **Risk:** All API endpoints accessible without authentication or API keys
- **Files:** `lineage-api/internal/adapter/inbound/http/router.go` (entire routing setup)
- **Current mitigation:** Assumes deployment behind authentication proxy or internal network
- **Recommendations:**
  1. Document that API must be behind auth proxy (OAuth2, mTLS, etc.)
  2. Add optional JWT/API key middleware for standalone deployments
  3. Log all API access with user/service identity
  4. Consider implementing RBAC for different lineage views
- **Priority:** High - requires documentation and possibly implementation

### No Rate Limiting

**Area:** HTTP endpoints

- **Risk:** API endpoints can be hit unlimited times; no protection against brute force or DoS attacks
- **Files:** `lineage-api/internal/adapter/inbound/http/router.go`
- **Impact:** Expensive recursive CTE queries can be triggered repeatedly, consuming database resources
- **Recommendations:**
  1. Implement rate limiting middleware (token bucket or sliding window)
  2. Rate limit per IP or per authenticated user (30-60 req/min for recursive queries)
  3. Implement circuit breaker for database connections
- **Priority:** High for production deployments

### Error Messages Expose System Details

**Area:** HTTP error responses

- **Risk:** Database error messages returned directly to clients (e.g., line 38, 54, 70 in handlers.go with `err.Error()`)
- **Files:** `lineage-api/internal/adapter/inbound/http/handlers.go` (multiple lines)
- **Impact:** Information disclosure about database schema, driver version, connection details
- **Recommendations:**
  1. Log detailed errors server-side
  2. Return generic error messages to clients
  3. Use error IDs for reference in logs
- **Priority:** High - information disclosure concern

## Performance Bottlenecks

### Recursive CTE Traversal for Large Graphs

**Problem:** Upstream/downstream lineage queries use recursive CTEs without depth-first memoization

**Files:** `lineage-api/internal/adapter/outbound/teradata/lineage_repo.go` (lines 48-92 for upstream, lines 107-161 for downstream)

**Cause:** Recursive CTE implementation does full traversal without query optimization. For deep lineage graphs, this becomes exponentially expensive. Path cycle detection uses POSITION() string matching (line 90) instead of hash set

**Impact:** Queries >15 levels deep timeout (observed default maxDepth is 10, which is safe but close to edge)

**Improvement path:**
  1. Add query timeout enforcement (set to 30 seconds max)
  2. Optimize cycle detection using MD5 hash instead of string POSITION
  3. Consider materialized views for common depth queries
  4. Add caching for full graphs (rarely change)
  5. Implement iterative query instead of single CTE (N queries vs 1 complex query)

**Priority:** Medium - works for current use cases but doesn't scale

### Search Operation Uses LIKE on Large Tables

**Problem:** Asset search uses LIKE wildcard on potentially millions of rows without indexes

**Files:** `lineage-api/internal/adapter/outbound/teradata/asset_repo.go` (lines 264-270, 277-283, 286-290)

**Cause:** Queries search across all databases/tables/columns with `LIKE ?` pattern. ClearScape environment documented (tech_debt.md) as having no secondary indexes

**Impact:** Linear table scans; slow response times as data grows

**Improvement path:**
  1. Add secondary indexes on searchable columns (database_name, table_name, column_name)
  2. Implement autocomplete with prefix-based queries (more indexable)
  3. Consider full-text search if available in Teradata
  4. Add query plan analysis/monitoring

**Priority:** Medium - search works but degrades with scale

### No Connection Pooling Configuration

**Problem:** Database connection pooling not configured; uses Go sql.DB defaults

**Files:** `lineage-api/internal/adapter/outbound/teradata/connection.go` (lines 19-45)

**Impact:** No control over max connections, idle timeout, or connection reuse

**Improvement path:**
  1. Add configuration for pool size (MaxOpenConns: 25-50 for typical workload)
  2. Set MaxIdleConns (10-25)
  3. Set ConnMaxLifetime (30 min)
  4. Monitor connection pool usage metrics

**Priority:** Medium - important for production reliability

## Fragile Areas

### Database Schema Extraction Logic

**Files:** `database/populate_lineage.py` (lines 26-121), specifically `EXTRACT_DATABASES`, `EXTRACT_TABLES`, `EXTRACT_COLUMNS`

**Why fragile:**
  1. Hardcoded timestamp: `TIMESTAMP '2024-01-15 10:00:00'` hardcoded in all extraction queries (lines 35, 50, 111)
  2. ClearScape limitations documented but not enforced in code - no validation that target environment supports all features
  3. Extraction assumes specific DBC view column names and formats - brittle to Teradata version changes
  4. No validation that extracted data is complete (e.g., all databases extracted, no partial failures)

**Safe modification:**
  1. Use current timestamp from Python, not hardcoded value
  2. Add pre-extraction checks for required DBC views
  3. Add post-extraction validation (counts, spot checks)
  4. Document minimum Teradata version supported

**Test coverage:** Database test suite (run_tests.py) has 73 tests but TC-EXT-009 is broken; not all extraction cases covered

**Priority:** Medium - extraction works for current setup but fragile for upgrades

### Lineage Graph Building Logic

**Files:** `lineage-api/internal/adapter/outbound/teradata/lineage_repo.go` (lines 195-270, buildGraph method)

**Why fragile:**
  1. Complex graph construction from multiple query results
  2. Manual deduplication of nodes and edges using maps (lines 210-240)
  3. No validation that graph is acyclic (though cycle detection is in CTE)
  4. Downstream table lineage calculation (lines 241-270) appears to have incomplete logic - not all table dependencies traced

**Safe modification:**
  1. Add unit tests for buildGraph with various lineage patterns (simple, diamond, fork/join)
  2. Add validation that resulting graph matches expected node/edge counts
  3. Add documentation of graph construction algorithm
  4. Consider extracting to separate domain service

**Test coverage:** Integration tests exist (`lineage_repo_test.go` 216 lines) but only cover basic cases

**Priority:** Medium - affects correctness of displayed lineage

### SQL Parser Fallback Behavior

**Files:** `database/sql_parser.py` (TeradataSQLParser class, lines 68-end)

**Why fragile:**
  1. When sqlglot parsing fails, falls back to regex-based pattern matching (low confidence)
  2. No handling of CTEs, window functions, or complex subqueries
  3. Confidence scores (lines 75-78) not validated against actual lineage accuracy
  4. Parser returns best-effort results without indicating confidence or fallback usage

**Safe modification:**
  1. Add parse error logging with SQL text for debugging
  2. Separate high-confidence (sqlglot parsed) from low-confidence (regex fallback) results
  3. Add metrics tracking parse success rate
  4. Document supported SQL patterns and limitations
  5. Add tests for edge cases (CTEs, window functions, MERGE statements)

**Test coverage:** No unit tests for SQL parser; only integration tests via DBQL extraction

**Priority:** High - affects accuracy of lineage data

## Scaling Limits

### Database Record Capacity

**Current capacity:** System tested with ~200 tables, ~2000 columns, ~500 lineage relationships

**Limit:** Not formally tested, but architectural concerns appear around:
  1. Recursive CTE depth >15 may timeout (no hard limit enforced)
  2. Search performance degrades without indexes (ClearScape limitation)
  3. Frontend graph visualization untested with >500 nodes

**Scaling path:**
  1. Comprehensive performance testing at 10K tables, 100K columns, 10K lineage edges
  2. Implement pagination for large asset lists
  3. Add query timeout enforcement (30 sec max)
  4. Implement lazy-loading of lineage graphs in frontend
  5. Consider partitioning lineage data by database in large environments

**Priority:** Low-Medium - future consideration, not blocking current use

### Frontend Graph Rendering

**Current tested scale:** ~20-30 nodes on screen without performance issues

**Limit:** React Flow + ELKjs layout may struggle with >100 nodes

**Scaling path:**
  1. Add viewport clipping to only render visible nodes
  2. Implement level-of-detail rendering (simplified nodes when zoomed out)
  3. Lazy-load child nodes on expansion rather than loading entire graph
  4. Benchmark with 100, 500, 1000 node graphs
  5. Consider alternative visualization for very large graphs (matrix/table view)

**Priority:** Low - affects large lineage graphs, uncommon in typical use

### Python Script Execution Memory

**Problem:** Database scripts (populate_lineage.py, extract_dbql_lineage.py) load full result sets into memory before processing

**Files:** All database scripts use cursor.fetchall() pattern

**Impact:** Large extractions (>100K records) may consume significant memory

**Scaling path:**
  1. Convert to streaming/batch processing with batch sizes of 1000-5000
  2. Use generators instead of lists for result processing
  3. Add memory monitoring and warning logs
  4. Test with 1M+ records

**Priority:** Low - current datasets small, but good practice

## Dependencies at Risk

### SQLGlot Version Pinning

**Risk:** SQL parser depends on sqlglot>=25.0.0 with no upper bound. Major version updates could break SQL parsing

**Files:** `database/sql_parser.py` (line 15), `database/requirements.txt` (should specify version)

**Impact:** DBQL-based lineage extraction could fail after pip install on future Teradata deployments

**Migration plan:**
  1. Pin sqlglot to specific minor version (e.g., ==25.1.0) in requirements.txt
  2. Document required version compatibility
  3. Add test cases for Teradata-specific SQL patterns
  4. Have fallback to manual mappings if parser fails

**Priority:** Medium - affects reproducibility

### Teradata Driver Selection

**Risk:** Multiple driver implementations (teradata GoSQL, odbc, stub) selected at build time. If primary driver becomes unavailable, fallback mechanism unclear

**Files:** `lineage-api/internal/adapter/outbound/teradata/connection.go` (lines 22-33)

**Impact:** Deployment could fail if expected driver not available, with unclear error messages

**Migration plan:**
  1. Document driver selection strategy and build flags
  2. Add validation of driver selection at startup with clear error messages
  3. Test all three driver paths (native, ODBC, stub)
  4. Consider explicit configuration parameter instead of build-time selection

**Priority:** Low - not affecting current deployments but affects flexibility

### Go Module Dependencies

**Risk:** Chi router and other Go dependencies not explicitly version-pinned in checked-in go.mod

**Files:** `lineage-api/go.mod` (should have specific versions)

**Impact:** Builds may pull different dependency versions; reproducibility issues

**Migration plan:**
  1. Ensure go.mod is checked in with explicit versions
  2. Run go mod tidy before commits
  3. Set up dependabot or similar for security updates

**Priority:** Low - standard Go practice

## Missing Critical Features

### Audit Logging

**Problem:** No audit trail of who accessed what lineage data when

**Blocks:**
  1. Compliance with data governance policies
  2. Impact analysis investigation (who looked at what before it broke)
  3. Security incident response

**Recommendation:** Implement audit log middleware that records:
  1. User/service identity (if authenticated)
  2. Endpoint accessed and parameters
  3. Result set size
  4. Query execution time
  5. Any errors

**Priority:** High if used in regulated environments, Low otherwise

### Lineage Export/Download

**Problem:** Lineage graphs shown in UI but cannot be exported for documentation or reporting

**Blocks:**
  1. Sharing lineage diagrams with stakeholders
  2. Integration with enterprise data governance tools

**Recommendation:** Implement export endpoints for:
  1. Graph as SVG/PNG (with proper layout)
  2. Lineage as CSV (columns with sources/targets)
  3. Full lineage as JSON for programmatic use

**Priority:** Low - nice-to-have, not blocking core functionality

### Lineage Refresh/Invalidation

**Problem:** Once lineage is populated, no mechanism to refresh from DBQL or manually update relationships

**Blocks:**
  1. Keeping lineage current with code changes
  2. Correcting manual lineage mappings without full re-extraction

**Recommendation:**
  1. Implement selective refresh: update only changed lineage (via DBQL since watermark)
  2. Implement manual lineage edit UI (add/remove/modify relationships)
  3. Add versioning to track lineage changes over time

**Priority:** Medium - important for production use

## Test Coverage Gaps

### End-to-End Lineage Validation

**What's not tested:** Full lineage path validation from source to destination through multiple hops

**Files:** `specs/test_plan_frontend.md` has E2E tests but focuses on UI interaction, not lineage correctness

**Risk:** Lineage path could be incorrect (missing intermediate nodes, wrong directions) without test catching it

**Priority:** High - affects correctness of core feature

### Large Graph Performance Tests

**What's not tested:** Lineage graph performance with >100 nodes, >200 edges

**Files:** No performance benchmarks in test suite

**Risk:** Frontend could hang on large lineage graphs discovered in production

**Priority:** Medium - affects usability at scale

### DBQL Extraction Error Cases

**What's not tested:** Behavior when DBQL tables missing, malformed queries in DBQL, partial extraction failure

**Files:** `database/extract_dbql_lineage.py` has implementation but no test suite

**Risk:** DBQL extraction could silently fail or produce partial results

**Priority:** High - critical for production lineage discovery

### Cycle Detection in Lineage

**What's not tested:** Behavior when lineage graph contains cycles (though documented as rare)

**Files:** Database test suite has CTE cycle detection tests (`insert_cte_test_data.py`) but frontend not tested with cyclic lineage

**Risk:** UI graph layout could hang or display incorrectly with cycles

**Priority:** Medium - edge case but should be tested

### Data Validation at API Boundary

**What's not tested:** API behavior with invalid asset IDs, non-existent databases, malformed queries

**Files:** `specs/test_plan_backend.md` has API tests but coverage of error cases unclear

**Risk:** Unclear how API handles invalid inputs; user experience degrades

**Priority:** Low-Medium - affects robustness

---

## Summary by Priority

### Critical (Fix Before Production)
1. Input validation for maxDepth and direction parameters
2. Default credentials exposure
3. Error message information disclosure
4. Unbounded query results (missing pagination)
5. No authentication on API endpoints (document requirement)
6. No rate limiting (document or implement)
7. DBQL extraction error handling

### High
1. Redis cache infrastructure unused
2. Fragile SQL parser with fallback behavior
3. Lineage graph building correctness
4. Database schema extraction brittleness
5. End-to-end lineage validation testing
6. Credentials in plaintext environment variables

### Medium
1. Search performance without indexes
2. Recursive CTE performance for deep graphs
3. Connection pooling not configured
4. SQLGlot version pinning
5. Lineage refresh/invalidation capability
6. Large graph performance testing

### Low
1. SQL injection in database cleanup (mitigated)
2. Test TC-EXT-009 failure (documented)
3. Teradata driver selection clarity
4. Go module dependency pinning
5. Audit logging capability
6. Lineage export/download feature
7. Cycle detection in frontend

---

*Concerns audit: 2026-01-29*
