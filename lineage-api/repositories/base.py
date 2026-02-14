"""
Base Repository Class

Provides common functionality for all repository classes including
connection management and helper methods for data processing.
"""

from datetime import datetime


class BaseRepository:
    """
    Base repository class with connection management and helper methods.

    All repository classes should inherit from this class to share
    common functionality like connection handling and data type conversions.
    """

    def __init__(self, connection):
        """
        Initialize repository with a database connection.

        Args:
            connection: A teradatasql connection object
        """
        self.connection = connection

    def _strip(self, value):
        """
        Strip whitespace from string values.

        This helper eliminates the repeated `row[N].strip() if row[N] else ""`
        pattern throughout the codebase. Teradata CHAR columns are padded with
        spaces, so this is used extensively.

        Args:
            value: Any value (typically from a database row)

        Returns:
            str: Stripped string if value is a string, otherwise the value unchanged
        """
        if isinstance(value, str):
            return value.strip()
        return value

    def _isoformat(self, value):
        """
        Convert datetime values to ISO format strings.

        Args:
            value: Any value (typically from a database row)

        Returns:
            str or None: ISO format string if value is datetime, None otherwise
        """
        if isinstance(value, datetime):
            return value.isoformat()
        return None
