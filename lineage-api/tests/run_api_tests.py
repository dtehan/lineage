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

def test_list_namespaces(results):
    """TC-API-002: List Namespaces Endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        data = response.json()
        passed = (response.status_code == 200 and
                 "namespaces" in data and
                 len(data["namespaces"]) > 0)
        results.add_result("TC-API-002: List Namespaces Endpoint", passed,
                          f"Found {len(data.get('namespaces', []))} namespaces")
    except Exception as e:
        results.add_result("TC-API-002: List Namespaces Endpoint", False, str(e))

def test_list_datasets(results):
    """TC-API-003: List Datasets Endpoint"""
    try:
        # First get a namespace ID
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-003: List Datasets Endpoint", False,
                              "No namespaces found to test datasets")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        data = response.json()
        passed = (response.status_code == 200 and
                 "datasets" in data)
        results.add_result("TC-API-003: List Datasets Endpoint", passed,
                          f"Found {len(data.get('datasets', []))} datasets")
    except Exception as e:
        results.add_result("TC-API-003: List Datasets Endpoint", False, str(e))

def test_get_dataset(results):
    """TC-API-004: Get Dataset with Fields Endpoint"""
    try:
        # First get a namespace and dataset ID
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-004: Get Dataset with Fields Endpoint", False,
                              "No namespaces found to test dataset")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-004: Get Dataset with Fields Endpoint", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}")
        data = response.json()
        passed = (response.status_code == 200 and
                 "fields" in data)
        results.add_result("TC-API-004: Get Dataset with Fields Endpoint", passed,
                          f"Found {len(data.get('fields', []))} fields")
    except Exception as e:
        results.add_result("TC-API-004: Get Dataset with Fields Endpoint", False, str(e))

def test_column_lineage(results):
    """TC-API-005: Column Lineage Endpoint"""
    try:
        # Get a dataset with fields to test lineage
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-005: Column Lineage Endpoint", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-005: Column Lineage Endpoint", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        ds_detail = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}").json()

        if not ds_detail.get("fields"):
            results.add_result("TC-API-005: Column Lineage Endpoint", False,
                              "No fields found in dataset")
            return

        field_name = ds_detail["fields"][0]["name"]
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/lineage/{dataset_id}/{field_name}",
            params={"direction": "both", "maxDepth": "5"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "nodes" in data and
                 "edges" in data)
        results.add_result("TC-API-005: Column Lineage Endpoint", passed,
                          f"Nodes: {len(data.get('nodes', []))}, Edges: {len(data.get('edges', []))}")
    except Exception as e:
        results.add_result("TC-API-005: Column Lineage Endpoint", False, str(e))

def test_table_lineage(results):
    """TC-API-006: Table Lineage Endpoint"""
    try:
        # Get a dataset ID for table lineage
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-006: Table Lineage Endpoint", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-006: Table Lineage Endpoint", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/lineage/table/{dataset_id}",
            params={"direction": "both", "maxDepth": "5"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "nodes" in data and
                 "edges" in data)
        results.add_result("TC-API-006: Table Lineage Endpoint", passed,
                          f"Nodes: {len(data.get('nodes', []))}, Edges: {len(data.get('edges', []))}")
    except Exception as e:
        results.add_result("TC-API-006: Table Lineage Endpoint", False, str(e))

def test_database_lineage(results):
    """TC-API-007: Database Lineage Endpoint"""
    try:
        # Get a database name from namespace
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-007: Database Lineage Endpoint", False,
                              "No namespaces found")
            return

        # Extract database name from first dataset
        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-007: Database Lineage Endpoint", False,
                              "No datasets found")
            return

        # Parse database name from dataset name (format: database.table)
        dataset_name = ds_data["datasets"][0]["name"]
        database_name = dataset_name.split(".")[0] if "." in dataset_name else "demo_user"

        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/lineage/database/{database_name}",
            params={"direction": "both", "maxDepth": "3"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "nodes" in data and
                 "edges" in data)
        results.add_result("TC-API-007: Database Lineage Endpoint", passed,
                          f"Nodes: {len(data.get('nodes', []))}, Edges: {len(data.get('edges', []))}")
    except Exception as e:
        results.add_result("TC-API-007: Database Lineage Endpoint", False, str(e))

def test_impact_analysis(results):
    """TC-API-008: Impact Analysis Endpoint"""
    try:
        # Get a dataset and field for impact analysis
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-008: Impact Analysis Endpoint", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-008: Impact Analysis Endpoint", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        ds_detail = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}").json()

        if not ds_detail.get("fields"):
            results.add_result("TC-API-008: Impact Analysis Endpoint", False,
                              "No fields found")
            return

        field_name = ds_detail["fields"][0]["name"]
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "sourceAsset" in data and
                 "impactedAssets" in data and
                 "summary" in data)
        results.add_result("TC-API-008: Impact Analysis Endpoint", passed,
                          f"Total impacted: {data.get('summary', {}).get('totalImpacted', 0)}")
    except Exception as e:
        results.add_result("TC-API-008: Impact Analysis Endpoint", False, str(e))

def test_search_datasets(results):
    """TC-API-009: Search Datasets Endpoint"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/datasets/search",
            params={"q": "SA", "limit": "10"}
        )
        data = response.json()
        passed = (response.status_code == 200 and
                 "results" in data)
        results.add_result("TC-API-009: Search Datasets Endpoint", passed,
                          f"Found {len(data.get('results', []))} results")
    except Exception as e:
        results.add_result("TC-API-009: Search Datasets Endpoint", False, str(e))

