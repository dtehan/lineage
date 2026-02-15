"""Exception hierarchy for the lineage application.

This module provides a consistent exception structure with HTTP status codes
for API error handling.

Usage:
    from exceptions import DatasetNotFoundError, LineageTraversalError

    raise DatasetNotFoundError("Dataset not found: 123")
"""

from exceptions.base import LineageException
from exceptions.domain import (
    DatasetNotFoundError,
    DatabaseConnectionError,
    LineageTraversalError,
)

__all__ = [
    "LineageException",
    "DatasetNotFoundError",
    "DatabaseConnectionError",
    "LineageTraversalError",
]
