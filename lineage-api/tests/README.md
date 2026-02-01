# API Test Suite

Backend API integration tests that validate REST endpoints against the test plan specifications.

## Test Files

### run_api_tests.py
Main API test runner (20 tests total).

**Usage:**
```bash
# Start the server first
cd lineage-api && python python_server.py

# In another terminal, run the tests
python tests/run_api_tests.py
```

**Test categories:**
- Namespace endpoints (list, get)
- Dataset endpoints (list, get, search)
- Lineage endpoints (upstream, downstream, bidirectional)
- Error handling (404s, invalid parameters)
- Response format validation
- OpenLineage spec compliance

**Requirements:**
- Backend server must be running on http://localhost:8080
- Database must be populated with test data

## Running Tests

**Full test suite:**
```bash
# Terminal 1: Start server
cd lineage-api && python python_server.py

# Terminal 2: Run tests
cd lineage-api && python tests/run_api_tests.py
```

**Expected output:**
```
Backend API Test Runner
Server: http://localhost:8080
✓ API-01: Health check responds with 200
✓ API-02: List namespaces returns array
...
PASSED: 20/20
```

All tests should pass when the database is properly configured and populated.
