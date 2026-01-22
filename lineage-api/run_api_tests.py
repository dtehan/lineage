#!/usr/bin/env python3
"""
Backend API Test Runner
Validates key API endpoints against the test plan specifications.
"""

import requests
import json
import sys
from datetime import datetime

BASE_URL = "http://localhost:8080"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []

    def add_result(self, name, passed, details=""):
        self.tests.append({"name": name, "passed": passed, "details": details})
        if passed:
            self.passed += 1
        else:
            self.failed += 1

def test_health_endpoint(results):
    """TC-API-001: Health Check Endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        passed = response.status_code == 200 and response.json().get("status") == "ok"
        results.add_result("TC-API-001: Health Check Endpoint", passed,
                          f"Status: {response.status_code}, Body: {response.text[:100]}")
    except Exception as e:
        results.add_result("TC-API-001: Health Check Endpoint", False, str(e))

def test_list_databases(results):
    """TC-API-002: List Databases Endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/assets/databases")
        data = response.json()
        passed = (response.status_code == 200 and
                 "databases" in data and
                 len(data["databases"]) > 0)
        results.add_result("TC-API-002: List Databases Endpoint", passed,
                          f"Found {len(data.get('databases', []))} databases")
    except Exception as e:
        results.add_result("TC-API-002: List Databases Endpoint", False, str(e))

def test_list_tables(results):
    """TC-API-003: List Tables Endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/assets/databases/demo_user/tables")
        data = response.json()
        passed = (response.status_code == 200 and
                 "tables" in data and
                 len(data["tables"]) > 0)
        results.add_result("TC-API-003: List Tables Endpoint", passed,
                          f"Found {len(data.get('tables', []))} tables")
    except Exception as e:
        results.add_result("TC-API-003: List Tables Endpoint", False, str(e))

def test_list_columns(results):
    """TC-API-004: List Columns Endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/assets/databases/demo_user/tables/FACT_SALES/columns")
        data = response.json()
        passed = (response.status_code == 200 and
                 "columns" in data and
                 len(data["columns"]) > 0)
        results.add_result("TC-API-004: List Columns Endpoint", passed,
                          f"Found {len(data.get('columns', []))} columns")
    except Exception as e:
        results.add_result("TC-API-004: List Columns Endpoint", False, str(e))

def test_lineage_both_direction(results):
    """TC-API-005: Lineage Endpoint - Both Direction"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.FACT_SALES.net_amount",
            params={"direction": "both", "maxDepth": "5"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "nodes" in data and
                 "edges" in data and
                 len(data["nodes"]) > 0 and
                 len(data["edges"]) > 0)
        results.add_result("TC-API-005: Lineage Endpoint - Both Direction", passed,
                          f"Nodes: {len(data.get('nodes', []))}, Edges: {len(data.get('edges', []))}")
    except Exception as e:
        results.add_result("TC-API-005: Lineage Endpoint - Both Direction", False, str(e))

def test_lineage_upstream(results):
    """TC-API-006: Lineage Endpoint - Upstream"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.FACT_SALES.net_amount/upstream",
            params={"maxDepth": "5"}
        )
        data = response.json()
        # Upstream endpoint returns "lineage" array format
        passed = (response.status_code == 200 and
                 "lineage" in data and
                 len(data["lineage"]) > 0)
        results.add_result("TC-API-006: Lineage Endpoint - Upstream", passed,
                          f"Lineage entries: {len(data.get('lineage', []))}")
    except Exception as e:
        results.add_result("TC-API-006: Lineage Endpoint - Upstream", False, str(e))

def test_lineage_downstream(results):
    """TC-API-007: Lineage Endpoint - Downstream"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.SRC_SALES.sale_amount/downstream",
            params={"maxDepth": "5"}
        )
        data = response.json()
        # Downstream endpoint returns "lineage" array format
        passed = (response.status_code == 200 and
                 "lineage" in data and
                 len(data["lineage"]) > 0)
        results.add_result("TC-API-007: Lineage Endpoint - Downstream", passed,
                          f"Lineage entries: {len(data.get('lineage', []))}")
    except Exception as e:
        results.add_result("TC-API-007: Lineage Endpoint - Downstream", False, str(e))

def test_impact_analysis(results):
    """TC-API-008: Impact Analysis Endpoint"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.SRC_SALES.sale_amount/impact",
            params={"maxDepth": "10"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "sourceAsset" in data)
        results.add_result("TC-API-008: Impact Analysis Endpoint", passed,
                          f"Total impacted: {data.get('totalImpactedAssets', 0)}")
    except Exception as e:
        results.add_result("TC-API-008: Impact Analysis Endpoint", False, str(e))

