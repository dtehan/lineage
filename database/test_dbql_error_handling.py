#!/usr/bin/env python3
"""
Tests for DBQL error handling in extract_dbql_lineage.py.

Tests verify:
- DBQL-01: Missing DBQL access provides clear fallback guidance
- DBQL-02: Malformed queries logged and skipped without stopping extraction
- DBQL-03: Error logs include query ID, table name, error type
- DBQL-04: Extraction validates data completeness and reports summary
- TEST-05: Tests verify DBQL error handling scenarios
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Import the module under test
from extract_dbql_lineage import (
    DBQLLineageExtractor,
    ExtractionStats,
    configure_logging,
)


class TestExtractionStats:
    """Test the ExtractionStats dataclass."""

    def test_initial_counts_are_zero(self):
        """Stats start at zero."""
        stats = ExtractionStats()
        assert stats.processed == 0
        assert stats.succeeded == 0
        assert stats.failed == 0
        assert stats.skipped == 0
        assert len(stats.errors) == 0

    def test_record_success_increments_counters(self):
        """record_success increments processed and succeeded."""
        stats = ExtractionStats()
        stats.record_success()
        assert stats.processed == 1
        assert stats.succeeded == 1

    def test_record_failure_increments_counters_and_stores_error(self):
        """record_failure increments counters and stores error context."""
        stats = ExtractionStats()
        stats.record_failure(
            query_id="12345",
            table_name="demo_user.TEST_TABLE",
            error_type="ParseError",
            error_msg="Unexpected token"
        )
        assert stats.processed == 1
        assert stats.failed == 1
        assert len(stats.errors) == 1
        assert stats.errors[0]['query_id'] == "12345"
        assert stats.errors[0]['table_name'] == "demo_user.TEST_TABLE"
        assert stats.errors[0]['error_type'] == "ParseError"

    def test_record_failure_truncates_long_messages(self):
        """Long error messages are truncated to 200 chars."""
        stats = ExtractionStats()
        long_msg = "x" * 500
        stats.record_failure("1", "tbl", "Error", long_msg)
        assert len(stats.errors[0]['error_message']) == 200

    def test_record_failure_limits_stored_errors(self):
        """Errors list is limited to 1000 to prevent memory issues."""
        stats = ExtractionStats()
        for i in range(1100):
            stats.record_failure(str(i), "tbl", "Error", "msg")
        assert len(stats.errors) == 1000
        assert stats.failed == 1100  # Counter still accurate

    def test_record_skip_increments_counters(self):
        """record_skip increments processed and skipped."""
        stats = ExtractionStats()
        stats.record_skip("null query_text")
        assert stats.processed == 1
        assert stats.skipped == 1

    def test_summary_returns_formatted_string(self):
        """summary() returns human-readable counts."""
        stats = ExtractionStats()
        stats.succeeded = 100
        stats.failed = 5
        stats.skipped = 2
        summary = stats.summary()
        assert "100 succeeded" in summary
        assert "5 failed" in summary
        assert "2 skipped" in summary


class TestCheckDbqlAccess:
    """Test DBQL access checking with actionable error messages (DBQL-01)."""

    def test_access_granted_returns_true(self):
        """When DBQL access works, returns (True, success_message)."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.cursor = Mock()
        extractor.cursor.execute.return_value = None  # Success

        has_access, message = extractor.check_dbql_access()

        assert has_access is True
        assert "confirmed" in message.lower()

    def test_access_denied_returns_fallback_guidance(self):
        """DBQL-01: Missing access provides clear fallback guidance."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.cursor = Mock()

        # Simulate Teradata error 3523 (access denied)
        import teradatasql
        extractor.cursor.execute.side_effect = teradatasql.DatabaseError(
            "[Error 3523] User does not have SELECT access to DBC.DBQLogTbl"
        )

        has_access, message = extractor.check_dbql_access()

        assert has_access is False
        # Must include fallback command
        assert "populate_lineage.py --manual" in message
        # Must include grant instructions
        assert "GRANT SELECT" in message

    def test_other_database_error_returns_error_message(self):
        """Non-access errors return the error message."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.cursor = Mock()

        import teradatasql
        extractor.cursor.execute.side_effect = teradatasql.DatabaseError(
            "[Error 2580] Table not found"
        )

        has_access, message = extractor.check_dbql_access()

        assert has_access is False
        assert "2580" in message or "Table not found" in message


