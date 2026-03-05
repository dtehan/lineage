"""
Lineage Service

Orchestrates lineage graph building for column, table, and database level lineage.
Delegates to LineageRepository and DatasetRepository for data access.

Dual-path routing:
    When graph_engine.is_ready is True, column and table lineage requests use
    in-memory BFS traversal (graph_engine.traverse_upstream/downstream) for
    sub-100ms latency. When the graph is not ready (still warming up or failed),
    the existing recursive CTE path is used transparently.

    BFS results omit namespace fields, so _enrich_bfs_results() resolves them
    via dataset_repo.get_dataset_metadata() with per-request caching to avoid
    N+1 queries. Database-level lineage uses BFS for edges when the graph is
    warm, but always queries Teradata for dataset/field metadata so that
    isolated tables (no lineage edges) are included in the response.
"""

import time

from repositories.lineage_repository import LineageRepository
from repositories.dataset_repository import DatasetRepository
from exceptions import DatasetNotFoundError
from graph.engine import graph_engine
from middleware.timing import record_timing


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
        # Look up dataset name, namespace, and source type
        dataset_info = self.dataset_repo.get_dataset_with_namespace(dataset_id)
        if not dataset_info:
            raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

        dataset_name = dataset_info["name"]
        namespace_uri = dataset_info["namespace_uri"]
        source_type = dataset_info.get("source_type", "TABLE")

        # Pre-seed cache with root dataset to avoid redundant lookups
        source_type_cache = {dataset_name: source_type}

        nodes = {}
        edges = []

        # Determine traversal path once: BFS when graph is warm, CTE when not
        use_graph = graph_engine.is_ready

        # Get upstream lineage if requested
        if direction in ("upstream", "both"):
            if use_graph:
                t0 = time.perf_counter()
                bfs_edges = graph_engine.traverse_upstream(
                    f"{dataset_name}.{field_name}", max_depth
                )
                upstream_records = self._enrich_bfs_results(bfs_edges)
                record_timing("bfs_upstream", (time.perf_counter() - t0) * 1000)
            else:
                t0 = time.perf_counter()
                upstream_records = self.lineage_repo.get_upstream_lineage(
                    dataset_name, field_name, max_depth
                )
                record_timing("db_upstream", (time.perf_counter() - t0) * 1000)
            self._add_lineage_results(upstream_records, nodes, edges, source_type_cache)

        # Get downstream lineage if requested
        if direction in ("downstream", "both"):
            if use_graph:
                t0 = time.perf_counter()
                bfs_edges = graph_engine.traverse_downstream(
                    f"{dataset_name}.{field_name}", max_depth
                )
                downstream_records = self._enrich_bfs_results(bfs_edges)
                record_timing("bfs_downstream", (time.perf_counter() - t0) * 1000)
            else:
                t0 = time.perf_counter()
                downstream_records = self.lineage_repo.get_downstream_lineage(
                    dataset_name, field_name, max_depth
                )
                record_timing("db_downstream", (time.perf_counter() - t0) * 1000)
            self._add_lineage_results(downstream_records, nodes, edges, source_type_cache)

        # Add the root field node if not already present
        root_key = f"{dataset_name}.{field_name}"
        if root_key not in nodes:
            nodes[root_key] = self._build_node(
                root_key, field_name, dataset_name, namespace_uri, source_type
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
        # Look up dataset name, namespace, and source type
        dataset_info = self.dataset_repo.get_dataset_with_namespace(dataset_id)
        if not dataset_info:
            raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

        dataset_name = dataset_info["name"]
        namespace_uri = dataset_info["namespace_uri"]
        source_type = dataset_info.get("source_type", "TABLE")

        # Get all fields for this dataset
        fields = self.dataset_repo.get_dataset_fields(dataset_id)
        if not fields:
            # Dataset exists in catalog but has no fields populated — valid state, not an error.
            # Return a valid empty graph so the frontend can render the informational banner.
            return {
                "datasetId": dataset_id,
                "graph": {
                    "nodes": [],
                    "edges": []
                }
            }

        nodes = {}
        edges = []

        # Pre-seed cache with root dataset to avoid redundant lookups
        source_type_cache = {dataset_name: source_type}

        # Determine traversal path once for all fields: BFS when graph is warm, CTE when not
        use_graph = graph_engine.is_ready

        # For each field, get its lineage — time the entire loop as one aggregate metric
        t0_table = time.perf_counter()
        for field_name in fields:
            # Add the field as a root node
            root_key = f"{dataset_name}.{field_name}"
            if root_key not in nodes:
                nodes[root_key] = self._build_node(
                    root_key, field_name, dataset_name, namespace_uri, source_type
                )

            # Get upstream lineage if requested
            if direction in ("upstream", "both"):
                if use_graph:
                    bfs_edges = graph_engine.traverse_upstream(
                        f"{dataset_name}.{field_name}", max_depth
                    )
                    upstream_records = self._enrich_bfs_results(bfs_edges)
                else:
                    upstream_records = self.lineage_repo.get_upstream_lineage(
                        dataset_name, field_name, max_depth
                    )
                self._add_lineage_results(upstream_records, nodes, edges, source_type_cache)

            # Get downstream lineage if requested
            if direction in ("downstream", "both"):
                if use_graph:
                    bfs_edges = graph_engine.traverse_downstream(
                        f"{dataset_name}.{field_name}", max_depth
                    )
                    downstream_records = self._enrich_bfs_results(bfs_edges)
                else:
                    downstream_records = self.lineage_repo.get_downstream_lineage(
                        dataset_name, field_name, max_depth
                    )
                self._add_lineage_results(downstream_records, nodes, edges, source_type_cache)

        # Record aggregate timing for the entire field-loop (one metric regardless of field count)
        if use_graph:
            record_timing("bfs_total", (time.perf_counter() - t0_table) * 1000)
        else:
            record_timing("db_total", (time.perf_counter() - t0_table) * 1000)

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
        # BFS fast path: build entirely from in-memory graph (no Teradata queries)
        if graph_engine.is_ready:
            return self._get_database_lineage_bfs(database_name, direction, max_depth)

        # CTE fallback: query Teradata for datasets, fields, and lineage
        return self._get_database_lineage_cte(database_name, direction, max_depth)

    def _get_database_lineage_bfs(
        self,
        database_name: str,
        direction: str,
        max_depth: int
    ) -> dict:
        """Build database lineage graph from in-memory BFS + dataset metadata from Teradata.

        Phase 1 fetches all datasets/fields for the database so that isolated
        tables (no lineage edges) still appear as nodes — matching the CTE path.
        Phase 2 runs BFS for edges and adds any external nodes from outside the database.
        """
        # Phase 1: Fetch all datasets and fields for this database
        search_pattern = f"{database_name}.%"
        nodes = {}
        dataset_metadata = {}

        with self.dataset_repo.connection.cursor() as cur:
            cur.execute("""
                SELECT
                    d.dataset_id,
                    d."name",
                    d.source_type,
                    n.namespace_uri
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE d."name" LIKE ?
                ORDER BY d."name"
            """, [search_pattern])

            datasets = []
            for row in cur.fetchall():
                ds = {
                    "id": self.dataset_repo._strip(row[0]) if row[0] else "",
                    "name": self.dataset_repo._strip(row[1]) if row[1] else "",
                    "sourceType": self.dataset_repo._strip(row[2]) if row[2] else "TABLE",
                    "namespace": self.dataset_repo._strip(row[3]) if row[3] else "",
                }
                datasets.append(ds)
                dataset_metadata[ds["name"]] = {
                    "namespace": ds["namespace"],
                    "sourceType": ds["sourceType"]
                }

            if not datasets:
                raise DatasetNotFoundError(f"No tables found in database '{database_name}'")

            # Batch-fetch ALL fields in a single query
            dataset_ids = [ds["id"] for ds in datasets]
            id_to_dataset = {ds["id"]: ds for ds in datasets}
            field_placeholders = ",".join("?" * len(dataset_ids))
            cur.execute(f"""
                SELECT dataset_id, field_name, field_type, nullable
                FROM OL_DATASET_FIELD
                WHERE dataset_id IN ({field_placeholders})
                ORDER BY dataset_id, ordinal_position
            """, dataset_ids)

            for field_row in cur.fetchall():
                ds_id = self.dataset_repo._strip(field_row[0]) if field_row[0] else ""
                field_name = self.dataset_repo._strip(field_row[1]) if field_row[1] else ""
                field_type = self.dataset_repo._strip(field_row[2]) if field_row[2] else None
                nullable = self.dataset_repo._strip(field_row[3]) if field_row[3] else None
                dataset = id_to_dataset.get(ds_id)
                if not dataset:
                    continue
                field_key = f"{dataset['name']}.{field_name}"

                if field_key not in nodes:
                    nodes[field_key] = {
                        "id": field_key,
                        "type": "field",
                        "name": field_name,
                        "dataset": {
                            "name": dataset["name"],
                            "namespace": dataset["namespace"],
                            "sourceType": dataset["sourceType"],
                        },
                        "metadata": {
                            "columnType": field_type,
                            "nullable": nullable == 'Y'
                        }
                    }

        # Phase 2: BFS traversal for edges
        t0 = time.perf_counter()
        bfs_records = graph_engine.traverse_database(database_name)
        record_timing("bfs_db_lineage", (time.perf_counter() - t0) * 1000)

        edges = []
        external_field_keys = []  # list of (key, ds_name, field_name) for external nodes

        if bfs_records:
            # Collect external dataset names (outside this database) for metadata resolution
            external_dataset_names = set()
            for record in bfs_records:
                for ds_name in (record["source_dataset"], record["target_dataset"]):
                    if ds_name not in dataset_metadata:
                        external_dataset_names.add(ds_name)

            # Batch-resolve external dataset metadata
            if external_dataset_names:
                external_meta = self._batch_resolve_dataset_metadata(external_dataset_names)
                dataset_metadata.update(external_meta)
                # Also map original-case names to resolved metadata (lineage edges
                # may use UPPER case while OL_DATASET stores lowercase)
                for orig_name in external_dataset_names:
                    lower_match = external_meta.get(orig_name.lower())
                    if lower_match and orig_name not in dataset_metadata:
                        dataset_metadata[orig_name] = lower_match

            for record in bfs_records:
                source_dataset = record["source_dataset"]
                source_field = record["source_field"]
                target_dataset = record["target_dataset"]
                target_field = record["target_field"]
                transformation_type = record["transformation_type"]

                source_key = f"{source_dataset}.{source_field}"
                target_key = f"{target_dataset}.{target_field}"

                # Add external nodes not already present from Phase 1
                for key, ds_name, field_name in [
                    (source_key, source_dataset, source_field),
                    (target_key, target_dataset, target_field),
                ]:
                    if key not in nodes:
                        meta = dataset_metadata.get(ds_name, {})
                        nodes[key] = {
                            "id": key,
                            "type": "field",
                            "name": field_name,
                            "dataset": {
                                "name": ds_name,
                                "namespace": meta.get("namespace", ""),
                                "sourceType": meta.get("sourceType", "TABLE"),
                            },
                            "metadata": {
                                "columnType": None,
                                "nullable": None
                            }
                        }
                        external_field_keys.append((key, ds_name, field_name))

                edge = self._build_edge(source_key, target_key, transformation_type)
                edges.append(edge)

            # Batch-resolve column types for external nodes
            if external_field_keys:
                external_field_meta = self._batch_resolve_external_field_metadata(external_field_keys)
                for key, field_type, nullable in external_field_meta:
                    if key in nodes:
                        nodes[key]["metadata"]["columnType"] = field_type
                        nodes[key]["metadata"]["nullable"] = nullable

        return {
            "databaseName": database_name,
            "direction": direction,
            "maxDepth": max_depth,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        }

    def _batch_resolve_dataset_metadata(self, dataset_names: set) -> dict:
        """Resolve namespace and sourceType for multiple datasets in a single query."""
        if not dataset_names:
            return {}

        # Lowercase names for case-insensitive matching (lineage edges may use
        # UPPER case from view DDL while OL_DATASET stores lowercase)
        names_list = list({n.lower() for n in dataset_names})
        placeholders = ",".join("?" * len(names_list))

        with self.dataset_repo.connection.cursor() as cur:
            cur.execute(f"""
                SELECT TRIM(d."name"), d.source_type, n.namespace_uri
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE LOWER(TRIM(d."name")) IN ({placeholders})
            """, names_list)

            result = {}
            for row in cur.fetchall():
                name = self.dataset_repo._strip(row[0]) if row[0] else ""
                result[name] = {
                    "namespace": self.dataset_repo._strip(row[2]) if row[2] else "",
                    "sourceType": self.dataset_repo._strip(row[1]) if row[1] else "TABLE"
                }
            return result

    def _batch_resolve_external_field_metadata(self, field_keys: list) -> list:
        """Resolve field_type and nullable for external fields in a single batch query.

        Args:
            field_keys: list of (key, dataset_name, field_name) tuples

        Returns:
            list of (key, field_type, nullable_bool) tuples
        """
        if not field_keys:
            return []

        # Build lookup: (dataset_name_lower, field_name_lower) -> key
        lookup = {(ds_name.lower(), field_name.lower()): key for key, ds_name, field_name in field_keys}

        # Get unique dataset names (lowercased to match DB storage)
        dataset_names = list({ds_name.lower() for _, ds_name, _ in field_keys})
        ds_placeholders = ",".join("?" * len(dataset_names))

        results = []
        with self.dataset_repo.connection.cursor() as cur:
            cur.execute(f"""
                SELECT d.dataset_id, TRIM(d."name")
                FROM OL_DATASET d
                WHERE TRIM(d."name") IN ({ds_placeholders})
            """, dataset_names)

            dataset_id_map = {}  # dataset_name -> dataset_id
            for row in cur.fetchall():
                ds_id = self.dataset_repo._strip(row[0]) if row[0] else ""
                ds_name = self.dataset_repo._strip(row[1]) if row[1] else ""
                dataset_id_map[ds_name] = ds_id

            if not dataset_id_map:
                return []

            dataset_ids = list(dataset_id_map.values())
            field_placeholders = ",".join("?" * len(dataset_ids))
            cur.execute(f"""
                SELECT d."name", f.field_name, f.field_type, f.nullable
                FROM OL_DATASET_FIELD f
                JOIN OL_DATASET d ON f.dataset_id = d.dataset_id
                WHERE f.dataset_id IN ({field_placeholders})
            """, dataset_ids)

            for row in cur.fetchall():
                ds_name = self.dataset_repo._strip(row[0]) if row[0] else ""
                field_name = self.dataset_repo._strip(row[1]) if row[1] else ""
                field_type = self.dataset_repo._strip(row[2]) if row[2] else None
                nullable_raw = self.dataset_repo._strip(row[3]) if row[3] else None
                nullable = nullable_raw == 'Y' if nullable_raw else None

                key = lookup.get((ds_name.lower(), field_name.lower()))
                if key:
                    results.append((key, field_type, nullable))

        return results

    def _get_database_lineage_cte(
        self,
        database_name: str,
        direction: str,
        max_depth: int
    ) -> dict:
        """Build database lineage graph via Teradata CTE queries (fallback path)."""
        nodes = {}
        edges = []

        search_pattern = f"{database_name}.%"

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
                raise DatasetNotFoundError(f"No tables found in database '{database_name}'")

            dataset_metadata = {
                ds["name"]: {
                    "namespace": ds["namespace"],
                    "sourceType": ds["sourceType"]
                }
                for ds in datasets
            }

            # Batch-fetch ALL fields in a single query
            dataset_ids = [ds["id"] for ds in datasets]
            id_to_dataset = {ds["id"]: ds for ds in datasets}
            field_placeholders = ",".join("?" * len(dataset_ids))
            cur.execute(f"""
                SELECT dataset_id, field_name, field_type, nullable
                FROM OL_DATASET_FIELD
                WHERE dataset_id IN ({field_placeholders})
                ORDER BY dataset_id, ordinal_position
            """, dataset_ids)

            for field_row in cur.fetchall():
                ds_id = self.dataset_repo._strip(field_row[0]) if field_row[0] else ""
                field_name = self.dataset_repo._strip(field_row[1]) if field_row[1] else ""
                field_type = self.dataset_repo._strip(field_row[2]) if field_row[2] else None
                nullable = self.dataset_repo._strip(field_row[3]) if field_row[3] else None
                dataset = id_to_dataset.get(ds_id)
                if not dataset:
                    continue
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

        # Get lineage via CTE
        t0 = time.perf_counter()
        lineage_records = self.lineage_repo.get_database_lineage(
            list(dataset_names), max_depth
        )
        record_timing("db_lineage", (time.perf_counter() - t0) * 1000)

        for record in lineage_records:
            source_namespace = record.get("source_namespace", "")
            source_dataset = record["source_dataset"]
            source_field = record["source_field"]
            target_namespace = record.get("target_namespace", "")
            target_dataset = record["target_dataset"]
            target_field = record["target_field"]
            transformation_type = record["transformation_type"]

            source_key = f"{source_dataset}.{source_field}"
            target_key = f"{target_dataset}.{target_field}"

            if source_key not in nodes:
                source_meta = dataset_metadata.get(source_dataset)
                if not source_meta:
                    source_meta = self.dataset_repo.get_dataset_metadata(source_dataset)
                    if not source_meta:
                        source_meta = {"namespace": source_namespace, "sourceType": "TABLE"}
                field_meta = self.dataset_repo.get_field_metadata(source_dataset, source_field)
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
                        "columnType": field_meta["field_type"] if field_meta else None,
                        "nullable": field_meta["nullable"] if field_meta else True
                    }
                }

            if target_key not in nodes:
                target_meta = dataset_metadata.get(target_dataset)
                if not target_meta:
                    target_meta = self.dataset_repo.get_dataset_metadata(target_dataset)
                    if not target_meta:
                        target_meta = {"namespace": target_namespace, "sourceType": "TABLE"}
                field_meta = self.dataset_repo.get_field_metadata(target_dataset, target_field)
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
                        "columnType": field_meta["field_type"] if field_meta else None,
                        "nullable": field_meta["nullable"] if field_meta else True
                    }
                }

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

    def _resolve_namespace(self, dataset_name: str, namespace_cache: dict) -> str:
        """
        Resolve the namespace URI for a dataset, using a per-request cache.

        The cache avoids repeated dataset_repo lookups for the same dataset
        across multiple edges in a single BFS result set — most edges share
        a small number of distinct datasets.

        Args:
            dataset_name: Fully qualified dataset name (e.g. "demo_user.orders").
            namespace_cache: Dict mapping dataset name -> namespace URI string.

        Returns:
            str: Namespace URI, or "" if the dataset is not found.
        """
        if dataset_name in namespace_cache:
            return namespace_cache[dataset_name]

        meta = self.dataset_repo.get_dataset_metadata(dataset_name)
        namespace = meta["namespace"] if meta else ""
        namespace_cache[dataset_name] = namespace
        return namespace

    def _enrich_bfs_results(self, bfs_edges: list[dict]) -> list[dict]:
        """
        Add source_namespace and target_namespace to BFS edge dicts.

        BFS results from GraphEngine omit namespace fields because the
        in-memory graph stores only dataset+field node IDs. This method
        resolves namespaces from dataset_repo so BFS results match the
        CTE result format expected by _add_lineage_results().

        Args:
            bfs_edges: List of edge dicts from traverse_upstream/downstream.
                       Each dict has source_dataset, source_field,
                       target_dataset, target_field, transformation_type.

        Returns:
            list[dict]: Same dicts with source_namespace and target_namespace
                        added in-place. The input list is mutated and returned.
        """
        namespace_cache: dict = {}
        for edge in bfs_edges:
            edge["source_namespace"] = self._resolve_namespace(
                edge["source_dataset"], namespace_cache
            )
            edge["target_namespace"] = self._resolve_namespace(
                edge["target_dataset"], namespace_cache
            )
        return bfs_edges

    def _build_node(self, key: str, field_name: str, dataset_name: str, namespace: str, source_type: str = "TABLE") -> dict:
        """
        Build a node dictionary.

        Args:
            key: Node ID (dataset.field)
            field_name: Field name
            dataset_name: Dataset name
            namespace: Namespace URI
            source_type: Dataset source type ("TABLE" or "VIEW"), defaults to "TABLE"

        Returns:
            dict: Node dictionary
        """
        return {
            "id": key,
            "type": "field",
            "name": field_name,
            "dataset": {
                "name": dataset_name,
                "namespace": namespace,
                "sourceType": source_type
            }
        }

    def _get_source_type(self, dataset_name: str, cache: dict) -> str:
        """
        Get the source type for a dataset, using a cache to avoid repeated lookups.

        Args:
            dataset_name: Fully qualified dataset name
            cache: Dict mapping dataset name to source type string

        Returns:
            str: "VIEW" or "TABLE" (defaults to "TABLE" if not found)
        """
        if dataset_name not in cache:
            meta = self.dataset_repo.get_dataset_metadata(dataset_name)
            cache[dataset_name] = meta["sourceType"] if meta else "TABLE"
        return cache[dataset_name]

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

    def _add_lineage_results(self, records: list, nodes: dict, edges: list, source_type_cache: dict = None):
        """
        Process lineage records and add nodes/edges to the graph.

        This helper eliminates duplication between column and table lineage methods.

        Args:
            records: List of lineage records from repository
            nodes: Dict of nodes to update (in-place)
            edges: List of edges to update (in-place)
            source_type_cache: Dict mapping dataset name to source type (optional).
                               If None, a new empty cache is created. Pre-seeding
                               this cache avoids redundant lookups for the root dataset.
        """
        if source_type_cache is None:
            source_type_cache = {}

        for record in records:
            source_key = f"{record['source_dataset']}.{record['source_field']}"
            target_key = f"{record['target_dataset']}.{record['target_field']}"

            # Add source node
            if source_key not in nodes:
                source_type = self._get_source_type(record["source_dataset"], source_type_cache)
                nodes[source_key] = self._build_node(
                    source_key,
                    record["source_field"],
                    record["source_dataset"],
                    record["source_namespace"],
                    source_type
                )

            # Add target node
            if target_key not in nodes:
                target_type = self._get_source_type(record["target_dataset"], source_type_cache)
                nodes[target_key] = self._build_node(
                    target_key,
                    record["target_field"],
                    record["target_dataset"],
                    record["target_namespace"],
                    target_type
                )

            # Add edge
            edge = self._build_edge(source_key, target_key, record["transformation_type"])
            if not any(e["id"] == edge["id"] for e in edges):
                edges.append(edge)