def test_search_assets(results):
    """TC-API-009: Search Assets Endpoint"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/search",
            params={"q": "customer", "limit": "10"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "results" in data)
        results.add_result("TC-API-009: Search Assets Endpoint", passed,
                          f"Found {len(data.get('results', []))} results")
    except Exception as e:
        results.add_result("TC-API-009: Search Assets Endpoint", False, str(e))

def test_search_with_type_filter(results):
    """TC-API-010: Search with Type Filter"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/search",
            params={"q": "customer", "type": "column", "limit": "10"}
        )
        data = response.json()
        passed = response.status_code == 200
        # Verify all results are columns if any
        if data.get("results"):
            all_columns = all(r.get("type") == "column" for r in data["results"])
            passed = passed and all_columns
        results.add_result("TC-API-010: Search with Type Filter", passed,
                          f"Found {len(data.get('results', []))} column results")
    except Exception as e:
        results.add_result("TC-API-010: Search with Type Filter", False, str(e))

def test_nonexistent_asset_lineage(results):
    """TC-API-011: Non-existent Asset Lineage"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/nonexistent.table.column"
        )
        data = response.json()
        # Should return empty nodes/edges, not error
        passed = (response.status_code == 200 and
                 "nodes" in data and
                 "edges" in data)
        results.add_result("TC-API-011: Non-existent Asset Lineage", passed,
                          f"Status: {response.status_code}")
    except Exception as e:
        results.add_result("TC-API-011: Non-existent Asset Lineage", False, str(e))

def test_lineage_max_depth_limit(results):
    """TC-API-012: Lineage Max Depth Limit"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.FACT_SALES.net_amount",
            params={"direction": "both", "maxDepth": "1"}
        )
        data = response.json()
        passed = response.status_code == 200
        results.add_result("TC-API-012: Lineage Max Depth Limit", passed,
                          f"Depth 1: {len(data.get('nodes', []))} nodes")
    except Exception as e:
        results.add_result("TC-API-012: Lineage Max Depth Limit", False, str(e))

def test_database_structure_validation(results):
    """TC-API-013: Database Structure Validation"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/assets/databases")
        data = response.json()
        db = data["databases"][0]
        passed = ("id" in db and "name" in db and "tableCount" in db)
        results.add_result("TC-API-013: Database Structure Validation", passed,
                          f"DB has required fields: {list(db.keys())}")
    except Exception as e:
        results.add_result("TC-API-013: Database Structure Validation", False, str(e))

def test_table_structure_validation(results):
    """TC-API-014: Table Structure Validation"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/assets/databases/demo_user/tables")
        data = response.json()
        table = data["tables"][0]
        passed = ("id" in table and "name" in table and "database" in table and "columnCount" in table)
        results.add_result("TC-API-014: Table Structure Validation", passed,
                          f"Table has required fields: {list(table.keys())}")
    except Exception as e:
        results.add_result("TC-API-014: Table Structure Validation", False, str(e))

def test_column_structure_validation(results):
    """TC-API-015: Column Structure Validation"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/assets/databases/demo_user/tables/FACT_SALES/columns")
        data = response.json()
        col = data["columns"][0]
        passed = ("id" in col and "name" in col and "dataType" in col)
        results.add_result("TC-API-015: Column Structure Validation", passed,
                          f"Column has required fields: {list(col.keys())}")
    except Exception as e:
        results.add_result("TC-API-015: Column Structure Validation", False, str(e))

def test_lineage_node_structure(results):
    """TC-API-016: Lineage Node Structure"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.FACT_SALES.net_amount",
            params={"direction": "both", "maxDepth": "2"}
        )
        data = response.json()
        node = data["nodes"][0]
        passed = ("id" in node and "database" in node and "table" in node and "column" in node)
        results.add_result("TC-API-016: Lineage Node Structure", passed,
                          f"Node has required fields: {list(node.keys())}")
    except Exception as e:
        results.add_result("TC-API-016: Lineage Node Structure", False, str(e))