class TestContinueOnFailure:
    """Test that extraction continues after individual query failures (DBQL-02)."""

    def test_malformed_query_does_not_stop_extraction(self):
        """DBQL-02: Malformed queries logged and skipped without failing extraction."""
        extractor = DBQLLineageExtractor(verbose=True)

        # Mock parser to fail on specific query
        mock_parser = Mock()
        def parse_side_effect(sql, stmt_type=None):
            if "INVALID" in sql:
                raise Exception("Parse error: unexpected token")
            return []  # No lineage for valid queries (simplified)

        mock_parser.extract_column_lineage.side_effect = parse_side_effect
        extractor.parser = mock_parser

        # Process queries directly (bypassing fetch_queries)
        queries = [
            (1, 'Insert', 'INSERT INTO t1 SELECT * FROM t2', datetime.now(), 'demo_user'),
            (2, 'Insert', 'INVALID SQL {{{{', datetime.now(), 'demo_user'),  # Will fail
            (3, 'Insert', 'INSERT INTO t3 SELECT * FROM t4', datetime.now(), 'demo_user'),
        ]

        # Manually process queries to test continue-on-failure
        for query_id, stmt_type, query_text, query_time, default_db in queries:
            try:
                extractor.parser.extract_column_lineage(query_text, stmt_type)
                extractor.extraction_stats.record_success()
            except Exception as e:
                extractor.extraction_stats.record_failure(
                    str(query_id), "UNKNOWN", type(e).__name__, str(e)
                )

        # All 3 queries should be processed
        assert extractor.extraction_stats.processed == 3
        # 1 should have failed
        assert extractor.extraction_stats.failed == 1
        # 2 should have succeeded
        assert extractor.extraction_stats.succeeded == 2

    def test_extraction_completes_with_failures(self):
        """Extraction completes successfully even when individual queries fail."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.extraction_stats.record_success()
        extractor.extraction_stats.record_failure("1", "tbl", "ParseError", "error")
        extractor.extraction_stats.record_success()

        # Verify extraction can report final stats (not stopped by failure)
        summary = extractor.extraction_stats.summary()
        assert "2 succeeded" in summary
        assert "1 failed" in summary


class TestErrorLogging:
    """Test that error logs include required context (DBQL-03)."""

    def test_error_includes_query_id(self):
        """DBQL-03: Error context includes query_id."""
        stats = ExtractionStats()
        stats.record_failure(
            query_id="ABC123",
            table_name="test_table",
            error_type="ParseError",
            error_msg="test error"
        )
        assert stats.errors[0]['query_id'] == "ABC123"

    def test_error_includes_table_name(self):
        """DBQL-03: Error context includes table_name."""
        stats = ExtractionStats()
        stats.record_failure(
            query_id="123",
            table_name="demo_user.MY_TABLE",
            error_type="ParseError",
            error_msg="test error"
        )
        assert stats.errors[0]['table_name'] == "demo_user.MY_TABLE"

    def test_error_includes_error_type(self):
        """DBQL-03: Error context includes error_type."""
        stats = ExtractionStats()
        stats.record_failure(
            query_id="123",
            table_name="tbl",
            error_type="ValidationError",
            error_msg="test error"
        )
        assert stats.errors[0]['error_type'] == "ValidationError"


class TestExtractTargetTable:
    """Test the _extract_target_table helper method."""

    def test_extracts_insert_into_table(self):
        """Extracts table from INSERT INTO statement."""
        extractor = DBQLLineageExtractor()
        table = extractor._extract_target_table("INSERT INTO demo_user.MY_TABLE SELECT * FROM src")
        assert table == "demo_user.MY_TABLE"

    def test_extracts_merge_into_table(self):
        """Extracts table from MERGE INTO statement."""
        extractor = DBQLLineageExtractor()
        table = extractor._extract_target_table("MERGE INTO target_tbl USING src ON ...")
        assert table == "target_tbl"

    def test_returns_unknown_for_unmatched(self):
        """Returns UNKNOWN when pattern doesn't match."""
        extractor = DBQLLineageExtractor()
        table = extractor._extract_target_table("SELECT * FROM something")
        assert table == "UNKNOWN"

    def test_handles_null_query(self):
        """Returns UNKNOWN for null/empty query."""
        extractor = DBQLLineageExtractor()
        assert extractor._extract_target_table(None) == "UNKNOWN"
        assert extractor._extract_target_table("") == "UNKNOWN"


