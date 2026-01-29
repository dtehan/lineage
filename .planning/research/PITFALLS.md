# Pitfalls Research: API Production Hardening

**Domain:** REST API Production Hardening (Validation, Security, Pagination)
**Researched:** 2026-01-29
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Client-Side Only Validation (VALID-01)

**What goes wrong:**
Validation is implemented in the frontend (JavaScript) but not replicated on the server. Attackers bypass client validation entirely using tools like curl, Burp Suite, or direct HTTP requests. They can submit `maxDepth=1000000` or `direction=malicious_payload`, causing database resource exhaustion or injection attacks.

**Why it happens:**
Developers test via the UI and assume the validation "works." Time pressure leads to skipping server-side implementation. The mental model conflates "user input" with "browser input."

**How to avoid:**
- Treat server-side validation as the ONLY validation; client-side is UX enhancement
- Use allowlists for enumerated values (direction must be in ["upstream", "downstream", "both"])
- Apply strict bounds on numeric parameters (1 <= maxDepth <= 10)
- Implement validation at the handler/controller level, not just service level
- Use typed parameters (Go: `strconv.Atoi` with bounds checking; Python: `int()` with range validation)

**Warning signs:**
- No 400 errors in API tests with invalid parameters
- Validation logic only exists in frontend code
- No unit tests for invalid input handling
- Error messages like "database error" instead of "invalid parameter"

**Phase to address:** VALID-01 (Input validation implementation)

**Testing approach:**
```bash
# Test direction validation
curl "/api/v1/lineage/db.table.col?direction=INVALID" # Should return 400
curl "/api/v1/lineage/db.table.col?direction=" # Should return 400 or default

# Test maxDepth bounds
curl "/api/v1/lineage/db.table.col?maxDepth=-1" # Should return 400
curl "/api/v1/lineage/db.table.col?maxDepth=0" # Should return 400
curl "/api/v1/lineage/db.table.col?maxDepth=999" # Should return 400

# Test type coercion attacks
curl "/api/v1/lineage/db.table.col?maxDepth=5; DROP TABLE--" # Should return 400
```

---

### Pitfall 2: Verbose Error Messages Leaking Database Details (SEC-01)

**What goes wrong:**
Exception handlers return raw error messages containing SQL statements, table names, connection strings, stack traces, or internal paths. Attackers use this to map the schema, identify vulnerable queries, and craft targeted attacks.

**Why it happens:**
Development environments need detailed errors for debugging. `except Exception as e: return str(e)` pattern is copy-pasted to production. Error handling is an afterthought added late in development.

**How to avoid:**
- Create a whitelist of safe error messages returned to clients
- Map all database errors to generic "An internal error occurred"
- Log full details server-side with correlation IDs
- Return correlation ID to client for support purposes
- Never include: table names, column names, SQL fragments, file paths, stack traces, connection details

**Warning signs:**
- Current code: `return jsonify({"error": str(e)}), 500`
- No error mapping/translation layer
- `traceback.print_exc()` in production paths
- Error responses contain "Teradata", "SQL", or column names

**Phase to address:** SEC-01 (Generic error messages)

**Testing approach:**
```bash
# Trigger database errors and inspect responses
curl "/api/v1/assets/databases/NONEXISTENT/tables"
# Response should NOT contain: SQL, Teradata, table names, stack traces

# Test malformed asset IDs
curl "/api/v1/lineage/invalid..format"
# Response should be generic, not expose parsing logic

# Verify logs capture details while response hides them
```

---

### Pitfall 3: Default/Hardcoded Credentials in Code (SEC-02)

**What goes wrong:**
Fallback credentials like `"demo_user"` and `"password"` remain in production code. If environment variables are not set correctly during deployment, the application connects with these defaults, potentially exposing production to unauthorized access or connecting to wrong databases.

**Why it happens:**
Developers add fallbacks for local testing convenience. .env files are not deployed or misconfigured. The "it works locally" bias masks production configuration issues.