def test_dataset_statistics(results):
    """TC-API-010: Dataset Statistics Endpoint"""
    try:
        # Get a dataset ID
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-010: Dataset Statistics Endpoint", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-010: Dataset Statistics Endpoint", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}/statistics")
        data = response.json()
        passed = response.status_code == 200
        results.add_result("TC-API-010: Dataset Statistics Endpoint", passed,
                          f"Statistics: {list(data.keys())}")
    except Exception as e:
        results.add_result("TC-API-010: Dataset Statistics Endpoint", False, str(e))

def test_dataset_ddl(results):
    """TC-API-011: Dataset DDL Endpoint"""
    try:
        # Get a dataset ID
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-011: Dataset DDL Endpoint", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-011: Dataset DDL Endpoint", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}/ddl")
        data = response.json()
        passed = response.status_code == 200
        results.add_result("TC-API-011: Dataset DDL Endpoint", passed,
                          f"DDL keys: {list(data.keys())}")
    except Exception as e:
        results.add_result("TC-API-011: Dataset DDL Endpoint", False, str(e))

def test_nonexistent_dataset(results):
    """TC-API-012: Non-existent Dataset Returns 404"""
    try:
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/nonexistent-dataset-id-12345")
        passed = response.status_code == 404
        results.add_result("TC-API-012: Non-existent Dataset Returns 404", passed,
                          f"Status: {response.status_code}")
    except Exception as e:
        results.add_result("TC-API-012: Non-existent Dataset Returns 404", False, str(e))

def test_lineage_max_depth_parameter(results):
    """TC-API-013: Lineage maxDepth Parameter"""
    try:
        # Get a dataset and field
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-013: Lineage maxDepth Parameter", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-013: Lineage maxDepth Parameter", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        ds_detail = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}").json()

        if not ds_detail.get("fields"):
            results.add_result("TC-API-013: Lineage maxDepth Parameter", False,
                              "No fields found")
            return

        field_name = ds_detail["fields"][0]["name"]
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/lineage/{dataset_id}/{field_name}",
            params={"direction": "both", "maxDepth": "1"}
        )
        data = response.json()
        passed = response.status_code == 200
        results.add_result("TC-API-013: Lineage maxDepth Parameter", passed,
                          f"Depth 1: {len(data.get('nodes', []))} nodes")
    except Exception as e:
        results.add_result("TC-API-013: Lineage maxDepth Parameter", False, str(e))

def test_namespace_structure_validation(results):
    """TC-API-014: Namespace Structure Validation"""
    try:
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        data = response.json()
        if not data.get("namespaces"):
            results.add_result("TC-API-014: Namespace Structure Validation", False,
                              "No namespaces found")
            return
        namespace = data["namespaces"][0]
        passed = ("id" in namespace and "name" in namespace)
        results.add_result("TC-API-014: Namespace Structure Validation", passed,
                          f"Namespace has required fields: {list(namespace.keys())}")
    except Exception as e:
        results.add_result("TC-API-014: Namespace Structure Validation", False, str(e))

def test_dataset_structure_validation(results):
    """TC-API-015: Dataset Structure Validation"""
    try:
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-015: Dataset Structure Validation", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        data = response.json()

        if not data.get("datasets"):
            results.add_result("TC-API-015: Dataset Structure Validation", False,
                              "No datasets found")
            return

        dataset = data["datasets"][0]
        passed = ("id" in dataset and "name" in dataset)
        results.add_result("TC-API-015: Dataset Structure Validation", passed,
                          f"Dataset has required fields: {list(dataset.keys())}")
    except Exception as e:
        results.add_result("TC-API-015: Dataset Structure Validation", False, str(e))

