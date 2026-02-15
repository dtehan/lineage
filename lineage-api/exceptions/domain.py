"""Domain-specific exceptions for the lineage application."""

from typing import Optional
from exceptions.base import LineageException


class DatasetNotFoundError(LineageException):
    """Raised when a requested dataset does not exist.

    This replaces the current ValueError pattern used for "not found" cases.
    """

    def __init__(self, message: str, details: dict = None):
        """Initialize a DatasetNotFoundError with 404 status code.

        Args:
            message: Human-readable error message
            details: Additional context dict (default {})
        """
        super().__init__(message, status_code=404, details=details)


class LineageTraversalError(LineageException):
    """Raised when an error occurs during graph traversal.

    Examples: CTE failures, unexpected data structures, cycle detection issues.
    """

    def __init__(self, message: str, details: dict = None):
        """Initialize a LineageTraversalError with 500 status code.

        Args:
            message: Human-readable error message
            details: Additional context dict (default {})
        """
        super().__init__(message, status_code=500, details=details)


class DatabaseConnectionError(LineageException):
    """Raised when a database connection or query fails.

    Wraps teradatasql exceptions and other database errors.
    """

    def __init__(
        self, message: str, original_error: Optional[Exception] = None, details: dict = None
    ):
        """Initialize a DatabaseConnectionError with 500 status code.

        Args:
            message: Human-readable error message
            original_error: The underlying exception (stored but not exposed to clients)
            details: Additional context dict (default {})
        """
        super().__init__(message, status_code=500, details=details)
        self.original_error = original_error

    def to_dict(self) -> dict:
        """Convert exception to API response format.

        Returns:
            Dict with single "error" key. The original_error is NOT exposed.
        """
        # Explicitly do not expose original_error to clients
        return {"error": self.message}
