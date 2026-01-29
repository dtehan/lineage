# Project Research Summary

**Project:** Lineage Application - Production Readiness
**Domain:** REST API Production Hardening (Go/React Data Lineage Application)
**Researched:** 2026-01-29
**Confidence:** HIGH

## Executive Summary

This project hardens an existing Teradata column-level lineage application for production deployment by addressing 7 critical security, validation, and scalability concerns. The application is functionally complete with solid architecture (Go with Chi router in hexagonal pattern, React 18 with TypeScript) but requires production-grade input validation, secure error handling, and result set controls before external deployment.

The research confirms that Go's 2026 ecosystem provides mature, well-maintained libraries for all hardening needs. The key recommendation is to use standard library solutions where possible (log/slog for logging) combined with proven third-party libraries (go-playground/validator v10 for validation). The recommended approach is to layer validation at boundaries (HTTP adapter validates syntax and bounds, application layer validates business rules, domain layer protects invariants) while mapping all internal errors to generic client responses with detailed server-side logging.

The critical risks are information leakage through verbose errors (exposes database schema to attackers), unbounded resource consumption (allows DoS via large maxDepth or missing pagination), and silent failures in production (default credentials or missing DBQL access). These are mitigated through explicit error mapping at layer boundaries, strict parameter validation with hard limits, and fail-fast configuration validation at startup.

## Key Findings

### Recommended Stack

The existing stack (Go 1.23, Chi router, React 18, TypeScript, Vite) requires minimal additions for production hardening. Focus is on integrating production-grade libraries without architectural changes.

**Core technologies:**
- **go-playground/validator v10.30.1**: Struct-based input validation — industry standard with 23,000+ imports, thread-safe, zero-allocation design
- **log/slog (stdlib)**: Structured logging — eliminates external dependency, zero-allocation design, standard library backing guarantees long-term support
- **golangci-lint v2.8.0**: Meta-linter with gosec integration — aggregates 50+ linters including security analysis, fast parallel execution
- **govulncheck (stdlib)**: Dependency vulnerability scanning — official Go toolchain for supply chain security
- **react-error-boundary 5.x**: React error boundary wrapper — standard solution for catching render errors in hooks-based codebase

**Key insight**: For new projects in 2026, log/slog is recommended over Zap/Zerolog despite being 2x slower in benchmarks because zero dependencies reduce supply chain risk and standard library backing ensures longevity. Only choose Zerolog if profiling shows logging as a bottleneck (>100k req/s).

### Expected Features

Production hardening features are categorized by severity and operational impact.

**Must have (table stakes):**
- Parameter bounds validation (maxDepth 1-20, direction whitelist, limit 1-100) — prevents resource exhaustion DoS attacks
- Structured error responses with no database detail exposure — prevents schema reconnaissance by attackers
- No default credentials in source code — requires explicit configuration, fails fast if missing
- Result set limits (max 500-1000 nodes per lineage response) — prevents memory exhaustion on server and client
- HTTP security headers (Content-Security-Policy, X-Content-Type-Options, X-Frame-Options) — mandatory per OWASP guidelines

**Should have (competitive):**
- Consistent pagination across all list endpoints with metadata (total, page, pageSize, hasMore) — improves API usability
- Request logging with correlation IDs — enables production debugging and tracing
- Security documentation (deployment guide with TLS, auth, CORS requirements) — prevents misconfiguration
- DBQL extraction error handling improvements — graceful degradation for batch processes

**Defer (v2+):**
- Rate limiting with Redis backend — document as infrastructure concern for now
- Circuit breaker for database connections — only needed at high scale
- Enhanced health checks with dependency status — nice-to-have operational feature
- Cursor-based pagination — only needed for very large or frequently-updated datasets

### Architecture Approach

The existing hexagonal/clean architecture cleanly separates concerns across layers. Hardening integrations follow the principle that each layer validates what it owns and wraps errors at boundaries.

**Major components:**
1. **HTTP Adapter (Inbound)** — validates HTTP syntax, bounds, and enums; maps domain errors to HTTP status codes; returns only sanitized errors to clients
2. **Application Layer** — orchestrates use cases; validates business rules; transforms between DTOs and domain entities; wraps errors with context
3. **Domain Layer** — defines core entities and repository interfaces; exposes sentinel errors (ErrNotFound, ErrInvalidInput); enforces entity invariants
4. **Outbound Adapters** — implement repository interfaces; wrap technical SQL errors; map database errors to domain errors for layer isolation

