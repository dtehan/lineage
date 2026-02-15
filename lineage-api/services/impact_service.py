"""
Impact Service

Analyzes downstream impact of changes to dataset columns.
Delegates to LineageRepository and DatasetRepository for data access.
"""

from repositories.lineage_repository import LineageRepository
from repositories.dataset_repository import DatasetRepository
from exceptions import DatasetNotFoundError


class ImpactService:
    """
    Service for impact analysis operations.

    Handles business logic for analyzing downstream impact of
    changes to dataset columns.
    """

    def __init__(self, lineage_repo: LineageRepository, dataset_repo: DatasetRepository):
        """
        Initialize service with repositories.

        Args:
            lineage_repo: LineageRepository instance for lineage data access
            dataset_repo: DatasetRepository instance for dataset metadata access
        """
        self.lineage_repo = lineage_repo
        self.dataset_repo = dataset_repo

    def analyze_downstream_impact(
        self,
        dataset_id: str,
        field_name: str,
        max_depth: int = 5
    ) -> dict:
        """
        Analyze downstream impact of changes to a column.

        Traverses downstream lineage and aggregates impacted assets with
        depth classification (direct vs indirect impact).

        Args:
            dataset_id: Dataset identifier
            field_name: Column name
            max_depth: Maximum traversal depth (default: 5)

        Returns:
            dict: Impact analysis with source asset, impacted assets, and summary
                {
                    "sourceAsset": {"datasetId": ..., "datasetName": ..., "fieldName": ...},
                    "impactedAssets": [
                        {"databaseName": ..., "tableName": ..., "columnName": ..., "depth": N, "impactType": "direct"|"indirect"}
                    ],
                    "summary": {
                        "totalImpacted": N,
                        "tableCount": N,
                        "columnCount": N,
                        "databaseCount": N,
                        "byDatabase": {"db_name": count, ...},
                        "byDepth": {"1": count, "2": count, ...}
                    }
                }

        Raises:
            ValueError: If dataset not found
        """
        # Look up dataset name
        dataset_name = self.dataset_repo.get_dataset_name(dataset_id)
        if not dataset_name:
            raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

        # Get downstream lineage
        downstream_records = self.lineage_repo.get_downstream_lineage(
            dataset_name, field_name, max_depth
        )

        # Build impacted assets list with deduplication
        # Use target_dataset.target_field as key to deduplicate
        impacted_dict = {}
        for record in downstream_records:
            target_dataset = record["target_dataset"]
            target_field = record["target_field"]
            depth = record["depth"]

            # Use target column as unique key
            key = f"{target_dataset}.{target_field}"

            # Only keep the first occurrence (shortest depth)
            if key not in impacted_dict or depth < impacted_dict[key]["depth"]:
                # Parse database_name and table_name from target_dataset
                # Format: "database.table"
                parts = target_dataset.split(".", 1)
                if len(parts) == 2:
                    database_name_part, table_name_part = parts
                else:
                    # Fallback if format is unexpected
                    database_name_part = target_dataset
                    table_name_part = target_dataset

                # Determine impact type
                impact_type = "direct" if depth == 1 else "indirect"

                impacted_dict[key] = {
                    "databaseName": database_name_part,
                    "tableName": table_name_part,
                    "columnName": target_field,
                    "depth": depth,
                    "impactType": impact_type
                }

        # Convert to list
        impacted_assets = list(impacted_dict.values())

        # Calculate summary statistics
        total_impacted = len(impacted_assets)

        # Count unique tables (database.table combinations)
        unique_tables = set()
        for asset in impacted_assets:
            unique_tables.add(f"{asset['databaseName']}.{asset['tableName']}")
        table_count = len(unique_tables)

        # Count columns (same as total impacted since we deduplicated)
        column_count = total_impacted

        # Count unique databases
        unique_databases = set(asset["databaseName"] for asset in impacted_assets)
        database_count = len(unique_databases)

        # Count by database
        by_database = {}
        for asset in impacted_assets:
            db_name = asset["databaseName"]
            by_database[db_name] = by_database.get(db_name, 0) + 1

        # Count by depth
        by_depth = {}
        for asset in impacted_assets:
            depth_str = str(asset["depth"])
            by_depth[depth_str] = by_depth.get(depth_str, 0) + 1

        return {
            "sourceAsset": {
                "datasetId": dataset_id,
                "datasetName": dataset_name,
                "fieldName": field_name
            },
            "impactedAssets": impacted_assets,
            "summary": {
                "totalImpacted": total_impacted,
                "tableCount": table_count,
                "columnCount": column_count,
                "databaseCount": database_count,
                "byDatabase": by_database,
                "byDepth": by_depth
            }
        }
