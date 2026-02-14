"""
Repository Package

Provides data access layer for lineage and dataset operations.
All database queries are encapsulated in repository classes.
"""

from repositories.base import BaseRepository
from repositories.lineage_repository import LineageRepository
from repositories.dataset_repository import DatasetRepository

__all__ = [
    "BaseRepository",
    "LineageRepository",
    "DatasetRepository",
]