**Key architectural pattern**: Validation is not monolithic but layered. HTTP adapter validates parameter syntax and bounds (maxDepth is valid int, 1 <= maxDepth <= 20). Application layer validates business rules (direction must be "upstream"|"downstream"|"both"). Domain layer protects invariants (column position cannot be negative). This prevents validation logic from leaking across boundaries.

**Error handling pattern**: Use domain sentinel errors (errors.New) and custom error types (NotFoundError) that support errors.Is(). Outbound adapters wrap SQL errors as domain errors. HTTP adapter maps domain errors to status codes (ErrNotFound → 404, ErrInvalidInput → 400, unknown → 500 with generic message). All internal errors logged with correlation IDs but never exposed to clients.

### Critical Pitfalls

1. **Client-Side Only Validation (VALID-01)** — Validation implemented in frontend but not server allows attackers to bypass via curl/Burp Suite, submitting malicious values like maxDepth=1000000. **Avoid by**: treating server-side validation as the ONLY validation (client-side is UX only), using allowlists for enums, applying strict bounds on integers at handler level, testing with direct HTTP tools.

2. **Verbose Error Messages Leaking Database Details (SEC-01)** — Raw error messages like `return jsonify({"error": str(e)})` expose SQL statements, table names, connection strings, and stack traces to attackers for reconnaissance. **Avoid by**: creating whitelist of safe error messages, mapping all database errors to generic "internal server error", logging full details server-side with correlation IDs, never including table names, column names, SQL fragments, or file paths in client responses.

3. **Default/Hardcoded Credentials in Code (SEC-02)** — Fallback credentials like `TD_PASSWORD="password"` remain in production code if environment variables misconfigured, exposing systems to unauthorized access or wrong database connections. **Avoid by**: removing ALL defaults for credentials, failing fast with clear error if required env vars missing, validating configuration at startup before accepting requests.

4. **Offset Pagination Performance Degradation (PAGE-01)** — Large offset values (offset=1000000) force database to scan and discard millions of rows, causing linear performance degradation. **Avoid by**: capping maximum page number or offset (max page 100), using cursor/keyset pagination for deep navigation needs, ensuring all paginated queries have indexed ORDER BY clauses.

5. **Breaking Backward Compatibility Silently (COMPAT-01)** — Adding validation that rejects previously-accepted input breaks existing clients without warning or migration path. **Avoid by**: reviewing existing client usage before restrictions, treating default value changes as breaking, considering API versioning (/v2/) for breaking changes, documenting ALL changes in changelog with migration guidance. **Note**: This project explicitly accepts breaking changes since frontend and backend are maintained together.

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order and risk mitigation priority:

### Phase 1: Error Handling Foundation
**Rationale:** Fixes critical security vulnerability (information leakage) immediately and establishes foundation for all subsequent validation and error reporting work. No dependencies on other phases. Lowest risk, highest security value.

**Delivers:**
- Domain error types (sentinel errors, custom NotFoundError)
- Error mapping in HTTP adapter (domain errors → HTTP status codes)
- Repository error wrapping (SQL errors → domain errors)
- Structured error responses with no database details exposed

**Addresses:**
- SEC-01 (generic error messages)
- Implements APIError interface pattern from STACK.md
- Establishes error infrastructure required by FEATURES.md validation features

**Avoids:**
- Pitfall SEC-01 (verbose error messages)
- Information disclosure through error messages

**Complexity:** MEDIUM (requires updating all error handling paths across layers)

### Phase 2: Input Validation
**Rationale:** Addresses resource exhaustion DoS vectors by enforcing bounds on all user inputs. Depends on Phase 1 error infrastructure to return proper 400 responses with clear messages. Enables safe query execution for subsequent phases.

**Delivers:**
- Parameter validation helpers (parseMaxDepth, parseDirection, parsePagination)
- Validation at HTTP handler boundaries
- Clear 400 error responses for invalid inputs
- Configuration structure for limits (maxMaxDepth, validDirections)

**Addresses:**
- VALID-01 (maxDepth bounded to 20)
- VALID-02 (direction whitelist validation)
- Implements go-playground/validator from STACK.md
- Table stakes validation features from FEATURES.md

