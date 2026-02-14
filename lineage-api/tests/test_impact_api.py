#!/usr/bin/env python3
"""
Impact Analysis API Test Suite
Dedicated tests for the impact analysis endpoint.
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


def get_test_dataset_and_field():
    """Helper function to get a valid dataset and field for testing."""
    try:
        # Get namespace
        ns_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces")
        ns_data = ns_response.json()
        if not ns_data.get("namespaces"):
            return None, None, None

        namespace_id = ns_data["namespaces"][0]["id"]

        # Get dataset
        ds_response = requests.get(f"{BASE_URL}/api/v2/openlineage/namespaces/{namespace_id}/datasets")
        ds_data = ds_response.json()
        if not ds_data.get("datasets"):
            return None, None, None

        dataset_id = ds_data["datasets"][0]["id"]

        # Get field
        ds_detail = requests.get(f"{BASE_URL}/api/v2/openlineage/datasets/{dataset_id}").json()
        if not ds_detail.get("fields"):
            return None, None, None

        field_name = ds_detail["fields"][0]["name"]
        return namespace_id, dataset_id, field_name
    except Exception:
        return None, None, None


def test_impact_endpoint_returns_200(results):
    """TC-IMPACT-001: Impact endpoint returns 200 with valid dataset/field"""
    try:
        _, dataset_id, field_name = get_test_dataset_and_field()
        if not dataset_id or not field_name:
            results.add_result("TC-IMPACT-001: Impact endpoint returns 200", False,
                              "No test data available")
            return

        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        passed = response.status_code == 200
        results.add_result("TC-IMPACT-001: Impact endpoint returns 200", passed,
                          f"Status: {response.status_code}")
    except Exception as e:
        results.add_result("TC-IMPACT-001: Impact endpoint returns 200", False, str(e))


def test_impact_response_has_required_fields(results):
    """TC-IMPACT-002: Impact response has required fields"""
    try:
        _, dataset_id, field_name = get_test_dataset_and_field()
        if not dataset_id or not field_name:
            results.add_result("TC-IMPACT-002: Response has required fields", False,
                              "No test data available")
            return

        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        data = response.json()
        passed = ("sourceAsset" in data and
                 "impactedAssets" in data and
                 "summary" in data)
        results.add_result("TC-IMPACT-002: Response has required fields", passed,
                          f"Fields present: {list(data.keys())}")
    except Exception as e:
        results.add_result("TC-IMPACT-002: Response has required fields", False, str(e))


def test_impacted_assets_structure(results):
    """TC-IMPACT-003: impactedAssets entries have depth and impactType fields"""
    try:
        _, dataset_id, field_name = get_test_dataset_and_field()
        if not dataset_id or not field_name:
            results.add_result("TC-IMPACT-003: impactedAssets structure", False,
                              "No test data available")
            return

        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        data = response.json()
        impacted_assets = data.get("impactedAssets", [])

        if len(impacted_assets) == 0:
            results.add_result("TC-IMPACT-003: impactedAssets structure", True,
                              "No impacted assets (empty is valid)")
            return

        asset = impacted_assets[0]
        passed = ("depth" in asset and
                 "impactType" in asset and
                 "databaseName" in asset and
                 "tableName" in asset and
                 "columnName" in asset)
        results.add_result("TC-IMPACT-003: impactedAssets structure", passed,
                          f"Asset fields: {list(asset.keys())}")
    except Exception as e:
        results.add_result("TC-IMPACT-003: impactedAssets structure", False, str(e))


def test_summary_has_all_fields(results):
    """TC-IMPACT-004: summary has all required fields"""
    try:
        _, dataset_id, field_name = get_test_dataset_and_field()
        if not dataset_id or not field_name:
            results.add_result("TC-IMPACT-004: Summary has all fields", False,
                              "No test data available")
            return

        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        data = response.json()
        summary = data.get("summary", {})

        required_fields = ["totalImpacted", "tableCount", "columnCount",
                          "databaseCount", "byDatabase", "byDepth"]
        passed = all(field in summary for field in required_fields)
        results.add_result("TC-IMPACT-004: Summary has all fields", passed,
                          f"Summary fields: {list(summary.keys())}")
    except Exception as e:
        results.add_result("TC-IMPACT-004: Summary has all fields", False, str(e))


def test_max_depth_parameter_respected(results):
    """TC-IMPACT-005: maxDepth parameter is respected"""
    try:
        _, dataset_id, field_name = get_test_dataset_and_field()
        if not dataset_id or not field_name:
            results.add_result("TC-IMPACT-005: maxDepth parameter respected", False,
                              "No test data available")
            return

        # Test with depth 1
        response1 = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "1"}
        )
        data1 = response1.json()
        impacted1 = data1.get("summary", {}).get("totalImpacted", 0)

        # Test with depth 5
        response5 = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        data5 = response5.json()
        impacted5 = data5.get("summary", {}).get("totalImpacted", 0)

        # Depth 5 should find >= depth 1 results (more or equal)
        passed = impacted5 >= impacted1
        results.add_result("TC-IMPACT-005: maxDepth parameter respected", passed,
                          f"Depth 1: {impacted1} impacted, Depth 5: {impacted5} impacted")
    except Exception as e:
        results.add_result("TC-IMPACT-005: maxDepth parameter respected", False, str(e))


def test_nonexistent_dataset_returns_404(results):
    """TC-IMPACT-006: Non-existent dataset returns 404"""
    try:
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/nonexistent-dataset/nonexistent-field",
            params={"maxDepth": "5"}
        )
        passed = response.status_code == 404
        results.add_result("TC-IMPACT-006: Non-existent dataset returns 404", passed,
                          f"Status: {response.status_code}")
    except Exception as e:
        results.add_result("TC-IMPACT-006: Non-existent dataset returns 404", False, str(e))


def test_max_depth_clamped_to_10(results):
    """TC-IMPACT-007: maxDepth clamped to 10 (no timeout)"""
    try:
        _, dataset_id, field_name = get_test_dataset_and_field()
        if not dataset_id or not field_name:
            results.add_result("TC-IMPACT-007: maxDepth clamped to 10", False,
                              "No test data available")
            return

        # Request with maxDepth=100 should be clamped to 10 and not timeout
        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "100"},
            timeout=10  # Should complete within 10 seconds
        )
        passed = response.status_code == 200
        results.add_result("TC-IMPACT-007: maxDepth clamped to 10", passed,
                          f"Status: {response.status_code}, completed without timeout")
    except requests.Timeout:
        results.add_result("TC-IMPACT-007: maxDepth clamped to 10", False,
                          "Request timed out (maxDepth not properly clamped)")
    except Exception as e:
        results.add_result("TC-IMPACT-007: maxDepth clamped to 10", False, str(e))


def test_impact_type_classification(results):
    """TC-IMPACT-008: Impact type is 'direct' at depth 1, 'indirect' at depth > 1"""
    try:
        _, dataset_id, field_name = get_test_dataset_and_field()
        if not dataset_id or not field_name:
            results.add_result("TC-IMPACT-008: Impact type classification", False,
                              "No test data available")
            return

        response = requests.get(
            f"{BASE_URL}/api/v2/openlineage/impact/{dataset_id}/{field_name}",
            params={"maxDepth": "5"}
        )
        data = response.json()
        impacted_assets = data.get("impactedAssets", [])

        if len(impacted_assets) == 0:
            results.add_result("TC-IMPACT-008: Impact type classification", True,
                              "No impacted assets (empty is valid)")
            return

        # Check impact type classification
        passed = True
        for asset in impacted_assets:
            depth = asset.get("depth", 0)
            impact_type = asset.get("impactType", "")
            if depth == 1 and impact_type != "direct":
                passed = False
                break
            if depth > 1 and impact_type != "indirect":
                passed = False
                break

        results.add_result("TC-IMPACT-008: Impact type classification", passed,
                          f"Checked {len(impacted_assets)} assets")
    except Exception as e:
        results.add_result("TC-IMPACT-008: Impact type classification", False, str(e))


def main():
    print("=" * 60)
    print("IMPACT ANALYSIS API TEST SUITE")
    print("=" * 60)
    print(f"\nTarget: {BASE_URL}")
    print(f"Time: {datetime.now().isoformat()}")
    print()

    results = TestResults()

    # Run all tests
    print("Running impact analysis tests...\n")

    test_impact_endpoint_returns_200(results)
    test_impact_response_has_required_fields(results)
    test_impacted_assets_structure(results)
    test_summary_has_all_fields(results)
    test_max_depth_parameter_respected(results)
    test_nonexistent_dataset_returns_404(results)
    test_max_depth_clamped_to_10(results)
    test_impact_type_classification(results)

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
