"""
Dataset Service

Orchestrates dataset, namespace, search, statistics, and DDL operations.
Delegates to DatasetRepository for data access.
"""

from repositories.dataset_repository import DatasetRepository
from exceptions import DatasetNotFoundError


class DatasetService:
    """
    Service for dataset and namespace operations.

    Handles business logic for datasets, namespaces, search,
    statistics, and DDL retrieval.
    """

    def __init__(self, dataset_repo: DatasetRepository):
        """
        Initialize service with dataset repository.

        Args:
            dataset_repo: DatasetRepository instance for data access
        """
        self.dataset_repo = dataset_repo

    def list_namespaces(self) -> dict:
        """
        List all namespaces.

        Returns:
            dict: Response with namespaces list
                {"namespaces": [...]}
        """
        namespaces = self.dataset_repo.list_namespaces()
        return {"namespaces": namespaces}

    def get_namespace(self, namespace_id: str) -> dict:
        """
        Get a specific namespace by ID.

        Args:
            namespace_id: Namespace identifier

        Returns:
            dict: Namespace data

        Raises:
            ValueError: If namespace not found
        """
        namespace = self.dataset_repo.get_namespace(namespace_id)
        if not namespace:
            raise DatasetNotFoundError(f"Namespace not found: {namespace_id}")
        return namespace

    def list_datasets(self, namespace_id: str, limit: int = 100, offset: int = 0) -> dict:
        """
        List datasets in a namespace with pagination.

        Args:
            namespace_id: Namespace identifier
            limit: Maximum number of datasets to return
            offset: Number of datasets to skip

        Returns:
            dict: Response with datasets list and pagination info
                {"datasets": [...], "pagination": {...}}
        """
        datasets, total = self.dataset_repo.list_datasets(namespace_id, limit, offset)

        return {
            "datasets": datasets,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": total
            }
        }

    def get_dataset(self, dataset_id: str) -> dict:
        """
        Get a specific dataset with its fields.

        Args:
            dataset_id: Dataset identifier

        Returns:
            dict: Dataset data with fields

        Raises:
            ValueError: If dataset not found
        """
        dataset = self.dataset_repo.get_dataset(dataset_id)
        if not dataset:
            raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")
        return dataset

    def search_datasets(self, query: str, limit: int = 50) -> dict:
        """
        Search for datasets by name or description.

        Args:
            query: Search query string
            limit: Maximum number of results

        Returns:
            dict: Response with datasets list, query, and count
                {"datasets": [...], "query": query, "count": N}
        """
        datasets = self.dataset_repo.search_datasets(query, limit)

        return {
            "datasets": datasets,
            "query": query,
            "count": len(datasets)
        }

    def unified_search(self, query: str, limit: int = 50) -> dict:
        """
        Unified search for both databases and datasets.

        Args:
            query: Search query string
            limit: Maximum number of dataset results

        Returns:
            dict: Response with databases and datasets lists
                {"databases": [...], "datasets": [...], "query": query}
        """
        result = self.dataset_repo.unified_search(query, limit)
        result["query"] = query
        return result

    def get_dataset_statistics(self, dataset_id: str) -> dict:
        """
        Get statistics for a dataset (table/view).

        Args:
            dataset_id: Dataset identifier

        Returns:
            dict: Statistics data

        Raises:
            ValueError: If dataset not found
        """
        stats = self.dataset_repo.get_dataset_statistics(dataset_id)
        if not stats:
            raise DatasetNotFoundError(f"Dataset not found or statistics unavailable: {dataset_id}")
        return stats

    def get_dataset_ddl(self, dataset_id: str) -> dict:
        """
        Get DDL/definition for a dataset (table/view).

        Args:
            dataset_id: Dataset identifier

        Returns:
            dict: DDL data

        Raises:
            ValueError: If dataset not found
        """
        ddl = self.dataset_repo.get_dataset_ddl(dataset_id)
        if not ddl:
            raise DatasetNotFoundError(f"Dataset not found or DDL unavailable: {dataset_id}")
        return ddl