**Avoids:**
- Pitfall VALID-01 (client-side only validation)
- Resource exhaustion attacks via unbounded parameters

**Complexity:** LOW (straightforward parameter parsing and bounds checking)

### Phase 3: Configuration Centralization
**Rationale:** Removes hardcoded credentials and establishes fail-fast validation. Can be developed in parallel with Phase 2 as there are no hard dependencies. Critical security fix.

**Delivers:**
- APIConfig structure with limits and defaults
- Configuration injection into handlers and services
- Fail-fast validation at startup
- Removal of all default credentials

**Addresses:**
- SEC-01 (remove default credentials from db_config.py)
- SEC-03 (document auth/rate limiting requirements)
- Configuration patterns from ARCHITECTURE.md
- Configuration security from FEATURES.md

**Avoids:**
- Pitfall SEC-02 (default credentials in code)
- Silent misconfigurations in production

**Complexity:** LOW (configuration structure and injection, no business logic changes)

### Phase 4: Pagination Implementation
**Rationale:** Addresses unbounded result sets that can cause memory exhaustion. Depends on Phase 1 (error handling) and Phase 2 (validation) for proper error responses and limit enforcement. Largest scope but builds on validation foundation.

**Delivers:**
- PaginationRequest and PaginationResponse DTOs
- Repository method signatures with limit/offset parameters
- Pagination metadata in all list responses (total, page, pageSize, hasMore)
- Consistent pagination across all endpoints

**Addresses:**
- SCALE-01 (pagination for asset listing with default 100)
- Result set limits from FEATURES.md
- Pagination patterns from ARCHITECTURE.md

**Avoids:**
- Pitfall PAGE-01 (offset pagination performance)
- Pitfall PAGE-02 (missing total count)
- Unbounded result sets causing memory issues

**Complexity:** MEDIUM (requires repository interface changes and query updates)

### Phase 5: DBQL Error Handling
**Rationale:** Improves batch process resilience for lineage extraction. Depends on Phase 1 error infrastructure. Lower priority since DBQL is not request-path but batch process. Can be deferred if needed.

**Delivers:**
- Try/catch wrappers around individual query processing
- Detailed error logging with context
- Graceful continuation after individual failures
- Summary reporting (X succeeded, Y failed)

**Addresses:**
- DBQL-01 (comprehensive DBQL extraction error handling)
- DBQL error patterns from FEATURES.md
- Batch process error handling from PITFALLS.md

**Avoids:**
- Pitfall DBQL-01 (DBQL access failures)
- Silent failures in extraction pipelines

**Complexity:** MEDIUM (requires extraction script refactoring)

### Phase 6: Security Documentation & Tooling
**Rationale:** Documents deployment assumptions and integrates static analysis. No code dependencies, can be done in parallel with implementation phases. Essential for safe deployment.

**Delivers:**
- Deployment security guide (TLS, auth, CORS, rate limiting)
- .golangci.yml configuration with gosec
- CI/CD integration for golangci-lint and govulncheck
- API security documentation

**Addresses:**
- SEC-03 (document auth/rate limiting requirements)
- Security tooling from STACK.md
- Security documentation from FEATURES.md

**Avoids:**
- Deployment misconfiguration
- Security regressions via static analysis

**Complexity:** LOW (documentation and CI configuration)

### Phase Ordering Rationale

- **Phase 1 first**: Error handling is foundation for all other work; provides immediate security benefit by preventing information leakage
- **Phase 2 after Phase 1**: Validation needs error infrastructure to return proper 400 responses; prevents resource exhaustion attacks
- **Phase 3 parallel with Phase 2**: Configuration has no dependencies on validation but both are security-critical; can be developed simultaneously
- **Phase 4 after Phases 1-2**: Pagination needs validation for limit bounds and error handling for edge cases; largest scope benefits from solid foundation
- **Phase 5 deferred**: DBQL is batch process not request-path; less critical than request-path hardening
- **Phase 6 parallel**: Documentation and tooling can happen alongside implementation

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1 (Error Handling)**: Well-documented Go error handling patterns, hexagonal architecture error mapping established
- **Phase 2 (Input Validation)**: go-playground/validator is mature with extensive documentation and examples
- **Phase 3 (Configuration)**: Standard configuration injection patterns in Go
- **Phase 6 (Documentation)**: Security documentation templates available from OWASP

