# Pitfalls Research

**Domain:** Adding Impact Analysis, Backend Refactoring, Exception Handling Migration, SQL Parser Consolidation to Existing Teradata Lineage Application
**Researched:** 2026-02-13
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Duplicate Cycle Detection Logic in Impact Analysis

**What goes wrong:**
Impact Analysis queries need to traverse the same recursive lineage graph as existing column/table/database lineage endpoints. If you write separate recursive CTEs without reusing existing cycle detection logic, you'll introduce duplicate bugs. The current system uses `POSITION(... IN path) = 0` for cycle detection in recursive CTEs - if Impact Analysis reimplements this differently, it will produce inconsistent results or fail on circular dependencies.

**Why it happens:**
Developers see Impact Analysis as a "new feature" and write queries from scratch instead of extracting shared logic. The recursive CTE in `python_server.py` (lines 716-762 for upstream, 804-850 for downstream) contains working cycle detection, but it's embedded in endpoint-specific code rather than extracted as reusable logic.

**How to avoid:**
1. Extract recursive lineage traversal into shared Python functions that accept direction and filters
2. All lineage queries (column, table, database, impact) must use the same traversal functions
3. Write integration tests that verify Impact Analysis and existing endpoints return identical graph structure for the same column

**Warning signs:**
- Impact Analysis queries written from scratch rather than calling shared functions
- Different SQL text between Impact Analysis and existing lineage endpoints
- Test data with cycles passes for column lineage but fails for Impact Analysis
- Inconsistent behavior when maxDepth is reached

**Phase to address:**
Phase 1 (Foundation refactoring) - Extract shared lineage traversal logic BEFORE implementing Impact Analysis queries.

---

### Pitfall 2: Breaking Frontend Error Response Contract

**What goes wrong:**
The current backend returns errors as `{"error": "message string"}` in all exception handlers (lines 141-143, 175-177, 243-244, etc.). If exception handling migration changes error response structure (e.g., adding `code`, `details`, `type` fields without frontend updates), TanStack Query error handling in the frontend will break. API client expects `error.response.data.error` - changing this breaks all error displays.