**How to avoid:**
- Remove ALL default/fallback values for credentials
- Fail fast with clear error if required env vars are missing
- Validate all required configuration at startup before accepting requests
- Use configuration validation libraries or startup checks

**Warning signs:**
- Code contains: `os.environ.get("PASSWORD", "default_password")`
- Application starts successfully with no .env file
- Same credentials work in dev and prod
- Configuration falls back silently without logging

**Phase to address:** SEC-02 (Remove default credentials)

**Testing approach:**
```bash
# Start server with missing credentials
unset TD_PASSWORD && python python_server.py
# Should FAIL with clear error, not start with defaults

# Verify startup logs show configuration validation
# Grep logs for "password", "credential" to ensure none leak
```

---

### Pitfall 4: Offset Pagination Performance Degradation (PAGE-01)

**What goes wrong:**
Using OFFSET/LIMIT pagination with large offsets causes database to scan and discard millions of rows. `offset=1000000` requires scanning 1M+ rows just to skip them. Performance degrades linearly with offset value.

**Why it happens:**
Offset pagination is the most intuitive approach. It works fine in testing with small datasets. Performance impact only appears at scale.

**How to avoid:**
- Set maximum page number or offset cap (e.g., max page 100)
- For deep pagination needs, implement cursor/keyset pagination
- Use ROW_NUMBER() with indexed ORDER BY for Teradata
- Document pagination limitations for API consumers
- Consider different pagination strategy for different endpoints based on expected data volume

**Warning signs:**
- Slow responses for high page numbers
- Database CPU spikes during pagination
- No ORDER BY clause (causes inconsistent results)
- No maximum offset enforced

**Phase to address:** PAGE-01 (Pagination implementation)

**Testing approach:**
```bash
# Test offset bounds
curl "/api/v1/lineage/database/test?page=99999"
# Should return 400 or empty result, not timeout

# Test performance at edges
time curl "/api/v1/lineage/database/test?page=1"
time curl "/api/v1/lineage/database/test?page=100"
# Response times should be comparable
```

---

### Pitfall 5: Breaking Backward Compatibility Silently (COMPAT-01)

**What goes wrong:**
Adding validation that rejects previously-accepted input breaks existing clients. Changing default values alters behavior clients depend on. Removing fields from responses or changing their format breaks client parsing.

**Why it happens:**
"Hardening" is seen as only adding constraints. Existing client usage patterns are unknown. No API versioning strategy exists. Changes are deployed without client communication.

**How to avoid:**
- Review existing client usage before adding restrictions
- Treat default value changes as potentially breaking
- Add new validation as warnings before errors (deprecation period)
- Document ALL changes in changelog with migration guidance
- Consider using API versioning (/v2/) for breaking changes
- Run backward compatibility tests with old client versions

**Warning signs:**
- Client errors after "non-breaking" deploys
- No changelog or migration documentation
- Existing tests break after validation is added
- No telemetry on current parameter usage patterns

**Phase to address:** COMPAT-01 (Backward compatibility review)

**Testing approach:**
```bash
# Capture current API behavior BEFORE changes
# Test same requests AFTER changes
# Compare responses for breaking differences

# Specific checks:
# - Same inputs produce same outputs (or valid errors)
# - Default values match previous defaults
# - Required fields haven't changed
# - Response schema additions are additive only
```

---

### Pitfall 6: Missing Total Count in Pagination (PAGE-02)

**What goes wrong:**
Pagination responses omit total count, making it impossible for clients to show "Page X of Y" or know when to stop fetching. Clients either over-fetch (requesting pages until empty) or under-fetch (stopping arbitrarily).

**Why it happens:**
COUNT queries are expensive on large tables. Developers assume "just keep fetching until empty." UX requirements are unclear during API design.

**How to avoid:**
- Always include total_count, page, and page_size in paginated responses
- For expensive counts, use approximate counts or cached counts
- Alternatively, use cursor pagination with "has_more" flag
- Document clearly if counts are approximate vs exact

