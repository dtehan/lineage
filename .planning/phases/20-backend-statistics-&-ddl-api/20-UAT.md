---
status: diagnosed
phase: 20-backend-statistics-and-ddl-api
source: 20-01-SUMMARY.md, 20-02-SUMMARY.md
started: 2026-02-07T00:00:00Z
updated: 2026-02-07T00:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Statistics endpoint returns table metadata
expected: GET /api/v2/openlineage/datasets/{datasetId}/statistics returns JSON with rowCount, sizeBytes, owner, createdAt, modifiedAt, and sourceType fields for a table dataset
result: issue
reported: "I clicked on a table details, statistics option and get a Failed to load statistics error, refer to picture. The same is happening when I ask for statistics at the column level"
severity: blocker

### 2. Statistics endpoint returns view metadata
expected: GET /api/v2/openlineage/datasets/{datasetId}/statistics returns JSON with view metadata, where sizeBytes is null (views have no physical storage) and sourceType is VIEW
result: issue
reported: "Fail - not seeing stats in the GUI, have to assume that the endpoint is part of the problem"
severity: blocker

### 3. DDL endpoint returns view SQL
expected: GET /api/v2/openlineage/datasets/{datasetId}/ddl returns JSON with viewSql field containing the view's SQL definition for a view dataset
result: issue
reported: "fail - GUI fails to display any DDL at the table level, see image"
severity: blocker

### 4. DDL endpoint returns table and column comments
expected: GET /api/v2/openlineage/datasets/{datasetId}/ddl returns JSON with tableComment and columnComments fields for a table dataset, where viewSql is null
result: issue
reported: "fail - we are not seeing any comments at the table or column level in the GUI"
severity: blocker

### 5. Statistics endpoint returns 404 for missing dataset
expected: GET /api/v2/openlineage/datasets/nonexistent-id/statistics returns 404 status code (not 500)
result: issue
reported: "Not sure if this is working, mark as a fail for the moment"
severity: major

### 6. DDL endpoint returns 404 for missing dataset
expected: GET /api/v2/openlineage/datasets/nonexistent-id/ddl returns 404 status code (not 500)
result: issue
reported: "not sure if this is working, mark as a fail for the moment"
severity: major

### 7. Statistics endpoint degrades gracefully on DBC permission errors
expected: When DBC.TableStatsV or DBC.TableSizeV queries fail due to permissions, the endpoint returns 200 with null values for those specific fields (rowCount or sizeBytes) rather than returning a 500 error
result: issue
reported: "unsure if this is working as currently nothing on the statis is working"
severity: major

### 8. DDL endpoint handles RequestTxtOverFlow fallback
expected: DDL endpoint attempts to query RequestTxtOverFlow column first, and if that fails (older Teradata versions), falls back to estimating truncation from RequestText length
result: issue
reported: "unclear if this is working"
severity: major

### 9. Both endpoints enforce security on errors
expected: On 500 errors, both endpoints return generic "Internal server error" message (not database error details like "table not found" or SQL syntax errors)
result: issue
reported: "not seeing it"
severity: major

## Summary

total: 9
passed: 0
issues: 9
pending: 0
skipped: 0

## Gaps

- truth: "GET /api/v2/openlineage/datasets/{datasetId}/statistics returns JSON with rowCount, sizeBytes, owner, createdAt, modifiedAt, and sourceType fields for a table dataset"
  status: failed
  reason: "User reported: I clicked on a table details, statistics option and get a Failed to load statistics error, refer to picture. The same is happening when I ask for statistics at the column level"
  severity: blocker
  test: 1
  root_cause: "Dataset ID format mismatch: OL_DATASET.dataset_id stores '{namespace_hash}/database.table' but frontend sends 'database.table', causing backend query to return no rows and trigger 404"
  artifacts:
    - path: "lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx"
      issue: "effectiveDatasetId computation strips namespace, produces wrong format"
    - path: "lineage-api/python_server.py"
      issue: "Statistics endpoint queries by dataset_id only, no fallback to name"
    - path: "lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go"
      issue: "Go statistics handler same issue"
  missing:
    - "Backend endpoints should accept either dataset_id OR name as lookup key"
  debug_session: ".planning/debug/statistics-endpoint-404.md"

