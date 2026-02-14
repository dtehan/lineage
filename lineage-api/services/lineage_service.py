"""
Lineage Service

Orchestrates lineage graph building for column, table, and database level lineage.
Delegates to LineageRepository and DatasetRepository for data access.
"""

from repositories.lineage_repository import LineageRepository
from repositories.dataset_repository import DatasetRepository


class LineageService:
    """
    Service for lineage graph operations.

    Handles business logic for building lineage graphs at column,
    table, and database levels.
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

    def get_column_lineage_graph(
        self,
        dataset_id: str,
        field_name: str,
        direction: str = "both",
        max_depth: int = 5
    ) -> dict:
        """
        Get lineage graph for a specific column.

        Args:
            dataset_id: Dataset identifier
            field_name: Column name
            direction: Lineage direction ("upstream", "downstream", or "both")
            max_depth: Maximum traversal depth

        Returns:
            dict: Lineage graph with nodes and edges
                {"datasetId": ..., "fieldName": ..., "graph": {"nodes": [...], "edges": [...]}}

        Raises:
            ValueError: If dataset not found
        """
        # Look up dataset name and namespace
        dataset_info = self.dataset_repo.get_dataset_with_namespace(dataset_id)
        if not dataset_info:
            raise ValueError(f"Dataset not found: {dataset_id}")

        dataset_name = dataset_info["name"]
        namespace_uri = dataset_info["namespace_uri"]

        nodes = {}
        edges = []

        # Get upstream lineage if requested
        if direction in ("upstream", "both"):
            upstream_records = self.lineage_repo.get_upstream_lineage(
                dataset_name, field_name, max_depth
            )
            self._add_lineage_results(upstream_records, nodes, edges)

        # Get downstream lineage if requested
        if direction in ("downstream", "both"):
            downstream_records = self.lineage_repo.get_downstream_lineage(
                dataset_name, field_name, max_depth
            )
            self._add_lineage_results(downstream_records, nodes, edges)

        # Add the root field node if not already present
        root_key = f"{dataset_name}.{field_name}"
        if root_key not in nodes:
            nodes[root_key] = self._build_node(
                root_key, field_name, dataset_name, namespace_uri
            )

        return {
            "datasetId": dataset_id,
            "fieldName": field_name,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        }

    def get_table_lineage_graph(
        self,
        dataset_id: str,
        direction: str = "both",
        max_depth: int = 5
    ) -> dict:
        """
        Get lineage graph for all fields in a dataset (table-level lineage).

        Args:
            dataset_id: Dataset identifier
            direction: Lineage direction ("upstream", "downstream", or "both")
            max_depth: Maximum traversal depth

        Returns:
            dict: Lineage graph with nodes and edges
                {"datasetId": ..., "graph": {"nodes": [...], "edges": [...]}}

        Raises:
            ValueError: If dataset not found or has no fields
        """
        # Look up dataset name and namespace
        dataset_info = self.dataset_repo.get_dataset_with_namespace(dataset_id)
        if not dataset_info:
            raise ValueError(f"Dataset not found: {dataset_id}")

        dataset_name = dataset_info["name"]
        namespace_uri = dataset_info["namespace_uri"]

        # Get all fields for this dataset
        fields = self.dataset_repo.get_dataset_fields(dataset_id)
        if not fields:
            raise ValueError(f"No fields found for dataset: {dataset_id}")

        nodes = {}
        edges = []

        # For each field, get its lineage
        for field_name in fields:
            # Add the field as a root node
            root_key = f"{dataset_name}.{field_name}"
            if root_key not in nodes:
                nodes[root_key] = self._build_node(
                    root_key, field_name, dataset_name, namespace_uri
                )

            # Get upstream lineage if requested
            if direction in ("upstream", "both"):
                upstream_records = self.lineage_repo.get_upstream_lineage(
                    dataset_name, field_name, max_depth
                )
                self._add_lineage_results(upstream_records, nodes, edges)

            # Get downstream lineage if requested
            if direction in ("downstream", "both"):
                downstream_records = self.lineage_repo.get_downstream_lineage(
                    dataset_name, field_name, max_depth
                )
                self._add_lineage_results(downstream_records, nodes, edges)

        return {
            "datasetId": dataset_id,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        }

    def get_database_lineage_graph(
        self,
        database_name: str,
        direction: str = "both",
        max_depth: int = 3
    ) -> dict:
        """
        Get column-level lineage graph for all tables/views in a database.

        Args:
            database_name: Database name
            direction: Lineage direction ("upstream", "downstream", or "both")
            max_depth: Maximum traversal depth

        Returns:
            dict: Lineage graph with nodes and edges
                {"databaseName": ..., "direction": ..., "maxDepth": ..., "graph": {"nodes": [...], "edges": [...]}}

        Raises:
            ValueError: If no tables found in database
        """
        nodes = {}
        edges = []

        # Get all datasets (tables/views) in this database
        search_pattern = f"{database_name}.%"

        # We need to query the dataset repository to get all datasets
        # Since we don't have a direct method for this, we'll use the connection
        # to query OL_DATASET directly (similar to how python_server.py does it)
        with self.dataset_repo.connection.cursor() as cur:
            cur.execute("""
                SELECT
                    d.dataset_id,
                    d."name",
                    d.source_type,
                    n.namespace_uri,
                    d.description
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE d."name" LIKE ?
                ORDER BY d."name"
            """, [search_pattern])

            datasets = []
            dataset_names = set()
            for row in cur.fetchall():
                dataset = {
                    "id": self.dataset_repo._strip(row[0]) if row[0] else "",
                    "name": self.dataset_repo._strip(row[1]) if row[1] else "",
                    "sourceType": self.dataset_repo._strip(row[2]) if row[2] else "TABLE",
                    "namespace": self.dataset_repo._strip(row[3]) if row[3] else "",
                    "description": self.dataset_repo._strip(row[4]) if row[4] else ""
                }
                datasets.append(dataset)
                dataset_names.add(dataset["name"])

            if not datasets:
                raise ValueError(f"No tables found in database '{database_name}'")

            # Create a mapping of dataset name to metadata for quick lookup
            dataset_metadata = {
                ds["name"]: {
                    "namespace": ds["namespace"],
                    "sourceType": ds["sourceType"]
                }
                for ds in datasets
            }

            # First, add ALL fields from ALL tables in the database as nodes
            for dataset in datasets:
                cur.execute("""
                    SELECT field_name, field_type, nullable
                    FROM OL_DATASET_FIELD
                    WHERE dataset_id = ?
                    ORDER BY ordinal_position
                """, [dataset["id"]])

                for field_row in cur.fetchall():
                    field_name = self.dataset_repo._strip(field_row[0]) if field_row[0] else ""
                    field_type = self.dataset_repo._strip(field_row[1]) if field_row[1] else None
                    nullable = self.dataset_repo._strip(field_row[2]) if field_row[2] else None
                    field_key = f"{dataset['name']}.{field_name}"

                    if field_key not in nodes:
                        nodes[field_key] = {
                            "id": field_key,
                            "type": "field",
                            "name": field_name,
                            "dataset": {
                                "name": dataset["name"],
                                "namespace": dataset["namespace"],
                                "sourceType": dataset["sourceType"]
                            },
                            "metadata": {
                                "columnType": field_type,
                                "nullable": nullable == 'Y'
                            }
                        }

        # Now get all column lineage for the database
        lineage_records = self.lineage_repo.get_database_lineage(
            list(dataset_names), max_depth
        )

        # Process lineage results - add external nodes and create edges
        for record in lineage_records:
            source_namespace = record["source_namespace"]
            source_dataset = record["source_dataset"]
            source_field = record["source_field"]
            target_namespace = record["target_namespace"]
            target_dataset = record["target_dataset"]
            target_field = record["target_field"]
            transformation_type = record["transformation_type"]

            source_key = f"{source_dataset}.{source_field}"
            target_key = f"{target_dataset}.{target_field}"

            # Add source node (if it's from an external dataset)
            if source_key not in nodes:
                source_meta = dataset_metadata.get(source_dataset)
                if not source_meta:
                    # External dataset - fetch metadata
                    source_meta = self.dataset_repo.get_dataset_metadata(source_dataset)
                    if not source_meta:
                        source_meta = {"namespace": source_namespace, "sourceType": "TABLE"}

                # Fetch field metadata
                field_meta = self.dataset_repo.get_field_metadata(source_dataset, source_field)
                field_type = field_meta["field_type"] if field_meta else None
                nullable = field_meta["nullable"] if field_meta else True

                nodes[source_key] = {
                    "id": source_key,
                    "type": "field",
                    "name": source_field,
                    "dataset": {
                        "name": source_dataset,
                        "namespace": source_meta["namespace"],
                        "sourceType": source_meta["sourceType"]
                    },
                    "metadata": {
                        "columnType": field_type,
                        "nullable": nullable
                    }
                }

            # Add target node (if it's from an external dataset)
            if target_key not in nodes:
                target_meta = dataset_metadata.get(target_dataset)
                if not target_meta:
                    # External dataset - fetch metadata
                    target_meta = self.dataset_repo.get_dataset_metadata(target_dataset)
                    if not target_meta:
                        target_meta = {"namespace": target_namespace, "sourceType": "TABLE"}

                # Fetch field metadata
                field_meta = self.dataset_repo.get_field_metadata(target_dataset, target_field)
                field_type = field_meta["field_type"] if field_meta else None
                nullable = field_meta["nullable"] if field_meta else True

                nodes[target_key] = {
                    "id": target_key,
                    "type": "field",
                    "name": target_field,
                    "dataset": {
                        "name": target_dataset,
                        "namespace": target_meta["namespace"],
                        "sourceType": target_meta["sourceType"]
                    },
                    "metadata": {
                        "columnType": field_type,
                        "nullable": nullable
                    }
                }

            # Add edge
            edge = self._build_edge(source_key, target_key, transformation_type)
            if not any(e["id"] == edge["id"] for e in edges):
                edges.append(edge)

        return {
            "databaseName": database_name,
            "direction": direction,
            "maxDepth": max_depth,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        }

    def _build_node(self, key: str, field_name: str, dataset_name: str, namespace: str) -> dict:
        """
        Build a node dictionary.

        Args:
            key: Node ID (dataset.field)
            field_name: Field name
            dataset_name: Dataset name
            namespace: Namespace URI

        Returns:
            dict: Node dictionary
        """
        return {
            "id": key,
            "type": "field",
            "name": field_name,
            "dataset": {
                "name": dataset_name,
                "namespace": namespace
            }
        }

    def _build_edge(self, source_key: str, target_key: str, transformation_type: str) -> dict:
        """
        Build an edge dictionary.

        Args:
            source_key: Source node ID
            target_key: Target node ID
            transformation_type: Transformation type

        Returns:
            dict: Edge dictionary
        """
        edge_id = f"{source_key}->{target_key}"
        return {
            "id": edge_id,
            "source": source_key,
            "target": target_key,
            "transformationType": transformation_type
        }

    def _add_lineage_results(self, records: list, nodes: dict, edges: list):
        """
        Process lineage records and add nodes/edges to the graph.

        This helper eliminates duplication between column and table lineage methods.

        Args:
            records: List of lineage records from repository
            nodes: Dict of nodes to update (in-place)
            edges: List of edges to update (in-place)
        """
        for record in records:
            source_key = f"{record['source_dataset']}.{record['source_field']}"
            target_key = f"{record['target_dataset']}.{record['target_field']}"

            # Add source node
            if source_key not in nodes:
                nodes[source_key] = self._build_node(
                    source_key,
                    record["source_field"],
                    record["source_dataset"],
                    record["source_namespace"]
                )

            # Add target node
            if target_key not in nodes:
                nodes[target_key] = self._build_node(
                    target_key,
                    record["target_field"],
                    record["target_dataset"],
                    record["target_namespace"]
                )

            # Add edge
            edge = self._build_edge(source_key, target_key, record["transformation_type"])
            if not any(e["id"] == edge["id"] for e in edges):
                edges.append(edge)