**Why it happens:**
Backend developers improve error handling without checking frontend contract dependencies. Flask exception handlers change response schema for "better structure" but frontend code hardcodes field names. Research shows API changes that add nested objects can break parsers expecting rigid schemas ([Medium: Why did a simple API change break our entire ML pipeline?](https://medium.com/@khayyam.h/why-did-a-simple-api-change-break-our-entire-ml-pipeline-870d16502f43)).

**How to avoid:**
1. Document current error response contract: `{"error": string}` is the ONLY shape allowed
2. If enhancing errors, ONLY add optional fields, never remove/rename `error` field
3. Write contract tests that validate error response JSON schema
4. Update frontend TypeScript types FIRST, then backend responses
5. Consider RFC 9457 Problem Details for future (but requires coordinated frontend update)

**Warning signs:**
- Exception handler changes don't have corresponding frontend commits
- Error responses tested with curl but not through frontend
- Frontend displays generic "An error occurred" instead of specific messages
- Inconsistent error handling between endpoints (some use new format, some use old)

**Phase to address:**
Phase 2 (Exception Handling) - Write contract tests BEFORE refactoring exception handlers.

---

### Pitfall 3: SQL Parser Consolidation Breaks DBQL Extraction

**What goes wrong:**
`populate_lineage.py` uses `dbql_extractor.py` which relies on sqlglot for parsing Teradata SQL from DBQL logs. If consolidating SQL parsers changes dialect configuration, import paths, or error handling, DBQL extraction silently fails or produces incomplete lineage. Research shows sqlglot has dialect-specific challenges and doesn't support all SQL syntax ([DataHub: SQL Parsing Challenges](https://docs.datahub.com/docs/lineage/sql_parsing)).

**Why it happens:**
Developers consolidate "SQL parsing" without realizing DBQL extraction has specific Teradata dialect requirements. sqlglot configuration for Teradata differs from generic SQL parsing. Import path changes break `populate_lineage.py`'s attempt to import dbql_extractor (lines 285-291).

**How to avoid:**
1. Verify DBQL extraction still works AFTER any SQL parser changes
2. Keep `dbql_extractor.py` import path stable or update ALL callers
3. Maintain Teradata dialect configuration separately from other SQL parsing
4. Run `python populate_lineage.py --dbql --dry-run` as regression test
5. Test with real DBQL logs, not synthetic SQL - Teradata-specific syntax is critical

**Warning signs:**
- DBQL extraction returns 0 lineage records after parser changes
- ImportError for dbql_extractor after refactoring
- Lineage population works with --fixtures but fails with --dbql
- sqlglot parse errors for Teradata-specific syntax (QUALIFY, NORMALIZE, etc.)
- Lineage extraction runs but produces fewer records than before

**Phase to address:**
Phase 3 (SQL Parser Consolidation) - Write DBQL extraction regression tests BEFORE consolidating parsers.

---

### Pitfall 4: Large File Refactoring Without Incremental Testing

**What goes wrong:**
`python_server.py` is 1455 lines with 15+ endpoints. Refactoring it in one large commit risks breaking multiple endpoints simultaneously. Testing reveals failures but can't identify which refactoring step introduced the bug. Rolling back loses all work. Research shows incremental refactoring with small steps is critical for large files ([freeCodeCamp: How to Refactor Complex Codebases](https://www.freecodecamp.org/news/how-to-refactor-complex-codebases)).

**Why it happens:**
Developers see refactoring as "cleanup" and try to fix everything at once. The file has mixed concerns (routing, business logic, error handling, DB queries) making it tempting to reorganize comprehensively. Lack of pre-refactoring tests means changes can't be validated incrementally.

**How to avoid:**
1. Add characterization tests for ALL existing endpoints before refactoring
2. Refactor one endpoint at a time, run tests, commit
3. Extract helper functions first, then move route handlers
4. Keep old code commented out until new code passes tests
5. Use strangler fig pattern: new routes call extracted functions, old routes stay unchanged initially

**Warning signs:**
- Refactoring PR changes 500+ lines across multiple endpoints
- Tests added in same commit as refactoring
- Multiple endpoints break simultaneously
- Unable to identify which change caused test failure
- "Works on my machine" but CI tests fail

**Phase to address:**
Phase 1 (Foundation) - Write endpoint characterization tests BEFORE extracting shared logic.

---

### Pitfall 5: Impact Analysis Query Performance Degrades Production

**What goes wrong:**
Impact Analysis needs to query "all downstream columns affected by column X" which could traverse hundreds of tables in production databases. A naive implementation that fetches entire graph client-side will timeout or crash. Teradata recursive CTEs can run indefinitely without proper depth limits or cycle detection.

**Why it happens:**
Developers test Impact Analysis with small fixture data (10-20 tables) where full graph traversal is fast. Production databases have 1000+ tables with complex transformation chains. Research shows recursive CTEs without clear exit conditions cause queries to run indefinitely ([MySQL: Recursive CTE Running Away](https://dev.mysql.com/blog-archive/a-new-simple-way-to-figure-out-why-your-recursive-cte-is-running-away/)).

**How to avoid:**
1. Always enforce maxDepth limit on recursive CTEs (current default is 3 for database, 5 for column)
2. Add query timeout to Teradata connection (not currently set)
3. Test Impact Analysis with production-scale test data (1000+ tables)
4. Consider pagination for large impact results
5. Add database indexes on OL_COLUMN_LINEAGE (source_dataset, target_dataset, is_active)

**Warning signs:**
- Impact Analysis query takes >30 seconds
- Teradata session shows "Active" for minutes
- Frontend timeout errors (504)
- Memory usage spikes on backend server
- Lineage queries work but Impact Analysis times out

**Phase to address:**
Phase 1 (Impact Analysis) - Performance test with production-scale data before deploying.

---

### Pitfall 6: Exception Context Loss During Migration

**What goes wrong:**
Current exception handlers use `traceback.print_exc()` which prints to stdout/stderr but isn't captured in structured logs. When migrating to better exception handling, developers replace print statements with logging but lose the exception context (stack trace, local variables). Debugging production failures becomes impossible.

**Why it happens:**
Python logging requires explicit `exc_info=True` to capture exception context. Developers write `logger.error(str(e))` instead of `logger.exception()`. Research shows proper exception handling must preserve context while avoiding sensitive data leaks ([OneUpTime: Handle Exceptions Properly in Python](https://oneuptime.com/blog/post/2026-01-24-handle-exceptions-properly-python/view)).

**How to avoid:**
1. Use `logger.exception("message")` instead of `logger.error()` in exception handlers
2. Add correlation IDs to track requests across logs
3. Never log sensitive data (credentials, user data) in exception context
4. Return generic error messages to clients, log detailed context privately
5. Test exception logging by triggering errors and verifying log output

**Warning signs:**
- Production errors show message but no stack trace
- Cannot determine which code path caused exception
- Logs missing request context (endpoint, user, parameters)
- Exception messages in logs but no corresponding Python traceback

**Phase to address:**
Phase 2 (Exception Handling) - Add structured logging BEFORE removing print statements.

---

### Pitfall 7: Fixture-Based Tests Hide DBQL Integration Bugs

**What goes wrong:**
Database tests run against fixtures (`populate_lineage.py --fixtures`) which use hardcoded mappings. These fixtures work perfectly but don't test DBQL extraction logic. DBQL extraction bugs only appear in production when real query logs fail to parse.

**Why it happens:**
DBQL extraction requires DBC.DBQLogTbl access and running queries to generate logs - complex to set up in CI. Developers write tests against fixtures because it's faster. Research shows manual data lineage tracking increases risk of missing transformations ([OvalEdge: Data Lineage Challenges](https://www.ovaledge.com/blog/data-lineage-challenges)).

**How to avoid:**
1. Add DBQL extraction integration tests that use sample query logs
2. Create test harness that runs sample SQL and verifies extracted lineage
3. Document DBQL test data requirements in README
4. Run DBQL tests in CI if Teradata access available, skip with warning otherwise
5. Compare fixture lineage vs DBQL lineage for overlapping tables

**Warning signs:**
- All tests pass but production lineage is empty
- `populate_lineage.py --dbql` returns 0 records
- DBQL extractor code has no test coverage
- Tests only run with --fixtures flag
- Production uses DBQL but CI uses fixtures

**Phase to address:**
Phase 3 (SQL Parser Consolidation) - Add DBQL integration tests using sample logs.

---

### Pitfall 8: API Versioning Delay Causes Breaking Changes

**What goes wrong:**
Current API is unversioned - all endpoints at `/api/v2/openlineage/*`. If refactoring requires breaking changes (new required fields, renamed fields, removed endpoints), existing frontend/clients break immediately. Research shows API versioning is safest route for major changes ([Stellar Code: Advanced API Development Best Practices 2026](https://stellarcode.io/blog/advanced-api-development-best-practices-2026/)).

**Why it happens:**
Developers postpone versioning because "we only have one client (the frontend)". But frontend may cache API responses, have multiple versions deployed, or be used by other teams. Breaking changes without migration path cause outages.

**How to avoid:**
1. Introduce `/api/v3/` endpoints for refactored logic
2. Keep `/api/v2/` running unchanged during migration
3. Frontend updates to use v3, then deprecate v2
4. Document migration guide with field mapping changes
5. Add deprecation warnings to v2 endpoints (response headers)

**Warning signs:**
- Backend changes require immediate frontend deployment
- No API version in endpoint paths
- Breaking changes merged without frontend updates
- Old frontend versions stop working after backend deploy

**Phase to address:**
Phase 1 (Foundation) - Decide versioning strategy BEFORE breaking changes.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping pre-refactoring tests | Faster refactoring start | Cannot validate changes don't break behavior | Never - tests are prerequisite |
| In-place exception handler changes | Quick logging improvement | Breaks frontend error parsing | Never - must maintain contract |
| Consolidating SQL parsers without DBQL tests | Cleaner codebase | DBQL extraction silently fails | Never - DBQL is production path |
| Impact Analysis separate queries | Faster feature implementation | Duplicate cycle detection bugs | Never - must reuse traversal logic |
| Testing with fixture data only | Fast CI pipeline | DBQL bugs only found in production | Only if DBQL tests run nightly |
| Single large refactoring commit | Appears more organized | Impossible to debug test failures | Never - incremental commits required |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Frontend error handling | Assuming `response.data` shape stays consistent | Write contract tests validating `{"error": string}` schema |
| DBQL extraction | Consolidating SQL parsers without testing Teradata dialect | Test with real DBQL logs, maintain Teradata-specific config |
| Recursive CTEs | Writing separate cycle detection logic for each query | Extract shared traversal functions with common cycle detection |
| Exception logging | Using `logger.error(str(e))` losing stack traces | Use `logger.exception()` with correlation IDs |
| Impact Analysis | Testing with 10 tables, deploying to 1000-table databases | Load test with production-scale data before deploy |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded recursive CTE | Query runs >30s, Teradata session "Active" indefinitely | Always enforce maxDepth, add query timeout | >100 tables in lineage chain |
| Missing OL_COLUMN_LINEAGE indexes | Slow lineage queries as data grows | Add indexes on (source_dataset, target_dataset, is_active) | >10K lineage records |
| Client-side graph assembly | Frontend memory spike, browser hangs | Server-side graph construction, paginated results | >500 nodes in graph |
| DBQL full table scan | populate_lineage takes hours | Add --since date filter, index DBC.DBQLogTbl.CollectTimeStamp | >1M DBQL records |
| Exception handler blocking | 500 error takes 30s to return | Make logging async, use background queue | High error rate under load |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging full exception in API response | Exposes stack traces, database schema, internal paths | Return generic message to client, log details privately |
| Exception handler reveals database credentials | Connection strings in error messages | Sanitize connection string before logging |
| DBQL extraction runs as admin user | Excessive permissions for lineage population | Use dedicated service account with minimal SELECT grants |
| No rate limiting on Impact Analysis | DOS via expensive recursive queries | Add request rate limits per client |
| Error messages leak table existence | 404 vs 403 reveals what user can't see | Return consistent 404 for unauthorized resources |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Impact Analysis takes 30s with no feedback | User thinks app froze, closes tab | Add loading states, progress indicators, timeout message |
| Exception changes break error display | Generic "Error occurred" instead of specific message | Maintain error response contract, test error displays |
| Lineage query times out silently | Empty graph displayed, user assumes no lineage | Show timeout message, suggest reducing maxDepth |
| Refactoring breaks existing bookmarks | Users' saved lineage URLs stop working | API versioning preserves old endpoints during migration |
| DBQL extraction fails, no notification | Stale lineage data, users make decisions on outdated info | Add data freshness indicator, alert on population failures |

## "Looks Done But Isn't" Checklist

- [ ] **Impact Analysis:** Often missing cycle detection testing — verify with test data containing circular dependencies
- [ ] **Backend Refactoring:** Often missing pre-refactoring characterization tests — verify ALL endpoints have test coverage before extracting code
- [ ] **Exception Handling:** Often missing structured logging correlation IDs — verify you can trace request from frontend to exception log
- [ ] **SQL Parser Consolidation:** Often missing DBQL integration tests — verify `populate_lineage.py --dbql` produces lineage records
- [ ] **API Changes:** Often missing frontend error handling updates — verify error responses still match `{"error": string}` contract
- [ ] **Performance:** Often missing production-scale load testing — verify Impact Analysis works with 1000+ table databases
- [ ] **Cycle Detection:** Often missing cycle test data — verify recursive CTEs handle circular lineage properly
- [ ] **Incremental Refactoring:** Often missing intermediate commits — verify git history shows small, tested changes

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Frontend breaks from error response changes | MEDIUM | 1. Revert backend changes 2. Add contract tests 3. Update frontend first 4. Change backend response with added fields only |
| DBQL extraction broken after parser consolidation | HIGH | 1. Rollback to last working version 2. Add DBQL integration tests 3. Re-attempt consolidation with tests passing |
| Impact Analysis query times out in production | LOW | 1. Add query timeout at database level 2. Reduce default maxDepth from 5 to 3 3. Add pagination |
| Refactoring breaks multiple endpoints | MEDIUM | 1. Revert to working state 2. Write characterization tests for each endpoint 3. Refactor incrementally |
| Exception context lost in logs | LOW | 1. Update logger calls to use `logger.exception()` 2. Add correlation ID middleware 3. Test by triggering errors |
| Duplicate cycle detection bug in Impact Analysis | MEDIUM | 1. Extract shared traversal function 2. Replace Impact Analysis queries with shared function 3. Add cycle detection test data |
| Production lineage empty due to fixture-only testing | HIGH | 1. Emergency: populate with --fixtures 2. Fix DBQL extraction 3. Add DBQL integration tests 4. Re-populate from query logs |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Duplicate cycle detection logic | Phase 1: Foundation | Integration test comparing Impact Analysis vs existing lineage for same column |
| Breaking error response contract | Phase 2: Exception Handling | Contract test validating `{"error": string}` schema on all endpoints |
| DBQL extraction broken | Phase 3: SQL Parser | Run `populate_lineage.py --dbql --dry-run` in CI |
| Large file refactoring without tests | Phase 1: Foundation | All endpoints have characterization tests before extraction |
| Impact Analysis performance | Phase 1: Impact Analysis | Load test with 1000-table database before deploy |
| Exception context loss | Phase 2: Exception Handling | Trigger error and verify stack trace in logs |
| Fixture-based tests hide DBQL bugs | Phase 3: SQL Parser | DBQL integration tests using sample query logs |
| API versioning delay | Phase 1: Foundation | Decision documented: v3 or maintain v2 contract |

## Phase-Specific Warnings

### Phase 1: Impact Analysis + Foundation Refactoring

**Likely Issues:**
- Duplicate cycle detection between Impact Analysis and existing lineage queries
- Large refactoring PRs that change multiple endpoints simultaneously
- Performance issues with production-scale databases not caught in testing

**Mitigation:**
- Extract shared lineage traversal logic BEFORE implementing Impact Analysis
- Write characterization tests for all endpoints BEFORE refactoring
- Test with 1000+ table database before declaring Impact Analysis complete

### Phase 2: Exception Handling Migration

**Likely Issues:**
- Error response JSON schema changes break frontend parsing
- Exception context lost when replacing print statements with logging
- Security risk from logging sensitive data in exceptions

**Mitigation:**
- Write contract tests for error responses BEFORE changing exception handlers
- Use `logger.exception()` with correlation IDs, never `logger.error(str(e))`
- Test error logging by triggering exceptions and verifying log output

### Phase 3: SQL Parser Consolidation

**Likely Issues:**
- DBQL extraction silently fails after import path changes
- Teradata-specific SQL syntax not supported by consolidated parser
- Fixture-based tests pass but DBQL tests fail

**Mitigation:**
- Run DBQL extraction regression test before and after consolidation
- Maintain Teradata dialect configuration separately from generic SQL parsing
- Add DBQL integration tests using real query log samples

## Sources

### Data Lineage Best Practices
- [OvalEdge: Data Lineage Best Practices for 2026](https://www.ovaledge.com/blog/data-lineage-best-practices)
- [Atlan: Data Lineage & Impact Analysis Guide 2026](https://atlan.com/know/data-lineage-impact-analysis/)
- [OvalEdge: Data Lineage Challenges](https://www.ovaledge.com/blog/data-lineage-challenges)
- [Secoda: Challenges of Data Lineage Implementation](https://www.secoda.co/blog/challenges-of-data-lineage-implementation)

### Backend Refactoring
- [freeCodeCamp: How to Refactor Complex Codebases](https://www.freecodecamp.org/news/how-to-refactor-complex-codebases)
- [Tembo: Code Refactoring Best Practices](https://www.tembo.io/blog/code-refactoring)
- [Stellar Code: Advanced API Development Best Practices 2026](https://stellarcode.io/blog/advanced-api-development-best-practices-2026/)
- [Legacy Code: Refactoring at Scale](https://understandlegacycode.com/blog/key-points-of-refactoring-at-scale/)

### Exception Handling
- [OneUpTime: Handle Exceptions Properly in Python 2026](https://oneuptime.com/blog/post/2026-01-24-handle-exceptions-properly-python/view)
- [APIFlask: Error Handling Documentation](https://apiflask.com/error-handling/)
- [Medium: Why API Changes Break ML Pipelines](https://medium.com/@khayyam.h/why-did-a-simple-api-change-break-our-entire-ml-pipeline-870d16502f43)

### SQL Parsing & DBQL
- [DataHub: SQL Parsing Documentation](https://docs.datahub.com/docs/lineage/sql_parsing)
- [DataHub: Extracting Column-Level Lineage from SQL](https://datahub.com/blog/extracting-column-level-lineage-from-sql/)
- [Medium: SQL Parsing using SQLGlot](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59)

### Recursive CTEs & Cycle Detection
- [SQL for Devs: Cycle Detection for Recursive Search](https://sqlfordevs.com/cycle-detection-recursive-query)
- [MySQL: Why Recursive CTE Running Away](https://dev.mysql.com/blog-archive/a-new-simple-way-to-figure-out-why-your-recursive-cte-is-running-away/)
- [PostgreSQL: WITH Queries Documentation](https://www.postgresql.org/docs/current/queries-with.html)
- [VB Consulting: Recursion with PostgreSQL Part 3 - Cycle Detection](https://vb-consulting.github.io/blog/recursion-postgresql/part3-cycle-detection/)

---
*Pitfalls research for: Teradata Column-Level Lineage Application - Impact Analysis & Refactoring Milestone*
*Researched: 2026-02-13*
*Focus: Subsequent milestone risks when adding features to existing production system*