def test_lineage_edge_structure(results):
    """TC-API-017: Lineage Edge Structure"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.FACT_SALES.net_amount",
            params={"direction": "both", "maxDepth": "2"}
        )
        data = response.json()
        edge = data["edges"][0]
        passed = ("source" in edge and "target" in edge and "transformationType" in edge)
        results.add_result("TC-API-017: Lineage Edge Structure", passed,
                          f"Edge has required fields: {list(edge.keys())}")
    except Exception as e:
        results.add_result("TC-API-017: Lineage Edge Structure", False, str(e))

def test_transformation_types(results):
    """TC-API-018: Transformation Types in Lineage"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v1/lineage/demo_user.FACT_SALES.net_amount",
            params={"direction": "both", "maxDepth": "5"}
        )
        data = response.json()
        transform_types = set(e["transformationType"] for e in data["edges"])
        valid_types = {"DIRECT", "CALCULATION", "AGGREGATION", "JOIN", "FILTER"}
        passed = len(transform_types) > 0 and transform_types.issubset(valid_types)
        results.add_result("TC-API-018: Transformation Types in Lineage", passed,
                          f"Found types: {transform_types}")
    except Exception as e:
        results.add_result("TC-API-018: Transformation Types in Lineage", False, str(e))

def test_cors_headers(results):
    """TC-API-019: CORS Headers"""
    try:
        response = requests.options(f"{BASE_URL}/api/v1/assets/databases",
                                   headers={"Origin": "http://localhost:5173"})
        passed = response.status_code in [200, 204]
        results.add_result("TC-API-019: CORS Headers", passed,
                          f"Status: {response.status_code}")
    except Exception as e:
        results.add_result("TC-API-019: CORS Headers", False, str(e))

def test_content_type_json(results):
    """TC-API-020: Content-Type JSON Response"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/assets/databases")
        content_type = response.headers.get("Content-Type", "")
        passed = "application/json" in content_type
        results.add_result("TC-API-020: Content-Type JSON Response", passed,
                          f"Content-Type: {content_type}")
    except Exception as e:
        results.add_result("TC-API-020: Content-Type JSON Response", False, str(e))


def main():
    print("=" * 60)
    print("BACKEND API TEST RUNNER")
    print("=" * 60)
    print(f"\nTarget: {BASE_URL}")
    print(f"Time: {datetime.now().isoformat()}")
    print()

    results = TestResults()

    # Run all tests
    print("Running tests...\n")

    test_health_endpoint(results)
    test_list_databases(results)
    test_list_tables(results)
    test_list_columns(results)
    test_lineage_both_direction(results)
    test_lineage_upstream(results)
    test_lineage_downstream(results)
    test_impact_analysis(results)
    test_search_assets(results)
    test_search_with_type_filter(results)
    test_nonexistent_asset_lineage(results)
    test_lineage_max_depth_limit(results)
    test_database_structure_validation(results)
    test_table_structure_validation(results)
    test_column_structure_validation(results)
    test_lineage_node_structure(results)
    test_lineage_edge_structure(results)
    test_transformation_types(results)
    test_cors_headers(results)
    test_content_type_json(results)

    # Print results
    print("=" * 60)
    print("TEST RESULTS")
    print("=" * 60)

    for test in results.tests:
        status = "PASS" if test["passed"] else "FAIL"
        symbol = "✓" if test["passed"] else "✗"
        print(f"  {symbol} {test['name']}")
        if not test["passed"]:
            print(f"      Details: {test['details']}")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    total = results.passed + results.failed
    print(f"  Total: {total}")
    print(f"  Passed: {results.passed}")
    print(f"  Failed: {results.failed}")
    print(f"  Pass Rate: {results.passed/total*100:.1f}%")
    print("=" * 60)

    return 0 if results.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
