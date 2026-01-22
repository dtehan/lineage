# Data Lineage Application - Go Backend Test Plan

## Overview

This test plan provides comprehensive test coverage for the Go backend component of the Data Lineage Application. It covers unit tests, integration tests, API endpoint tests, error handling, caching behavior, performance testing, and system reliability tests.

---

## Table of Contents

1. [Unit Tests](#1-unit-tests)
2. [Integration Tests](#2-integration-tests)
3. [API Endpoint Tests](#3-api-endpoint-tests)
4. [Error Handling Tests](#4-error-handling-tests)
5. [Caching Tests](#5-caching-tests)
6. [Performance Tests](#6-performance-tests)
7. [Health Check and Graceful Shutdown Tests](#7-health-check-and-graceful-shutdown-tests)

---

## 1. Unit Tests

### 1.1 Domain Entities

#### TC-UNIT-001: Database Entity Creation
- **Description**: Verify Database entity can be created with all fields
- **Preconditions**: None
- **Test Steps**:
  1. Create a Database struct with ID, Name, OwnerName, CreateTimestamp, and CommentString
  2. Marshal to JSON
  3. Unmarshal back to struct
- **Expected Results**:
  - All fields are correctly set
  - JSON serialization/deserialization works correctly
  - JSON field names use camelCase as specified

#### TC-UNIT-002: Table Entity Creation
- **Description**: Verify Table entity can be created with all fields including TableKind
- **Preconditions**: None
- **Test Steps**:
  1. Create a Table struct with ID, DatabaseName, TableName, TableKind (T or V), CreateTimestamp, CommentString, RowCount
  2. Verify TableKind accepts "T" for Table and "V" for View
  3. Marshal to JSON and verify structure
- **Expected Results**:
  - All fields are correctly populated
  - TableKind correctly distinguishes tables from views

#### TC-UNIT-003: Column Entity Creation
- **Description**: Verify Column entity handles all column metadata
- **Preconditions**: None
- **Test Steps**:
  1. Create Column struct with ID, DatabaseName, TableName, ColumnName, ColumnType, ColumnLength, Nullable, CommentString, ColumnPosition
  2. Test with various ColumnTypes (VARCHAR, INTEGER, DECIMAL, etc.)
  3. Test Nullable boolean field with true and false values
- **Expected Results**:
  - All fields serialize correctly
  - Nullable field correctly represents NULL/NOT NULL constraint

#### TC-UNIT-004: ColumnLineage Entity Creation
- **Description**: Verify ColumnLineage entity captures source-target relationships
- **Preconditions**: None
- **Test Steps**:
  1. Create ColumnLineage with source and target column information
  2. Set TransformationType (e.g., "DIRECT", "TRANSFORM", "AGGREGATE")
  3. Set ConfidenceScore between 0.0 and 1.0
  4. Set Depth for hierarchical lineage
- **Expected Results**:
  - Source and target columns are correctly linked
  - ConfidenceScore maintains precision
  - Depth correctly represents hierarchy level

#### TC-UNIT-005: LineageGraph Entity Construction
- **Description**: Verify LineageGraph correctly contains nodes and edges
- **Preconditions**: None
- **Test Steps**:
  1. Create multiple LineageNode objects
  2. Create LineageEdge objects connecting nodes
  3. Construct LineageGraph with nodes and edges
  4. Verify graph structure
- **Expected Results**:
  - Nodes array contains all nodes
  - Edges array contains all edges with correct source/target references

#### TC-UNIT-006: LineageNode Type Validation
- **Description**: Verify LineageNode Type field accepts valid asset types
- **Preconditions**: None
- **Test Steps**:
  1. Create nodes with Type = "database"
  2. Create nodes with Type = "table"
  3. Create nodes with Type = "column"
- **Expected Results**:
  - All three types are accepted
  - Metadata map can contain arbitrary key-value pairs

#### TC-UNIT-007: AssetType Constants
- **Description**: Verify AssetType constants are correctly defined
- **Preconditions**: None
- **Test Steps**:
  1. Verify AssetTypeDatabase equals "database"
  2. Verify AssetTypeTable equals "table"
  3. Verify AssetTypeColumn equals "column"
- **Expected Results**:
  - All constants have correct string values

#### TC-UNIT-008: SearchResult Entity
- **Description**: Verify SearchResult captures search match information
- **Preconditions**: None
- **Test Steps**:
  1. Create SearchResult with ID, Type, DatabaseName, TableName, ColumnName
  2. Set MatchedOn to indicate which field matched
  3. Set Score for relevance ranking
- **Expected Results**:
  - All fields serialize correctly
  - Score allows for result ordering

---

### 1.2 Application Services

#### TC-UNIT-010: LineageService GetLineageGraph - Cache Miss
- **Description**: Verify LineageService fetches from repository on cache miss
- **Preconditions**:
  - Mock LineageRepository, AssetRepository, and CacheRepository
  - CacheRepository.Get returns error (cache miss)
- **Test Steps**:
  1. Create LineageService with mocked dependencies
  2. Call GetLineageGraph with valid request
  3. Verify cache was checked first
  4. Verify repository was called
  5. Verify result was cached
- **Expected Results**:
  - Cache.Get is called with correct key format "lineage:{assetId}:{direction}:{maxDepth}"
  - Repository.GetLineageGraph is called
  - Cache.Set is called with result and 300 second TTL

#### TC-UNIT-011: LineageService GetLineageGraph - Cache Hit
- **Description**: Verify LineageService returns cached data on cache hit
- **Preconditions**:
  - Mock CacheRepository to return valid cached data
- **Test Steps**:
  1. Configure cache mock to return LineageGraphResponse
  2. Call GetLineageGraph
  3. Verify repository was NOT called
- **Expected Results**:
  - Cached data is returned
  - Repository is not queried
  - Response matches cached data

#### TC-UNIT-012: LineageService GetUpstreamLineage
- **Description**: Verify upstream lineage retrieval
- **Preconditions**:
  - Mock LineageRepository with upstream lineage data
- **Test Steps**:
  1. Call GetUpstreamLineage with columnID and maxDepth
  2. Verify repository method is called with correct parameters
- **Expected Results**:
  - Returns list of ColumnLineage with sources

#### TC-UNIT-013: LineageService GetDownstreamLineage
- **Description**: Verify downstream lineage retrieval
- **Preconditions**:
  - Mock LineageRepository with downstream lineage data
- **Test Steps**:
  1. Call GetDownstreamLineage with columnID and maxDepth
  2. Verify repository method is called with correct parameters
- **Expected Results**:
  - Returns list of ColumnLineage with targets

#### TC-UNIT-014: LineageService GetImpactAnalysis
- **Description**: Verify impact analysis correctly categorizes impacts
- **Preconditions**:
  - Mock LineageRepository with multi-depth downstream data
- **Test Steps**:
  1. Call GetImpactAnalysis with columnID and maxDepth
  2. Verify downstream lineage is retrieved
  3. Verify impact categorization (direct vs indirect)
  4. Verify summary statistics
- **Expected Results**:
  - ImpactedAssets contains all downstream targets
  - Depth=1 assets marked as "direct"
  - Depth>1 assets marked as "indirect"
  - Summary.TotalImpacted equals count of impacted assets
  - Summary.ByDatabase correctly groups by database
  - Summary.ByDepth correctly groups by depth level

#### TC-UNIT-015: AssetService ListDatabases
- **Description**: Verify database listing through service layer
- **Preconditions**:
  - Mock AssetRepository with database list
- **Test Steps**:
  1. Call ListDatabases
  2. Verify repository is called
- **Expected Results**:
  - Returns list of Database entities

#### TC-UNIT-016: AssetService ListTables
- **Description**: Verify table listing for a database
- **Preconditions**:
  - Mock AssetRepository with table list
- **Test Steps**:
  1. Call ListTables with databaseName
  2. Verify repository is called with correct database name
- **Expected Results**:
  - Returns list of Table entities for specified database

#### TC-UNIT-017: AssetService ListColumns
- **Description**: Verify column listing for a table
- **Preconditions**:
  - Mock AssetRepository with column list
- **Test Steps**:
  1. Call ListColumns with databaseName and tableName
  2. Verify repository is called with correct parameters
- **Expected Results**:
  - Returns list of Column entities for specified table

#### TC-UNIT-018: SearchService Search
- **Description**: Verify search functionality
- **Preconditions**:
  - Mock SearchRepository with search results
- **Test Steps**:
  1. Call Search with query, assetTypes, and limit
  2. Verify repository is called with correct parameters
- **Expected Results**:
  - Returns SearchResponse with results, total count, and query echo

---

### 1.3 Repository Implementations

#### TC-UNIT-020: TeradataLineageRepository BuildGraph
- **Description**: Verify graph construction from lineage data
- **Preconditions**:
  - Upstream and downstream lineage data available
- **Test Steps**:
  1. Call buildGraph with rootID, upstream, and downstream data
  2. Verify all unique nodes are created
  3. Verify all edges are created
- **Expected Results**:
  - Root node is included
  - No duplicate nodes (nodeMap deduplication works)
  - All edges have valid source and target references

#### TC-UNIT-021: TeradataLineageRepository ScanLineageRows
- **Description**: Verify row scanning correctly maps database rows to entities
- **Preconditions**:
  - Mock sql.Rows with lineage data
- **Test Steps**:
  1. Call scanLineageRows with mock rows
  2. Verify all columns are correctly mapped
- **Expected Results**:
  - ColumnLineage structs are correctly populated
  - All 12 fields are mapped correctly

---

## 2. Integration Tests

### 2.1 Teradata Connection Tests

#### TC-INT-001: Teradata Connection Success
- **Description**: Verify successful connection to Teradata database
- **Preconditions**:
  - Teradata database is running and accessible
  - Valid credentials are configured
- **Test Steps**:
  1. Create Config with valid host, port, user, password, database
  2. Call NewConnection
  3. Verify connection pool settings
- **Expected Results**:
  - Connection is established
  - MaxOpenConns = 25
  - MaxIdleConns = 5
  - Ping succeeds

#### TC-INT-002: Teradata Connection Failure - Invalid Host
- **Description**: Verify error handling for invalid host
- **Preconditions**: None
- **Test Steps**:
  1. Create Config with invalid host
  2. Call NewConnection
- **Expected Results**:
  - Error is returned
  - Error message contains "failed to ping database"

#### TC-INT-003: Teradata Connection Failure - Invalid Credentials
- **Description**: Verify error handling for invalid credentials
- **Preconditions**:
  - Teradata database is running
- **Test Steps**:
  1. Create Config with invalid username/password
  2. Call NewConnection
- **Expected Results**:
  - Error is returned
  - Error indicates authentication failure

#### TC-INT-004: Teradata Connection Pool Exhaustion
- **Description**: Verify behavior when connection pool is exhausted
- **Preconditions**:
  - Valid Teradata connection established
- **Test Steps**:
  1. Open 25 concurrent connections (MaxOpenConns)
  2. Attempt 26th connection
  3. Verify behavior (blocks or times out)
- **Expected Results**:
  - 26th connection blocks until one becomes available or context times out

---

### 2.2 Redis Connection Tests

#### TC-INT-010: Redis Connection Success
- **Description**: Verify successful connection to Redis
- **Preconditions**:
  - Redis server is running and accessible
- **Test Steps**:
  1. Create Redis Config with valid addr, password, db
  2. Call NewCacheRepository
  3. Verify connection
- **Expected Results**:
  - Connection is established
  - No error returned

#### TC-INT-011: Redis Connection Failure - Server Unavailable
- **Description**: Verify graceful degradation when Redis unavailable
- **Preconditions**:
  - Redis server is NOT running
- **Test Steps**:
  1. Attempt Redis connection
  2. Verify fallback to NoOpCache
- **Expected Results**:
  - Warning is logged
  - NoOpCache is returned
  - Application continues to function without caching

#### TC-INT-012: Redis Set and Get
- **Description**: Verify basic cache operations
- **Preconditions**:
  - Valid Redis connection
- **Test Steps**:
  1. Set a key with value and TTL
  2. Get the key
  3. Verify value matches
- **Expected Results**:
  - Set succeeds
  - Get returns correct value
  - Value can be deserialized to struct

#### TC-INT-013: Redis Delete
- **Description**: Verify cache deletion
- **Preconditions**:
  - Valid Redis connection with existing key
- **Test Steps**:
  1. Set a key
  2. Delete the key
  3. Attempt to get the key
- **Expected Results**:
  - Delete succeeds
  - Get returns error (key not found)

#### TC-INT-014: Redis Exists
- **Description**: Verify key existence check
- **Preconditions**:
  - Valid Redis connection
- **Test Steps**:
  1. Check existence of non-existent key
  2. Set a key
  3. Check existence of existing key
- **Expected Results**:
  - First check returns false
  - Second check returns true

---

### 2.3 Database Query Tests

#### TC-INT-020: Query ListDatabases
- **Description**: Verify database listing from Teradata
- **Preconditions**:
  - Valid Teradata connection
  - lineage database exists with data
- **Test Steps**:
  1. Call ListDatabases
  2. Verify results
- **Expected Results**:
  - Returns non-empty list of databases
  - Each database has required fields populated

#### TC-INT-021: Query ListTables
- **Description**: Verify table listing from Teradata
- **Preconditions**:
  - Valid Teradata connection
  - At least one database with tables exists
- **Test Steps**:
  1. Call ListTables with valid databaseName
  2. Verify results
- **Expected Results**:
  - Returns list of tables for specified database
  - TableKind correctly identifies tables vs views

#### TC-INT-022: Query ListColumns
- **Description**: Verify column listing from Teradata
- **Preconditions**:
  - Valid Teradata connection
  - At least one table with columns exists
- **Test Steps**:
  1. Call ListColumns with valid databaseName and tableName
  2. Verify results
- **Expected Results**:
  - Returns list of columns with metadata
  - ColumnPosition reflects correct ordering

#### TC-INT-023: Query Upstream Lineage with Recursive CTE
- **Description**: Verify upstream lineage recursive query works correctly
- **Preconditions**:
  - Valid Teradata connection
  - Lineage data exists in LIN_COLUMN_LINEAGE table
- **Test Steps**:
  1. Call GetUpstreamLineage with columnID and maxDepth
  2. Verify recursive traversal
- **Expected Results**:
  - Returns lineage up to maxDepth levels
  - Cycle detection prevents infinite loops (path checking)
  - Results ordered by depth

#### TC-INT-024: Query Downstream Lineage with Recursive CTE
- **Description**: Verify downstream lineage recursive query works correctly
- **Preconditions**:
  - Valid Teradata connection
  - Lineage data exists in LIN_COLUMN_LINEAGE table
- **Test Steps**:
  1. Call GetDownstreamLineage with columnID and maxDepth
  2. Verify recursive traversal
- **Expected Results**:
  - Returns lineage up to maxDepth levels
  - Only active lineage (is_active = 'Y') included
  - Cycle detection works correctly

---

## 3. API Endpoint Tests

### 3.1 Asset Endpoints

#### TC-API-001: GET /api/v1/assets/databases - Success
- **Description**: Verify database listing endpoint
- **Preconditions**:
  - Server is running
  - Teradata connection is valid
- **Test Steps**:
  1. Send GET request to /api/v1/assets/databases
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Content-Type: application/json
  - Response body contains "databases" array and "total" count
  - Each database object has id, name fields

#### TC-API-002: GET /api/v1/assets/databases/{database}/tables - Success
- **Description**: Verify table listing endpoint
- **Preconditions**:
  - Server is running
  - Valid database name exists
- **Test Steps**:
  1. Send GET request to /api/v1/assets/databases/{database}/tables
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Response body contains "tables" array and "total" count
  - Each table object has id, databaseName, tableName, tableKind

#### TC-API-003: GET /api/v1/assets/databases/{database}/tables/{table}/columns - Success
- **Description**: Verify column listing endpoint
- **Preconditions**:
  - Server is running
  - Valid database and table names exist
- **Test Steps**:
  1. Send GET request to /api/v1/assets/databases/{database}/tables/{table}/columns
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Response body contains "columns" array and "total" count
  - Each column object has complete metadata

---

### 3.2 Lineage Endpoints

#### TC-API-010: GET /api/v1/lineage/{assetId} - Default Parameters
- **Description**: Verify lineage endpoint with default parameters
- **Preconditions**:
  - Server is running
  - Valid assetId exists
- **Test Steps**:
  1. Send GET request to /api/v1/lineage/{assetId}
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Default direction is "both"
  - Default maxDepth is 5
  - Response contains assetId and graph with nodes/edges

#### TC-API-011: GET /api/v1/lineage/{assetId}?direction=upstream
- **Description**: Verify lineage endpoint with upstream direction
- **Preconditions**:
  - Server is running
  - Valid assetId exists
- **Test Steps**:
  1. Send GET request with direction=upstream
  2. Verify response contains only upstream lineage
- **Expected Results**:
  - Graph contains only source nodes/edges

#### TC-API-012: GET /api/v1/lineage/{assetId}?direction=downstream
- **Description**: Verify lineage endpoint with downstream direction
- **Preconditions**:
  - Server is running
  - Valid assetId exists
- **Test Steps**:
  1. Send GET request with direction=downstream
  2. Verify response contains only downstream lineage
- **Expected Results**:
  - Graph contains only target nodes/edges

#### TC-API-013: GET /api/v1/lineage/{assetId}?maxDepth=3
- **Description**: Verify lineage endpoint respects maxDepth parameter
- **Preconditions**:
  - Server is running
  - Lineage data with depth > 3 exists
- **Test Steps**:
  1. Send GET request with maxDepth=3
  2. Verify no nodes beyond depth 3
- **Expected Results**:
  - All nodes are within 3 levels of the root

#### TC-API-014: GET /api/v1/lineage/{assetId}/upstream - Success
- **Description**: Verify upstream-only lineage endpoint
- **Preconditions**:
  - Server is running
  - Valid assetId with upstream lineage exists
- **Test Steps**:
  1. Send GET request to /api/v1/lineage/{assetId}/upstream
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Response contains assetId and lineage array
  - Default maxDepth is 10

#### TC-API-015: GET /api/v1/lineage/{assetId}/downstream - Success
- **Description**: Verify downstream-only lineage endpoint
- **Preconditions**:
  - Server is running
  - Valid assetId with downstream lineage exists
- **Test Steps**:
  1. Send GET request to /api/v1/lineage/{assetId}/downstream
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Response contains assetId and lineage array

#### TC-API-016: GET /api/v1/lineage/{assetId}/impact - Success
- **Description**: Verify impact analysis endpoint
- **Preconditions**:
  - Server is running
  - Valid assetId with downstream impact exists
- **Test Steps**:
  1. Send GET request to /api/v1/lineage/{assetId}/impact
  2. Verify response structure
- **Expected Results**:
  - Status code: 200 OK
  - Response contains assetId, impactedAssets array, and summary
  - Summary includes totalImpacted, byDatabase, byDepth

---

### 3.3 Search Endpoints

#### TC-API-020: GET /api/v1/search?q={query} - Success
- **Description**: Verify search endpoint with query
- **Preconditions**:
  - Server is running
  - Searchable assets exist
- **Test Steps**:
  1. Send GET request to /api/v1/search?q=test
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Response contains results array, total count, and query echo
  - Each result has id, type, databaseName, matchedOn, score

#### TC-API-021: GET /api/v1/search?q={query}&type=database
- **Description**: Verify search with asset type filter
- **Preconditions**:
  - Server is running
  - Assets of multiple types exist
- **Test Steps**:
  1. Send GET request with type=database
  2. Verify only database results returned
- **Expected Results**:
  - All results have type="database"

#### TC-API-022: GET /api/v1/search?q={query}&type=table&type=column
- **Description**: Verify search with multiple type filters
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send GET request with type=table&type=column
  2. Verify results
- **Expected Results**:
  - Results include only tables and columns
  - No database results

#### TC-API-023: GET /api/v1/search?q={query}&limit=10
- **Description**: Verify search respects limit parameter
- **Preconditions**:
  - Server is running
  - More than 10 matching assets exist
- **Test Steps**:
  1. Send GET request with limit=10
  2. Count results
- **Expected Results**:
  - Results array has at most 10 items
  - Default limit is 50 when not specified

---

## 4. Error Handling Tests

### 4.1 Input Validation Errors

#### TC-ERR-001: Search Without Query Parameter
- **Description**: Verify error when 'q' parameter is missing
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send GET request to /api/v1/search (no query params)
  2. Verify error response
- **Expected Results**:
  - Status code: 400 Bad Request
  - Response body: {"error": "query parameter 'q' is required"}

#### TC-ERR-002: Invalid maxDepth Parameter
- **Description**: Verify handling of invalid maxDepth value
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send GET request with maxDepth=invalid
  2. Verify behavior
- **Expected Results**:
  - Default maxDepth is used (5 for lineage graph, 10 for upstream/downstream)
  - No error returned

#### TC-ERR-003: Invalid limit Parameter
- **Description**: Verify handling of invalid limit value
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send GET request with limit=invalid
  2. Verify behavior
- **Expected Results**:
  - Default limit (50) is used
  - No error returned

---

### 4.2 Resource Not Found Errors

#### TC-ERR-010: Non-existent Database
- **Description**: Verify error for non-existent database
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send GET request to /api/v1/assets/databases/nonexistent/tables
  2. Verify response
- **Expected Results**:
  - Status code: 500 Internal Server Error (or 404 if implemented)
  - Error message indicates database not found

#### TC-ERR-011: Non-existent Table
- **Description**: Verify error for non-existent table
- **Preconditions**:
  - Server is running
  - Valid database exists
- **Test Steps**:
  1. Send GET request to /api/v1/assets/databases/{db}/tables/nonexistent/columns
  2. Verify response
- **Expected Results**:
  - Appropriate error status and message

#### TC-ERR-012: Non-existent Asset ID for Lineage
- **Description**: Verify error for non-existent assetId
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send GET request to /api/v1/lineage/nonexistent-id
  2. Verify response
- **Expected Results**:
  - Empty graph returned or appropriate error

---

### 4.3 Database Errors

#### TC-ERR-020: Teradata Connection Lost
- **Description**: Verify handling when Teradata connection is lost mid-request
- **Preconditions**:
  - Server is running
  - Teradata connection can be interrupted
- **Test Steps**:
  1. Start a request
  2. Interrupt Teradata connection
  3. Verify error handling
- **Expected Results**:
  - Status code: 500 Internal Server Error
  - Error message wrapped with context
  - Connection pool attempts reconnection

#### TC-ERR-021: Query Timeout
- **Description**: Verify handling of query timeout
- **Preconditions**:
  - Server is running
  - Request timeout is 60 seconds
- **Test Steps**:
  1. Execute query that takes longer than timeout
  2. Verify context cancellation propagates
- **Expected Results**:
  - Request times out gracefully
  - Error response returned

#### TC-ERR-022: SQL Injection Attempt
- **Description**: Verify protection against SQL injection
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send request with malicious input (e.g., database name with SQL injection)
  2. Verify query parameterization prevents injection
- **Expected Results**:
  - Input is treated as literal value
  - No SQL execution of injected code
  - Safe error or empty result

---

### 4.4 CORS and Headers

#### TC-ERR-030: CORS Preflight Request
- **Description**: Verify CORS preflight handling
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send OPTIONS request with Origin header
  2. Verify CORS headers in response
- **Expected Results**:
  - Access-Control-Allow-Origin includes allowed origins
  - Access-Control-Allow-Methods includes GET, POST, PUT, DELETE, OPTIONS
  - Access-Control-Allow-Headers includes Accept, Authorization, Content-Type
  - Access-Control-Max-Age is 300

#### TC-ERR-031: Request from Disallowed Origin
- **Description**: Verify CORS blocks disallowed origins
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send request with Origin: http://malicious.com
  2. Verify CORS headers
- **Expected Results**:
  - Access-Control-Allow-Origin does not include malicious origin
  - Browser would block the response

---

## 5. Caching Tests

### 5.1 Cache Hit/Miss Tests

#### TC-CACHE-001: Cache Miss - First Request
- **Description**: Verify first request populates cache
- **Preconditions**:
  - Redis is running
  - Cache is empty
- **Test Steps**:
  1. Send lineage request for assetId
  2. Verify database was queried
  3. Verify cache was populated
- **Expected Results**:
  - Response returned from database
  - Cache key created: "lineage:{assetId}:{direction}:{maxDepth}"
  - Subsequent request returns cached data

#### TC-CACHE-002: Cache Hit - Subsequent Request
- **Description**: Verify subsequent request uses cache
- **Preconditions**:
  - Redis is running
  - Previous request populated cache
- **Test Steps**:
  1. Send identical lineage request
  2. Verify cache was used
  3. Verify database was NOT queried
- **Expected Results**:
  - Response returned from cache
  - Response time significantly faster
  - Database query count unchanged

#### TC-CACHE-003: Cache Key Uniqueness
- **Description**: Verify different parameters create different cache keys
- **Preconditions**:
  - Redis is running
- **Test Steps**:
  1. Request lineage with maxDepth=5
  2. Request lineage with maxDepth=10
  3. Verify both are cached separately
- **Expected Results**:
  - Two distinct cache keys exist
  - Each returns correct data for its parameters

---

### 5.2 TTL Tests

#### TC-CACHE-010: Cache TTL Expiration
- **Description**: Verify cache entries expire after TTL
- **Preconditions**:
  - Redis is running
  - TTL is set to 300 seconds (5 minutes)
- **Test Steps**:
  1. Populate cache
  2. Wait for TTL to expire (or manually expire)
  3. Request same data
- **Expected Results**:
  - Cache miss occurs after TTL
  - Database is queried again
  - Cache is repopulated

#### TC-CACHE-011: Cache TTL Value Verification
- **Description**: Verify correct TTL is set on cache entries
- **Preconditions**:
  - Redis is running
- **Test Steps**:
  1. Populate cache via lineage request
  2. Check TTL on Redis key using REDIS CLI
- **Expected Results**:
  - TTL is approximately 300 seconds

---

### 5.3 NoOp Cache Tests

#### TC-CACHE-020: NoOp Cache When Redis Unavailable
- **Description**: Verify application works with NoOp cache
- **Preconditions**:
  - Redis is NOT running
  - Application started (uses NoOpCache fallback)
- **Test Steps**:
  1. Send lineage request
  2. Verify response
- **Expected Results**:
  - Warning logged about Redis unavailability
  - Request succeeds
  - Data returned from database
  - No caching occurs

#### TC-CACHE-021: NoOp Cache Get Returns Error
- **Description**: Verify NoOp cache Get always misses
- **Preconditions**:
  - NoOpCache is in use
- **Test Steps**:
  1. Call cache.Get
  2. Verify return value
- **Expected Results**:
  - Returns error indicating cache miss
  - dest parameter unchanged

#### TC-CACHE-022: NoOp Cache Set Does Nothing
- **Description**: Verify NoOp cache Set is no-op
- **Preconditions**:
  - NoOpCache is in use
- **Test Steps**:
  1. Call cache.Set
  2. Call cache.Get for same key
- **Expected Results**:
  - Set returns nil (no error)
  - Get still returns error (cache miss)

---

### 5.4 Cache Invalidation

#### TC-CACHE-030: Manual Cache Invalidation
- **Description**: Verify cache entries can be manually deleted
- **Preconditions**:
  - Redis is running
  - Cache entry exists
- **Test Steps**:
  1. Verify cache entry exists
  2. Call cache.Delete
  3. Verify cache entry removed
- **Expected Results**:
  - Delete succeeds
  - Subsequent Get returns error

---

## 6. Performance Tests

### 6.1 Response Time Tests

#### TC-PERF-001: Database List Response Time
- **Description**: Verify database listing response time is acceptable
- **Preconditions**:
  - Server is running
  - Cold cache
- **Test Steps**:
  1. Send GET /api/v1/assets/databases
  2. Measure response time
- **Expected Results**:
  - Response time < 500ms for cold cache
  - Response time < 50ms for warm cache

#### TC-PERF-002: Table List Response Time
- **Description**: Verify table listing response time for large databases
- **Preconditions**:
  - Server is running
  - Database with 1000+ tables exists
- **Test Steps**:
  1. Send GET /api/v1/assets/databases/{db}/tables
  2. Measure response time
- **Expected Results**:
  - Response time < 1 second

#### TC-PERF-003: Column List Response Time
- **Description**: Verify column listing response time for wide tables
- **Preconditions**:
  - Server is running
  - Table with 500+ columns exists
- **Test Steps**:
  1. Send GET /api/v1/assets/databases/{db}/tables/{table}/columns
  2. Measure response time
- **Expected Results**:
  - Response time < 500ms

#### TC-PERF-004: Lineage Graph Response Time - Shallow Depth
- **Description**: Verify lineage response time for shallow graphs
- **Preconditions**:
  - Server is running
  - maxDepth=3
- **Test Steps**:
  1. Send GET /api/v1/lineage/{assetId}?maxDepth=3
  2. Measure response time
- **Expected Results**:
  - Response time < 500ms for cold cache

#### TC-PERF-005: Lineage Graph Response Time - Deep Depth
- **Description**: Verify lineage response time for deep graphs
- **Preconditions**:
  - Server is running
  - maxDepth=10
  - Complex lineage with many levels
- **Test Steps**:
  1. Send GET /api/v1/lineage/{assetId}?maxDepth=10
  2. Measure response time
- **Expected Results**:
  - Response time < 5 seconds
  - Recursive CTE completes within timeout

#### TC-PERF-006: Search Response Time
- **Description**: Verify search response time
- **Preconditions**:
  - Server is running
  - Large asset catalog
- **Test Steps**:
  1. Send GET /api/v1/search?q=common_term
  2. Measure response time
- **Expected Results**:
  - Response time < 1 second

---

### 6.2 Concurrent Request Tests

#### TC-PERF-010: Concurrent Database Listing - 10 Users
- **Description**: Verify server handles 10 concurrent requests
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send 10 concurrent GET requests to /api/v1/assets/databases
  2. Verify all complete successfully
  3. Measure average response time
- **Expected Results**:
  - All requests succeed (200 OK)
  - Average response time < 1 second
  - No connection pool exhaustion

#### TC-PERF-011: Concurrent Database Listing - 50 Users
- **Description**: Verify server handles 50 concurrent requests
- **Preconditions**:
  - Server is running
  - Connection pool MaxOpenConns=25
- **Test Steps**:
  1. Send 50 concurrent GET requests
  2. Verify behavior
- **Expected Results**:
  - All requests eventually complete
  - Some requests may queue waiting for connections
  - No errors due to resource exhaustion

#### TC-PERF-012: Concurrent Mixed Endpoints
- **Description**: Verify server handles mixed concurrent requests
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send concurrent requests to:
     - /api/v1/assets/databases (10 requests)
     - /api/v1/lineage/{assetId} (10 requests)
     - /api/v1/search?q=test (10 requests)
  2. Verify all complete
- **Expected Results**:
  - All 30 requests succeed
  - Response times remain acceptable

#### TC-PERF-013: Concurrent Requests with Cache
- **Description**: Verify cache improves concurrent request performance
- **Preconditions**:
  - Server is running
  - Redis is running
  - Cache is warm
- **Test Steps**:
  1. Warm cache with lineage request
  2. Send 100 concurrent requests for same lineage
  3. Measure response times
- **Expected Results**:
  - All requests return cached data
  - Average response time < 50ms
  - Database receives minimal load

---

### 6.3 Load Tests

#### TC-PERF-020: Sustained Load - 5 Minutes
- **Description**: Verify server handles sustained load
- **Preconditions**:
  - Server is running
  - Load testing tool available (e.g., k6, wrk)
- **Test Steps**:
  1. Generate 100 requests per second for 5 minutes
  2. Monitor response times, error rates, resource usage
- **Expected Results**:
  - Error rate < 1%
  - 95th percentile response time < 2 seconds
  - Memory usage remains stable
  - No goroutine leaks

#### TC-PERF-021: Spike Load
- **Description**: Verify server handles load spikes
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Start with 10 RPS
  2. Spike to 500 RPS for 30 seconds
  3. Return to 10 RPS
  4. Monitor behavior
- **Expected Results**:
  - Server remains responsive
  - Some requests may timeout during spike
  - Server recovers after spike

---

## 7. Health Check and Graceful Shutdown Tests

### 7.1 Health Check Tests

#### TC-HEALTH-001: Health Endpoint Returns Healthy
- **Description**: Verify health endpoint returns correct status
- **Preconditions**:
  - Server is running
  - All dependencies are connected
- **Test Steps**:
  1. Send GET /health
  2. Verify response
- **Expected Results**:
  - Status code: 200 OK
  - Response body: {"status": "healthy"}
  - Content-Type: application/json

#### TC-HEALTH-002: Health Check Response Time
- **Description**: Verify health check is fast
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send GET /health
  2. Measure response time
- **Expected Results**:
  - Response time < 10ms
  - No database queries executed

#### TC-HEALTH-003: Health Check Under Load
- **Description**: Verify health check remains responsive under load
- **Preconditions**:
  - Server is running
  - Server is under high load
- **Test Steps**:
  1. Generate high load on API endpoints
  2. Send GET /health
  3. Verify response
- **Expected Results**:
  - Health check still responds quickly
  - Status remains "healthy"

---

### 7.2 Graceful Shutdown Tests

#### TC-SHUTDOWN-001: SIGINT Triggers Graceful Shutdown
- **Description**: Verify SIGINT signal triggers graceful shutdown
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send SIGINT to server process
  2. Observe shutdown behavior
- **Expected Results**:
  - "Shutting down server..." is logged
  - Server stops accepting new connections
  - Server waits for in-flight requests
  - "Server exited" is logged

#### TC-SHUTDOWN-002: SIGTERM Triggers Graceful Shutdown
- **Description**: Verify SIGTERM signal triggers graceful shutdown
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send SIGTERM to server process
  2. Observe shutdown behavior
- **Expected Results**:
  - Same behavior as SIGINT
  - Clean shutdown

#### TC-SHUTDOWN-003: In-Flight Requests Complete During Shutdown
- **Description**: Verify active requests complete during shutdown
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Start a long-running request (e.g., deep lineage query)
  2. Send SIGINT during request
  3. Observe request completion
- **Expected Results**:
  - Request completes successfully
  - Shutdown waits for request (up to 30 second timeout)
  - Clean shutdown after request completes

#### TC-SHUTDOWN-004: Shutdown Timeout Enforced
- **Description**: Verify shutdown timeout is enforced
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Start a request that would take > 30 seconds
  2. Send SIGINT
  3. Wait for shutdown timeout
- **Expected Results**:
  - Server waits up to 30 seconds
  - After timeout, server force closes
  - "Server forced to shutdown" may be logged

#### TC-SHUTDOWN-005: New Requests Rejected During Shutdown
- **Description**: Verify new requests are rejected during shutdown
- **Preconditions**:
  - Server is running
- **Test Steps**:
  1. Send SIGINT to start shutdown
  2. Immediately send new request
- **Expected Results**:
  - New request receives connection refused or appropriate error
  - Server does not hang

#### TC-SHUTDOWN-006: Database Connections Closed on Shutdown
- **Description**: Verify database connections are properly closed
- **Preconditions**:
  - Server is running
  - Database connections active
- **Test Steps**:
  1. Verify active database connections
  2. Send SIGINT
  3. After shutdown, check database connection count
- **Expected Results**:
  - All connections returned to pool
  - db.Close() called via defer
  - No orphaned connections on database server

#### TC-SHUTDOWN-007: Redis Connections Closed on Shutdown
- **Description**: Verify Redis connections are properly closed
- **Preconditions**:
  - Server is running
  - Redis connected
- **Test Steps**:
  1. Send SIGINT
  2. Check Redis connections
- **Expected Results**:
  - Redis client properly closed
  - No connection leaks

---

## Test Execution Notes

### Test Environment Requirements
- Go 1.21 or higher
- Teradata database with lineage schema populated
- Redis server (optional for NoOp cache tests)
- Load testing tool (k6, wrk, or Apache Bench) for performance tests

### Test Data Requirements
- At least 5 databases in Teradata
- At least 10 tables per database
- At least 20 columns per table
- Lineage data with depth of at least 5 levels
- Circular lineage data for cycle detection tests

### Mock Implementations Required
- MockAssetRepository
- MockLineageRepository
- MockSearchRepository
- MockCacheRepository
- Mock sql.DB and sql.Rows for unit tests

### Recommended Test Frameworks
- `testing` - Go standard library
- `testify` - Assertions and mocking
- `httptest` - HTTP handler testing
- `sqlmock` - SQL mocking
- `miniredis` - In-memory Redis for testing

---

## Test Coverage Goals

| Category | Target Coverage |
|----------|-----------------|
| Domain Entities | 100% |
| Application Services | 90% |
| HTTP Handlers | 90% |
| Repository Implementations | 80% |
| Integration Tests | All critical paths |
| API Endpoints | 100% |
| Error Handling | All error conditions |

---

## Revision History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | 2024-01-19 | Initial test plan |