def test_field_structure_validation(results):
    """TC-API-016: Field Structure Validation"""
    try:
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-016: Field Structure Validation", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-016: Field Structure Validation", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}")
        data = response.json()

        if not data.get("fields"):
            results.add_result("TC-API-016: Field Structure Validation", False,
                              "No fields found")
            return

        field = data["fields"][0]
        passed = ("name" in field and "type" in field)
        results.add_result("TC-API-016: Field Structure Validation", passed,
                          f"Field has required fields: {list(field.keys())}")
    except Exception as e:
        results.add_result("TC-API-016: Field Structure Validation", False, str(e))

def test_lineage_node_structure(results):
    """TC-API-017: Lineage Node Structure"""
    try:
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-017: Lineage Node Structure", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-017: Lineage Node Structure", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        ds_detail = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}").json()

        if not ds_detail.get("fields"):
            results.add_result("TC-API-017: Lineage Node Structure", False,
                              "No fields found")
            return

        field_name = ds_detail["fields"][0]["name"]
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/lineage/{dataset_id}/{field_name}",
            params={"direction": "both", "maxDepth": "5"}
        )
        data = response.json()

        if not data.get("nodes"):
            results.add_result("TC-API-017: Lineage Node Structure", True,
                              "No nodes in lineage (empty result is valid)")
            return

        node = data["nodes"][0]
        passed = ("id" in node and "database" in node and "table" in node and "column" in node)
        results.add_result("TC-API-017: Lineage Node Structure", passed,
                          f"Node has required fields: {list(node.keys())}")
    except Exception as e:
        results.add_result("TC-API-017: Lineage Node Structure", False, str(e))

def test_lineage_edge_structure(results):
    """TC-API-018: Lineage Edge Structure"""
    try:
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-018: Lineage Edge Structure", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-018: Lineage Edge Structure", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        ds_detail = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}").json()

        if not ds_detail.get("fields"):
            results.add_result("TC-API-018: Lineage Edge Structure", False,
                              "No fields found")
            return

        field_name = ds_detail["fields"][0]["name"]
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/lineage/{dataset_id}/{field_name}",
            params={"direction": "both", "maxDepth": "5"}
        )
        data = response.json()

        if not data.get("edges"):
            results.add_result("TC-API-018: Lineage Edge Structure", True,
                              "No edges in lineage (empty result is valid)")
            return

        edge = data["edges"][0]
        passed = ("source" in edge and "target" in edge and "transformationType" in edge)
        results.add_result("TC-API-018: Lineage Edge Structure", passed,
                          f"Edge has required fields: {list(edge.keys())}")
    except Exception as e:
        results.add_result("TC-API-018: Lineage Edge Structure", False, str(e))

def test_impact_summary_structure(results):
    """TC-API-019: Impact Analysis Summary Structure"""
    try:
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()

        if not ns_data.get("namespaces"):
            results.add_result("TC-API-019: Impact Analysis Summary Structure", False,
                              "No namespaces found")
            return

        namespace_id = ns_data["namespaces"][0]["id"]
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()

        if not ds_data.get("datasets"):
            results.add_result("TC-API-019: Impact Analysis Summary Structure", False,
                              "No datasets found")
            return

        dataset_id = ds_data["datasets"][0]["id"]
        ds_detail = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}").json()

        if not ds_detail.get("fields"):
            results.add_result("TC-API-019: Impact Analysis Summary Structure", False,
                              "No fields found")
            return

        field_name = ds_detail["fields"][0]["name"]
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        data = response.json()
        summary = data.get("summary", {})
        passed = all(key in summary for key in ["totalImpacted", "tableCount", "columnCount", "databaseCount", "byDatabase", "byDepth"])
        results.add_result("TC-API-019: Impact Analysis Summary Structure", passed,
                          f"Summary has required fields: {list(summary.keys())}")
    except Exception as e:
        results.add_result("TC-API-019: Impact Analysis Summary Structure", False, str(e))

def test_content_type_json(results):
    """TC-API-020: Content-Type JSON Response"""
    try:
        response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
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
    test_list_namespaces(results)
    test_list_datasets(results)
    test_get_dataset(results)
    test_column_lineage(results)
    test_table_lineage(results)
    test_database_lineage(results)
    test_impact_analysis(results)
    test_search_datasets(results)
    test_dataset_statistics(results)
    test_dataset_ddl(results)
    test_nonexistent_dataset(results)
    test_lineage_max_depth_parameter(results)
    test_namespace_structure_validation(results)
    test_dataset_structure_validation(results)
    test_field_structure_validation(results)
    test_lineage_node_structure(results)
    test_lineage_edge_structure(results)
    test_impact_summary_structure(results)
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