- truth: "GET /api/v2/openlineage/datasets/{datasetId}/statistics returns JSON with view metadata, where sizeBytes is null (views have no physical storage) and sourceType is VIEW"
  status: failed
  reason: "User reported: Fail - not seeing stats in the GUI, have to assume that the endpoint is part of the problem"
  severity: blocker
  test: 2
  root_cause: "Same root cause as test 1 - dataset ID format mismatch causing 404 errors"
  artifacts:
    - path: "lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx"
      issue: "effectiveDatasetId computation"
    - path: "lineage-api/python_server.py"
      issue: "Statistics endpoint queries by dataset_id only"
  missing:
    - "Backend endpoints should accept either dataset_id OR name"
  debug_session: ".planning/debug/statistics-endpoint-404.md"

- truth: "GET /api/v2/openlineage/datasets/{datasetId}/ddl returns JSON with viewSql field containing the view's SQL definition for a view dataset"
  status: failed
  reason: "User reported: fail - GUI fails to display any DDL at the table level, see image"
  severity: blocker
  test: 3
  root_cause: "Same dataset ID format mismatch as statistics endpoint - DDL handler queries by dataset_id only but receives dataset name from frontend"
  artifacts:
    - path: "lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx"
      issue: "effectiveDatasetId computation"
    - path: "lineage-api/python_server.py"
      issue: "DDL endpoint queries by dataset_id only"
    - path: "lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go"
      issue: "Go DDL handler same issue"
  missing:
    - "Backend endpoints should accept either dataset_id OR name"
  debug_session: ".planning/debug/ddl-endpoint-404.md"

- truth: "GET /api/v2/openlineage/datasets/{datasetId}/ddl returns JSON with tableComment and columnComments fields for a table dataset, where viewSql is null"
  status: failed
  reason: "User reported: fail - we are not seeing any comments at the table or column level in the GUI"
  severity: blocker
  test: 4
  root_cause: "Same root cause as test 3 - DDL endpoint 404 errors prevent loading comments"
  artifacts:
    - path: "lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx"
      issue: "effectiveDatasetId computation"
    - path: "lineage-api/python_server.py"
      issue: "DDL endpoint queries by dataset_id only"
  missing:
    - "Backend endpoints should accept either dataset_id OR name"
  debug_session: ".planning/debug/ddl-endpoint-404.md"

- truth: "GET /api/v2/openlineage/datasets/nonexistent-id/statistics returns 404 status code (not 500)"
  status: failed
  reason: "User reported: Not sure if this is working, mark as a fail for the moment"
  severity: major
  test: 5
  root_cause: "Cannot test error handling until endpoints work for valid datasets (blocked by tests 1-4)"
  artifacts: []
  missing:
    - "Need endpoints working before verifying error handling"
  debug_session: ""

- truth: "GET /api/v2/openlineage/datasets/nonexistent-id/ddl returns 404 status code (not 500)"
  status: failed
  reason: "User reported: not sure if this is working, mark as a fail for the moment"
  severity: major
  test: 6
  root_cause: "Cannot test error handling until endpoints work for valid datasets (blocked by tests 1-4)"
  artifacts: []
  missing:
    - "Need endpoints working before verifying error handling"
  debug_session: ""

- truth: "When DBC.TableStatsV or DBC.TableSizeV queries fail due to permissions, the endpoint returns 200 with null values for those specific fields (rowCount or sizeBytes) rather than returning a 500 error"
  status: failed
  reason: "User reported: unsure if this is working as currently nothing on the statis is working"
  severity: major
  test: 7
  root_cause: "Cannot test graceful degradation until endpoints work for valid datasets (blocked by tests 1-4)"
  artifacts: []
  missing:
    - "Need endpoints working before verifying graceful degradation"
  debug_session: ""

- truth: "DDL endpoint attempts to query RequestTxtOverFlow column first, and if that fails (older Teradata versions), falls back to estimating truncation from RequestText length"
  status: failed
  reason: "User reported: unclear if this is working"
  severity: major
  test: 8
  root_cause: "Cannot test fallback behavior until endpoints work for valid datasets (blocked by tests 1-4)"
  artifacts: []
  missing:
    - "Need endpoints working before verifying fallback"
  debug_session: ""

- truth: "On 500 errors, both endpoints return generic 'Internal server error' message (not database error details like 'table not found' or SQL syntax errors)"
  status: failed
  reason: "User reported: not seeing it"
  severity: major
  test: 9
  root_cause: "Cannot test security error handling until endpoints work for valid datasets (blocked by tests 1-4)"
  artifacts: []
  missing:
    - "Need endpoints working before verifying security error messages"
  debug_session: ""