Phases NOT needing deeper research:
- **Phase 4 (Pagination)**: Pagination patterns well-covered in ARCHITECTURE.md, standard SQL LIMIT/OFFSET
- **Phase 5 (DBQL)**: Error handling patterns from Phase 1 apply directly to batch processes

**Conclusion**: All phases use well-established patterns. No phases require `/gsd:research-phase` during planning.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries verified via GitHub releases and official documentation; versions confirmed current as of Jan 2026 |
| Features | HIGH | Based on OWASP guidelines, RFC standards (RFC 9457), and industry best practices; requirements clearly derived from 7 documented concerns |
| Architecture | HIGH | Hexagonal architecture patterns well-established; error handling and validation layer boundaries clearly defined |
| Pitfalls | HIGH | Based on OWASP security cheat sheets, authoritative sources (Google AIP-180), and existing codebase analysis |

**Overall confidence:** HIGH

### Gaps to Address

- **Rate limiting specifics**: Research documents that rate limiting should be deferred to infrastructure (API gateway, load balancer) but doesn't specify exact requirements. **During planning**: Document specific rate limit recommendations (e.g., 100 req/min per IP for unauthenticated, 1000 req/min for authenticated) for infrastructure team.

- **Pagination total count performance**: Research notes that COUNT queries are expensive but doesn't provide concrete optimization strategies for Teradata specifically. **During implementation**: Test COUNT performance on actual lineage tables; if slow, consider approximate counts via Teradata statistics or cached counts with TTL.

- **CORS origin configuration**: Research mentions CORS allowlist but doesn't specify which origins. **During planning**: Define explicit allowed origins based on deployment architecture (e.g., internal domain for production, localhost ports for development).

- **Backward compatibility impact**: Project explicitly accepts breaking changes but research flags this as a pitfall. **During implementation**: Document all breaking changes in changelog and verify frontend is updated to match API changes atomically.

## Sources

### Primary (HIGH confidence)
- [go-playground/validator GitHub](https://github.com/go-playground/validator) — Latest v10.30.1 (2025-12-24)
- [golangci-lint releases](https://github.com/golangci/golangci-lint/releases) — Latest v2.8.0 (2026-01-07)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)
- [RFC 9457 - Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Go Security Best Practices](https://go.dev/doc/security/best-practices) — Official Go security guidance
- [Google AIP-180: Backwards Compatibility](https://google.aip.dev/180)
- [react-error-boundary npm](https://www.npmjs.com/package/react-error-boundary)
- Existing project codebase analysis (`/Users/Daniel.Tehan/Code/lineage`)

### Secondary (MEDIUM confidence)
- [Better Stack logging comparison](https://betterstack.com/community/guides/logging/best-golang-logging-libraries/) — slog vs zap vs zerolog benchmarks
- [Sams96 - Applying Hexagonal Architecture to Go Backend](https://sams96.github.io/go-project-layout/) — Feb 2025
- [Where To Put Validation in Clean Architecture](https://medium.com/@michaelmaurice410/where-to-put-validation-in-clean-architecture-so-its-obvious-fast-and-never-leaks-161bfd62f1dc)
- [Domain-Driven Hexagon](https://github.com/Sairyss/domain-driven-hexagon) — Reference architecture
- [Datadog - Practical guide to error handling in Go](https://www.datadoghq.com/blog/go-error-handling/)
- [Baeldung - REST API Error Handling Best Practices](https://www.baeldung.com/rest-api-error-handling-best-practices)
- [Speakeasy - API Pagination Best Practices](https://www.speakeasy.com/api-design/pagination)
- [Moesif - REST API Pagination Best Practices](https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/)
- [Zuplo - API Versioning and Backward Compatibility](https://zuplo.com/blog/2025/04/11/api-versioning-backward-compatibility-best-practices)
- [Pynt - API Security Best Practices 2025](https://www.pynt.io/learning-hub/api-security-guide/api-security-best-practices)
- [APISecurity.io Top 5 API Vulnerabilities 2025](https://apisecurity.io/issue-286-the-apisecurity-io-top-5-api-vulnerabilities-in-2025/)
- [Cloudflare Rate Limiting Best Practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)

---
*Research completed: 2026-01-29*
*Ready for roadmap: yes*