**Warning signs:**
- Pagination response lacks `total` or `totalPages`
- Clients make extra requests to detect end of data
- Different pages show inconsistent counts
- No test coverage for pagination metadata

**Phase to address:** PAGE-02 (Pagination response format)

**Testing approach:**
```python
# Verify pagination metadata in all paginated endpoints
response = requests.get("/api/v1/lineage/database/test?page=1&pageSize=10")
assert "totalTables" in response.json()["pagination"]
assert "totalPages" in response.json()["pagination"]
assert "page" in response.json()["pagination"]
assert "pageSize" in response.json()["pagination"]
```

---

### Pitfall 7: DBQL Access Error Handling (DBQL-01)

**What goes wrong:**
DBQL extraction fails silently when user lacks SELECT privileges on DBC.DBQLogTbl or when DBQL logging is disabled. Scripts continue with empty data, populating lineage tables with nothing, or crash with cryptic errors.

**Why it happens:**
DBQL access varies by Teradata environment. ClearScape Analytics has limited DBQL support. Error handling catches generic exceptions without specific guidance.

**How to avoid:**
- Check DBQL access explicitly at startup with clear error messages
- Provide specific error messages for common DBQL issues (3523 error = no access)
- Document DBQL requirements in deployment guide
- Provide fallback mode with clear user guidance (--manual mode)
- Log DBQL access status at application startup

**Warning signs:**
- Lineage tables populated but empty
- "No lineage found" when data should exist
- Generic "database error" messages
- No DBQL access verification in startup sequence

**Phase to address:** DBQL-01 (DBQL error handling)

**Testing approach:**
```bash
# Test with user lacking DBQL access
# Should get clear error: "DBQL access denied. Reason: [specific]. Alternative: --manual mode"

# Test with DBQL disabled environment
# Should detect and report clearly, not fail silently

# Verify extraction stats are logged
# "Queries processed: 0" should trigger warning
```

---

### Pitfall 8: Rate Limiting Implementation Gaps (SEC-03)

**What goes wrong:**
Rate limiting is documented as a requirement but not implemented. Or it's implemented per-endpoint but not globally, allowing attackers to abuse multiple endpoints. Or it uses fixed windows allowing burst attacks at window boundaries.

**Why it happens:**
Rate limiting is deferred as "infrastructure concern." Implementation is complex and varies by deployment environment. Testing rate limits is difficult in development.

**How to avoid:**
- Document rate limiting requirements explicitly (requests/minute, by IP vs by user)
- Implement rate limiting early in request pipeline (before authentication overhead)
- Use sliding window algorithm, not fixed windows
- Apply different limits for authenticated vs unauthenticated requests
- Return proper 429 responses with Retry-After header
- If not implementing, document clearly for infrastructure team

**Warning signs:**
- No 429 responses ever returned
- Rate limiting mentioned in docs but not in code
- Easy to DoS endpoints with simple scripts
- No rate limit headers in responses

**Phase to address:** SEC-03 (Document auth/rate limiting assumptions)

