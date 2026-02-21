"""
GraphLoader

Encapsulates the single SQL query that loads all active column lineage
rows from OL_COLUMN_LINEAGE into a networkx DiGraph.

Node IDs use the format "dataset_name.field_name" where dataset_name is
already fully qualified (e.g. "demo_user.customer"), producing full IDs
like "demo_user.customer.customer_id". This matches the key format used
by LineageService._build_node(). The GraphEngine (Plan 14-02) can recover
(dataset, field) via rsplit(".", 1).

All string fields are stripped of whitespace to handle Teradata CHAR
column padding.
"""

import networkx as nx
from loguru import logger


class GraphLoader:
    """
    Loads OL_COLUMN_LINEAGE into a networkx DiGraph.

    Intended to be used once per reload cycle. Pass the result to
    GraphStore.build() to create an immutable snapshot.
    """

    def __init__(self, connection):
        """
        Initialise with an open Teradata connection.

        Args:
            connection: A teradatasql connection object (or any DBAPI-2
                        compatible connection that supports cursor()).
        """
        self.connection = connection

    def load(self) -> nx.DiGraph:
        """
        Query OL_COLUMN_LINEAGE and build a DiGraph.

        Executes a single bulk SELECT with LOCKING ROW FOR ACCESS to
        avoid acquiring row-level locks on the lineage table. Iterates
        all active rows and adds a directed edge for each
        (source_dataset.source_field -> target_dataset.target_field)
        pair. networkx deduplicates nodes automatically.

        Edge attributes:
            transformation_type (str): Value from OL_COLUMN_LINEAGE,
                defaults to "DIRECT" if NULL.

        Returns:
            nx.DiGraph: Populated directed graph. Nodes are
                        "dataset_name.field_name" strings. Edges carry
                        transformation_type as an attribute.
        """
        G = nx.DiGraph()

        with self.connection.cursor() as cur:
            cur.execute("""
                LOCKING ROW FOR ACCESS
                SELECT
                    source_dataset,
                    source_field,
                    target_dataset,
                    target_field,
                    transformation_type
                FROM OL_COLUMN_LINEAGE
                WHERE is_active = 'Y'
            """)

            rows = cur.fetchall()

        for row in rows:
            source_dataset = row[0].strip() if row[0] else ""
            source_field = row[1].strip() if row[1] else ""
            target_dataset = row[2].strip() if row[2] else ""
            target_field = row[3].strip() if row[3] else ""
            transformation_type = (row[4] or "DIRECT").strip()

            src_id = f"{source_dataset}.{source_field}"
            tgt_id = f"{target_dataset}.{target_field}"

            G.add_edge(src_id, tgt_id, transformation_type=transformation_type)

        logger.info(
            "GraphLoader: loaded graph",
            nodes=G.number_of_nodes(),
            edges=G.number_of_edges(),
        )

        return G