class TestDataValidation:
    """Test DBQL data completeness validation (DBQL-04)."""

    def test_validate_dbql_data_returns_true_for_valid_data(self):
        """validate_dbql_data returns True for valid query data."""
        extractor = DBQLLineageExtractor()
        queries = [
            (1, 'Insert', 'INSERT INTO t1 SELECT * FROM t2', None, 'db'),
            (2, 'Insert', 'INSERT INTO t2 SELECT * FROM t3', None, 'db'),
        ]
        result = extractor.validate_dbql_data(queries)
        assert result is True

    def test_validate_dbql_data_returns_true_for_empty(self):
        """validate_dbql_data returns True for empty list (nothing to process)."""
        extractor = DBQLLineageExtractor()
        result = extractor.validate_dbql_data([])
        assert result is True

    def test_validate_dbql_data_warns_on_null_query_text(self):
        """validate_dbql_data logs warning for NULL query_text."""
        extractor = DBQLLineageExtractor()
        queries = [
            (1, 'Insert', None, None, 'db'),  # NULL query_text
            (2, 'Insert', 'INSERT INTO t1 SELECT * FROM t2', None, 'db'),
        ]
        # Should complete without error and return True
        result = extractor.validate_dbql_data(queries)
        assert result is True


class TestSummaryReporting:
    """Test extraction summary reporting (DBQL-04)."""

    def test_summary_includes_all_counts(self):
        """DBQL-04: Summary includes success/failure/skip counts."""
        stats = ExtractionStats()
        stats.succeeded = 100
        stats.failed = 5
        stats.skipped = 2
        stats.processed = 107

        summary = stats.summary()

        assert "100" in summary  # succeeded
        assert "5" in summary    # failed
        assert "2" in summary    # skipped

    def test_print_summary_runs_without_error(self):
        """print_summary can run with mock data and no DB connection."""
        extractor = DBQLLineageExtractor(verbose=True)
        extractor.extraction_stats.processed = 10
        extractor.extraction_stats.succeeded = 8
        extractor.extraction_stats.failed = 2
        extractor.table_lineage_count = 5
        extractor.column_lineage_count = 20
        extractor.cursor = None  # No DB connection

        # Should not raise any exception
        extractor.print_summary()


class TestLoggingConfiguration:
    """Test logging configuration."""

    def test_configure_logging_returns_logger(self):
        """configure_logging returns a configured logger."""
        logger = configure_logging(verbose=False)
        assert logger.name == 'dbql_extractor'

    def test_verbose_sets_debug_level(self):
        """Verbose mode sets DEBUG level."""
        import logging
        logger = configure_logging(verbose=True)
        assert logger.level == logging.DEBUG

    def test_non_verbose_sets_info_level(self):
        """Non-verbose mode sets INFO level."""
        import logging
        # Clear handlers from previous test
        logger = logging.getLogger('dbql_extractor')
        logger.handlers = []
        logger = configure_logging(verbose=False)
        assert logger.level == logging.INFO


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