**Testing approach:**
```bash
# Rapid-fire requests to test rate limiting
for i in {1..100}; do curl -s "/api/v1/search?q=test" & done; wait
# Should see 429 responses if rate limiting is implemented
# If not implemented, document this explicitly

# Verify rate limit headers if implemented
curl -I "/api/v1/search?q=test"
# Should include: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Catching all exceptions generically | Prevents crashes | Hides bugs, leaks info | Never in production |
| Hardcoded validation limits | Quick to implement | Requires redeploy to change | MVP only, add config later |
| Logging full request/response bodies | Easier debugging | PII exposure, log bloat | Development only |
| Skipping pagination total counts | Faster queries | Poor UX, client workarounds | Only if documented |
| Using string interpolation in SQL | Faster development | SQL injection risk | Never |
| Returning internal IDs in errors | Easier debugging | Information disclosure | Never |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Teradata DBQL | Assuming DBQL access is universal | Check access at startup, provide fallback |
| Redis Cache | Treating cache failures as fatal | Graceful degradation, serve without cache |
| Environment Config | Using defaults in production | Fail fast if required vars missing |
| CORS | Allowing all origins | Explicit allowlist of trusted origins |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded maxDepth | Slow lineage queries | Cap at reasonable value (10) | Deep lineage graphs |
| No pagination limits | Memory exhaustion | Enforce max pageSize (100) | Large datasets |
| Counting every request | Slow list endpoints | Cache counts, use estimates | 10K+ records |
| Recursive CTE without depth limit | Query timeout | Always include depth < N | Cyclic graphs |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing internal column IDs | Schema enumeration | Use opaque external identifiers |
| Detailed SQL errors to client | Query injection hints | Map to generic errors |
| Default credentials in fallback | Unauthorized access | Fail if credentials missing |
| No input encoding validation | Unicode bypass attacks | Normalize before validation |
| Trusting direction parameter | Logic bypass | Strict allowlist validation |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Vague error "Bad Request" | User can't fix their request | Specific: "maxDepth must be 1-10" |
| Missing pagination info | Can't navigate results | Include page, totalPages, hasNext |
| Inconsistent validation | Confusion on what's valid | Validate same rules everywhere |
| Silent truncation | Unexpected partial data | Return error or warning |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Input Validation:** Has server-side validation, not just frontend - verify by testing with curl
- [ ] **Error Handling:** Returns generic errors to clients - verify by triggering DB errors
- [ ] **Pagination:** Includes total count and handles edge cases - verify page=0, page=99999
- [ ] **Security Config:** No default credentials compile - verify by grepping codebase
- [ ] **DBQL Integration:** Handles missing access gracefully - verify with limited user
- [ ] **Backward Compatibility:** Existing clients still work - verify with saved requests
- [ ] **Rate Limiting:** Either implemented or explicitly documented as deferred - verify docs

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Information disclosure via errors | MEDIUM | Audit logs for exposed data, rotate any leaked credentials, deploy fix immediately |
| Default credentials in production | HIGH | Immediate credential rotation, audit access logs, security review |
| Breaking client compatibility | MEDIUM | Document breaking change, provide migration period, consider rollback |
| Pagination causing DB issues | LOW | Add limits, optimize queries, add caching |
| Missing validation exploited | HIGH | Add validation, audit for abuse, rate limit suspect IPs |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Client-side only validation | VALID-01 | Curl tests with invalid input return 400 |
| Verbose error messages | SEC-01 | No SQL/table names in any error response |
| Default credentials | SEC-02 | App fails to start without credentials |
| Pagination performance | PAGE-01 | Response time consistent across page numbers |
| Breaking changes | COMPAT-01 | Old client requests still work |
| Missing pagination metadata | PAGE-02 | All paginated responses have total count |
| DBQL access failures | DBQL-01 | Clear error message when DBQL unavailable |
| Rate limiting gaps | SEC-03 | Documentation clear on rate limit status |

## Sources

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) - HIGH confidence
- [API Security Best Practices 2025 - Pynt](https://www.pynt.io/learning-hub/api-security-guide/api-security-best-practices) - MEDIUM confidence
- [API Backwards Compatibility Best Practices - Zuplo](https://zuplo.com/blog/2025/04/11/api-versioning-backward-compatibility-best-practices) - MEDIUM confidence
- [REST API Pagination Best Practices - Moesif](https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/) - MEDIUM confidence
- [Google AIP-180: Backwards Compatibility](https://google.aip.dev/180) - HIGH confidence
- [APISecurity.io Top 5 API Vulnerabilities 2025](https://apisecurity.io/issue-286-the-apisecurity-io-top-5-api-vulnerabilities-in-2025/) - MEDIUM confidence
- [Cloudflare Rate Limiting Best Practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/) - HIGH confidence
- Existing codebase analysis (`/Users/Daniel.Tehan/Code/lineage`) - HIGH confidence

---
*Pitfalls research for: API Production Hardening*
*Researched: 2026-01-29*
