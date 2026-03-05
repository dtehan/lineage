#!/usr/bin/env python3
"""
WatermarkStore - Incremental population tracking for OL_POPULATE_LOG table.

Tracks when each populate source was last successfully processed, enabling
incremental updates that only process new/changed data since the last run.

Usage:
    store = WatermarkStore(cursor, database)
    last_run = store.get(WatermarkStore.SOURCE_DBQL)
    store.set(WatermarkStore.SOURCE_DBQL, rows=150, status="SUCCESS")
"""

from datetime import datetime
from typing import Optional


class WatermarkStore:
    """
    Manages populate watermarks in the OL_POPULATE_LOG table.

    All methods are exception-safe — failures are non-fatal and never
    abort the populate run.
    """

    # Source name constants
    SOURCE_DATASETS = "DATASETS"
    SOURCE_FIELDS = "FIELDS"
    SOURCE_VIEW_LINEAGE = "VIEW_LINEAGE"
    SOURCE_DBQL = "DBQL"

    def __init__(self, cursor, database: str):
        """
        Initialize WatermarkStore with a Teradata cursor and database name.

        Args:
            cursor: Active Teradata cursor
            database: Database name where OL_POPULATE_LOG lives
        """
        self.cursor = cursor
        self.database = database

    def get(self, source_name: str) -> Optional[datetime]:
        """
        Get the last successful run timestamp for a source.

        Returns None if:
        - OL_POPULATE_LOG table does not exist
        - No row for the given source_name
        - Any exception occurs (non-fatal)

        Args:
            source_name: One of SOURCE_* constants

        Returns:
            datetime of last successful run, or None
        """
        try:
            self.cursor.execute(
                f"SELECT last_run_at FROM {self.database}.OL_POPULATE_LOG "
                "WHERE source_name = ?",
                (source_name,)
            )
            row = self.cursor.fetchone()
            if row is not None:
                return row[0]
            return None
        except Exception:
            return None

    def set(self, source_name: str, rows: int = 0, status: str = "SUCCESS") -> None:
        """
        Persist a watermark using UPDATE-then-conditional-INSERT pattern.

        Uses CURRENT_TIMESTAMP(0) from Teradata (not Python datetime.now())
        to avoid timezone mismatch issues.

        Silently handles all exceptions — watermark failures are non-fatal.

        Args:
            source_name: One of SOURCE_* constants
            rows: Number of rows processed in this run
            status: Run status, defaults to "SUCCESS"
        """
        try:
            # UPDATE existing row first
            self.cursor.execute(
                f"""UPDATE {self.database}.OL_POPULATE_LOG
                    SET last_run_at = CURRENT_TIMESTAMP(0),
                        rows_processed = ?,
                        status = ?,
                        updated_at = CURRENT_TIMESTAMP(0)
                    WHERE source_name = ?""",
                (rows, status, source_name)
            )

            # INSERT if no row exists (conditional INSERT with NOT EXISTS)
            self.cursor.execute(
                f"""INSERT INTO {self.database}.OL_POPULATE_LOG
                    (source_name, last_run_at, rows_processed, status, updated_at)
                    SELECT ?, CURRENT_TIMESTAMP(0), ?, ?, CURRENT_TIMESTAMP(0)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM {self.database}.OL_POPULATE_LOG
                        WHERE source_name = ?
                    )""",
                (source_name, rows, status, source_name)
            )
        except Exception:
            # Non-fatal — never abort populate run due to watermark failure
            pass

    def clear(self, source_name: str) -> None:
        """
        Delete the watermark for a specific source.

        Silently handles all exceptions.

        Args:
            source_name: One of SOURCE_* constants
        """
        try:
            self.cursor.execute(
                f"DELETE FROM {self.database}.OL_POPULATE_LOG "
                "WHERE source_name = ?",
                (source_name,)
            )
        except Exception:
            pass

    def clear_all(self) -> None:
        """
        Delete all watermarks from OL_POPULATE_LOG.

        Silently handles all exceptions.
        """
        try:
            self.cursor.execute(
                f"DELETE FROM {self.database}.OL_POPULATE_LOG"
            )
        except Exception:
            pass
