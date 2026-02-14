"""
Repository Package

Provides data access layer for lineage and dataset operations.
All database queries are encapsulated in repository classes.
"""

from repositories.base import BaseRepository

# Import repository classes if they exist
try:
    from repositories.lineage_repository import LineageRepository
except ImportError:
    LineageRepository = None

try:
    from repositories.dataset_repository import DatasetRepository
except ImportError:
    DatasetRepository = None

__all__ = [
    "BaseRepository",
    "LineageRepository",
    "DatasetRepository",
]
