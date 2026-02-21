"""
Impact Service

Analyzes upstream and downstream impact of changes to dataset columns.
Delegates to LineageRepository and DatasetRepository for data access.

Dual-path routing (matching LineageService):
    When graph_engine.is_ready is True, upstream and downstream traversal
    use in-memory BFS for sub-100ms latency. When the graph is not ready,
    the existing recursive CTE path is used transparently.
"""

from repositories.lineage_repository import LineageRepository
from repositories.dataset_repository import DatasetRepository
from exceptions import DatasetNotFoundError
from graph.engine import graph_engine


class ImpactService:
    """
    Service for impact analysis operations.

    Handles business logic for analyzing upstream and downstream impact of
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
        Analyze full lineage impact (upstream and downstream) for a column.

        Traverses both upstream and downstream lineage and aggregates impacted
        assets with depth classification (direct vs indirect impact).

        Args:
            dataset_id: Dataset identifier
            field_name: Column name
            max_depth: Maximum traversal depth (default: 5)

        Returns:
            dict: Impact analysis with source asset, upstream assets,
                  downstream assets (impactedAssets for backward compatibility),
                  and summary
                {
                    "sourceAsset": {"datasetId": ..., "datasetName": ..., "fieldName": ...},
                    "upstreamAssets": [
                        {"databaseName": ..., "tableName": ..., "columnName": ...,
                         "depth": N, "impactType": "direct"|"indirect"}
                    ],
                    "impactedAssets": [  # downstream (kept for backward compatibility)
                        {"databaseName": ..., "tableName": ..., "columnName": ...,
                         "depth": N, "impactType": "direct"|"indirect"}
                    ],
                    "summary": {
                        "totalImpacted": N,
                        "upstreamCount": N,
                        "downstreamCount": N,
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

        # Determine traversal path: BFS when graph is warm, CTE when not
        use_graph = graph_engine.is_ready
        node_id = f"{dataset_name}.{field_name}"

        # Get upstream lineage
        if use_graph:
            upstream_bfs = graph_engine.traverse_upstream(node_id, max_depth)
            upstream_records = self._bfs_to_records(upstream_bfs)
        else:
            upstream_records = self.lineage_repo.get_upstream_lineage(
                dataset_name, field_name, max_depth
            )

        # Get downstream lineage
        if use_graph:
            downstream_bfs = graph_engine.traverse_downstream(node_id, max_depth)
            downstream_records = self._bfs_to_records(downstream_bfs)
        else:
            downstream_records = self.lineage_repo.get_downstream_lineage(
                dataset_name, field_name, max_depth
            )

        # Build upstream assets list with deduplication
        upstream_assets = self._build_assets_from_upstream_records(
            upstream_records, dataset_name, field_name
        )

        # Build downstream assets list with deduplication (target_dataset/target_field)
        downstream_assets = self._build_assets_from_downstream_records(
            downstream_records, dataset_name, field_name
        )

        # Calculate summary statistics across both upstream and downstream
        all_assets = upstream_assets + downstream_assets
        total_impacted = len(all_assets)

        unique_tables = set()
        for asset in all_assets:
            unique_tables.add(f"{asset['databaseName']}.{asset['tableName']}")
        table_count = len(unique_tables)

        column_count = total_impacted

        unique_databases = set(asset["databaseName"] for asset in all_assets)
        database_count = len(unique_databases)

        by_database = {}
        for asset in all_assets:
            db_name = asset["databaseName"]
            by_database[db_name] = by_database.get(db_name, 0) + 1

        by_depth = {}
        for asset in all_assets:
            depth_str = str(asset["depth"])
            by_depth[depth_str] = by_depth.get(depth_str, 0) + 1

        return {
            "sourceAsset": {
                "datasetId": dataset_id,
                "datasetName": dataset_name,
                "fieldName": field_name
            },
            "upstreamAssets": upstream_assets,
            "impactedAssets": downstream_assets,  # backward-compatible field name
            "summary": {
                "totalImpacted": total_impacted,
                "upstreamCount": len(upstream_assets),
                "downstreamCount": len(downstream_assets),
                "tableCount": table_count,
                "columnCount": column_count,
                "databaseCount": database_count,
                "byDatabase": by_database,
                "byDepth": by_depth
            }
        }

    def _bfs_to_records(self, bfs_edges: list[dict]) -> list[dict]:
        """
        Convert BFS edge dicts to the same format as CTE records.

        BFS edges from GraphEngine omit the depth field. For impact analysis,
        we assign depth=1 to all BFS edges since BFS does not track per-edge
        depth. The deduplication logic in _build_assets_from_*_records handles
        the minimum-depth selection when a column appears via multiple paths.

        Note: BFS reachability returns ALL edges in the reachable subgraph,
        which may include edges at different actual depths. Assigning depth=1
        is a conservative approximation — it marks all BFS connections as
        "direct" which is the correct conservative impact classification
        (if it's reachable at all, it's directly impacted at some depth).

        For accurate depth tracking, the CTE path (use_graph=False) should be
        used — it returns true traversal depth per edge.

        Args:
            bfs_edges: List of edge dicts from traverse_upstream/downstream.
                       Each dict has source_dataset, source_field,
                       target_dataset, target_field, transformation_type.
                       No depth field.

        Returns:
            list[dict]: Edge dicts with depth=1 added (CTE-compatible format).
        """
        result = []
        for edge in bfs_edges:
            result.append({
                "source_namespace": "",
                "source_dataset": edge["source_dataset"],
                "source_field": edge["source_field"],
                "target_namespace": "",
                "target_dataset": edge["target_dataset"],
                "target_field": edge["target_field"],
                "transformation_type": edge["transformation_type"],
                "depth": 1,  # BFS does not return per-edge depth
            })
        return result

    def _build_assets_from_downstream_records(
        self,
        records: list[dict],
        source_dataset_name: str,
        source_field_name: str
    ) -> list[dict]:
        """
        Build deduplicated downstream asset list from lineage records.

        For downstream records, the impacted column is target_dataset/target_field.
        Deduplication keeps the minimum depth occurrence of each column.

        Args:
            records: CTE or BFS records with target_dataset, target_field, depth
            source_dataset_name: The starting dataset name (to exclude self)
            source_field_name: The starting field name (to exclude self)

        Returns:
            list[dict]: Deduplicated downstream assets
        """
        impacted_dict = {}
        for record in records:
            target_dataset = record["target_dataset"]
            target_field = record["target_field"]
            depth = record["depth"]

            # Skip the source column itself (can appear if depth tracking includes it)
            if target_dataset == source_dataset_name and target_field == source_field_name:
                continue

            key = f"{target_dataset}.{target_field}"

            if key not in impacted_dict or depth < impacted_dict[key]["depth"]:
                parts = target_dataset.split(".", 1)
                if len(parts) == 2:
                    database_name_part, table_name_part = parts
                else:
                    database_name_part = target_dataset
                    table_name_part = target_dataset

                impact_type = "direct" if depth == 1 else "indirect"

                impacted_dict[key] = {
                    "databaseName": database_name_part,
                    "tableName": table_name_part,
                    "columnName": target_field,
                    "depth": depth,
                    "impactType": impact_type
                }

        return list(impacted_dict.values())

    def _build_assets_from_upstream_records(
        self,
        records: list[dict],
        source_dataset_name: str,
        source_field_name: str
    ) -> list[dict]:
        """
        Build deduplicated upstream asset list from lineage records.

        For upstream records, the source column is source_dataset/source_field.
        Deduplication keeps the minimum depth occurrence of each column.

        Args:
            records: CTE or BFS records with source_dataset, source_field, depth
            source_dataset_name: The starting dataset name (to exclude self)
            source_field_name: The starting field name (to exclude self)

        Returns:
            list[dict]: Deduplicated upstream assets
        """
        upstream_dict = {}
        for record in records:
            upstream_dataset = record["source_dataset"]
            upstream_field = record["source_field"]
            depth = record["depth"]

            # Skip the source column itself
            if upstream_dataset == source_dataset_name and upstream_field == source_field_name:
                continue

            key = f"{upstream_dataset}.{upstream_field}"

            if key not in upstream_dict or depth < upstream_dict[key]["depth"]:
                parts = upstream_dataset.split(".", 1)
                if len(parts) == 2:
                    database_name_part, table_name_part = parts
                else:
                    database_name_part = upstream_dataset
                    table_name_part = upstream_dataset

                impact_type = "direct" if depth == 1 else "indirect"

                upstream_dict[key] = {
                    "databaseName": database_name_part,
                    "tableName": table_name_part,
                    "columnName": upstream_field,
                    "depth": depth,
                    "impactType": impact_type
                }

        return list(upstream_dict.values())
