"""
Lineage Repository

Provides data access methods for lineage graph traversal using
recursive CTEs on OL_COLUMN_LINEAGE table.
"""

from repositories.base import BaseRepository


class LineageRepository(BaseRepository):
    """
    Repository for lineage graph operations.

    Handles upstream, downstream, and database-level lineage queries
    using recursive CTEs with cycle detection.
    """

    def get_upstream_lineage(self, dataset_name: str, field_name: str, max_depth: int = 5):
        """
        Get upstream lineage for a column (sources that flow into this column).

        Traverses the lineage graph backwards from target to sources using
        a recursive CTE. Includes cycle detection via path tracking.

        Args:
            dataset_name: Fully qualified dataset name (e.g., "demo_user.customer")
            field_name: Column name
            max_depth: Maximum traversal depth (default: 5)

        Returns:
            list[dict]: List of lineage edges with keys:
                - source_namespace: Source column namespace
                - source_dataset: Source dataset name
                - source_field: Source column name
                - target_namespace: Target column namespace
                - target_dataset: Target dataset name
                - target_field: Target column name
                - transformation_type: Transformation type (e.g., DIRECT, TRANSFORMATION)
                - depth: Traversal depth from starting column
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                LOCKING ROW FOR ACCESS
                WITH RECURSIVE upstream_lineage AS (
                    SELECT
                        source_namespace,
                        source_dataset,
                        source_field,
                        target_namespace,
                        target_dataset,
                        target_field,
                        transformation_type,
                        1 as depth,
                        CAST(target_dataset || '.' || target_field || '->' || source_dataset || '.' || source_field AS VARCHAR(500)) as path
                    FROM OL_COLUMN_LINEAGE
                    WHERE TRIM(target_dataset) = TRIM(?)
                      AND UPPER(TRIM(target_field)) = UPPER(TRIM(?))
                      AND is_active = 'Y'

                    UNION ALL

                    SELECT
                        cl.source_namespace,
                        cl.source_dataset,
                        cl.source_field,
                        cl.target_namespace,
                        cl.target_dataset,
                        cl.target_field,
                        cl.transformation_type,
                        ul.depth + 1,
                        ul.path || '->' || cl.source_dataset || '.' || cl.source_field
                    FROM OL_COLUMN_LINEAGE cl
                    INNER JOIN upstream_lineage ul
                        ON TRIM(cl.target_dataset) = TRIM(ul.source_dataset)
                        AND TRIM(cl.target_field) = TRIM(ul.source_field)
                    WHERE cl.is_active = 'Y'
                      AND ul.depth < ?
                      AND POSITION(cl.source_dataset || '.' || cl.source_field IN ul.path) = 0
                )
                SELECT DISTINCT
                    source_namespace,
                    source_dataset,
                    source_field,
                    target_namespace,
                    target_dataset,
                    target_field,
                    transformation_type,
                    depth
                FROM upstream_lineage
            """, [dataset_name, field_name, max_depth])

            rows = cur.fetchall()
            return [
                {
                    "source_namespace": self._strip(row[0]) if row[0] else "",
                    "source_dataset": self._strip(row[1]) if row[1] else "",
                    "source_field": self._strip(row[2]) if row[2] else "",
                    "target_namespace": self._strip(row[3]) if row[3] else "",
                    "target_dataset": self._strip(row[4]) if row[4] else "",
                    "target_field": self._strip(row[5]) if row[5] else "",
                    "transformation_type": self._strip(row[6]) if row[6] else "DIRECT",
                    "depth": row[7] if row[7] is not None else 1
                }
                for row in rows
            ]

    def get_downstream_lineage(self, dataset_name: str, field_name: str, max_depth: int = 5):
        """
        Get downstream lineage for a column (targets that this column flows into).

        Traverses the lineage graph forwards from source to targets using
        a recursive CTE. Includes cycle detection via path tracking.

        Args:
            dataset_name: Fully qualified dataset name (e.g., "demo_user.customer")
            field_name: Column name
            max_depth: Maximum traversal depth (default: 5)

        Returns:
            list[dict]: List of lineage edges with keys:
                - source_namespace: Source column namespace
                - source_dataset: Source dataset name
                - source_field: Source column name
                - target_namespace: Target column namespace
                - target_dataset: Target dataset name
                - target_field: Target column name
                - transformation_type: Transformation type (e.g., DIRECT, TRANSFORMATION)
                - depth: Traversal depth from starting column
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                LOCKING ROW FOR ACCESS
                WITH RECURSIVE downstream_lineage AS (
                    SELECT
                        source_namespace,
                        source_dataset,
                        source_field,
                        target_namespace,
                        target_dataset,
                        target_field,
                        transformation_type,
                        1 as depth,
                        CAST(source_dataset || '.' || source_field || '->' || target_dataset || '.' || target_field AS VARCHAR(500)) as path
                    FROM OL_COLUMN_LINEAGE
                    WHERE TRIM(source_dataset) = TRIM(?)
                      AND UPPER(TRIM(source_field)) = UPPER(TRIM(?))
                      AND is_active = 'Y'

                    UNION ALL

                    SELECT
                        cl.source_namespace,
                        cl.source_dataset,
                        cl.source_field,
                        cl.target_namespace,
                        cl.target_dataset,
                        cl.target_field,
                        cl.transformation_type,
                        dl.depth + 1,
                        dl.path || '->' || cl.target_dataset || '.' || cl.target_field
                    FROM OL_COLUMN_LINEAGE cl
                    INNER JOIN downstream_lineage dl
                        ON TRIM(cl.source_dataset) = TRIM(dl.target_dataset)
                        AND TRIM(cl.source_field) = TRIM(dl.target_field)
                    WHERE cl.is_active = 'Y'
                      AND dl.depth < ?
                      AND POSITION(cl.target_dataset || '.' || cl.target_field IN dl.path) = 0
                )
                SELECT DISTINCT
                    source_namespace,
                    source_dataset,
                    source_field,
                    target_namespace,
                    target_dataset,
                    target_field,
                    transformation_type,
                    depth
                FROM downstream_lineage
            """, [dataset_name, field_name, max_depth])

            rows = cur.fetchall()
            return [
                {
                    "source_namespace": self._strip(row[0]) if row[0] else "",
                    "source_dataset": self._strip(row[1]) if row[1] else "",
                    "source_field": self._strip(row[2]) if row[2] else "",
                    "target_namespace": self._strip(row[3]) if row[3] else "",
                    "target_dataset": self._strip(row[4]) if row[4] else "",
                    "target_field": self._strip(row[5]) if row[5] else "",
                    "transformation_type": self._strip(row[6]) if row[6] else "DIRECT",
                    "depth": row[7] if row[7] is not None else 1
                }
                for row in rows
            ]

    def get_database_lineage(self, dataset_names, max_depth: int = 3):
        """
        Get lineage graph for multiple datasets (typically all datasets in a database).

        Traverses lineage bidirectionally from the given datasets using a recursive CTE.
        Includes cycle detection via path tracking.

        Args:
            dataset_names: List of fully qualified dataset names
            max_depth: Maximum traversal depth (default: 3)

        Returns:
            list[dict]: List of lineage edges with keys:
                - source_namespace: Source column namespace
                - source_dataset: Source dataset name
                - source_field: Source column name
                - target_namespace: Target column namespace
                - target_dataset: Target dataset name
                - target_field: Target column name
                - transformation_type: Transformation type (e.g., DIRECT, TRANSFORMATION)
                - depth: Traversal depth from starting datasets
        """
        if not dataset_names:
            return []

        placeholders = ",".join("?" * len(dataset_names))
        dataset_list = list(dataset_names)

        lineage_query = f"""
            LOCKING ROW FOR ACCESS
            WITH RECURSIVE lineage_cte AS (
                -- Base case: direct lineage involving database tables
                SELECT
                    cl.source_namespace,
                    cl.source_dataset,
                    cl.source_field,
                    cl.target_namespace,
                    cl.target_dataset,
                    cl.target_field,
                    cl.transformation_type,
                    1 as depth,
                    CAST(cl.source_dataset || '.' || cl.source_field || '->' ||
                         cl.target_dataset || '.' || cl.target_field AS VARCHAR(500)) as path
                FROM OL_COLUMN_LINEAGE cl
                WHERE cl.is_active = 'Y'
                  AND (TRIM(cl.source_dataset) IN ({placeholders})
                       OR TRIM(cl.target_dataset) IN ({placeholders}))

                UNION ALL

                -- Recursive case: traverse lineage up to max_depth
                SELECT
                    cl.source_namespace,
                    cl.source_dataset,
                    cl.source_field,
                    cl.target_namespace,
                    cl.target_dataset,
                    cl.target_field,
                    cl.transformation_type,
                    lc.depth + 1,
                    lc.path || '->' || cl.target_dataset || '.' || cl.target_field
                FROM OL_COLUMN_LINEAGE cl
                INNER JOIN lineage_cte lc
                    ON (TRIM(cl.source_dataset) = TRIM(lc.target_dataset) AND TRIM(cl.source_field) = TRIM(lc.target_field))
                       OR (TRIM(cl.target_dataset) = TRIM(lc.source_dataset) AND TRIM(cl.target_field) = TRIM(lc.source_field))
                WHERE cl.is_active = 'Y'
                  AND lc.depth < ?
                  AND POSITION(cl.source_dataset || '.' || cl.source_field IN lc.path) = 0
                  AND POSITION(cl.target_dataset || '.' || cl.target_field IN lc.path) = 0
            )
            SELECT DISTINCT
                source_namespace,
                source_dataset,
                source_field,
                target_namespace,
                target_dataset,
                target_field,
                transformation_type,
                depth
            FROM lineage_cte
        """

        with self.connection.cursor() as cur:
            # Execute with dataset names repeated for placeholders
            params = dataset_list + dataset_list + [max_depth]
            cur.execute(lineage_query, params)

            rows = cur.fetchall()
            return [
                {
                    "source_namespace": self._strip(row[0]) if row[0] else "",
                    "source_dataset": self._strip(row[1]) if row[1] else "",
                    "source_field": self._strip(row[2]) if row[2] else "",
                    "target_namespace": self._strip(row[3]) if row[3] else "",
                    "target_dataset": self._strip(row[4]) if row[4] else "",
                    "target_field": self._strip(row[5]) if row[5] else "",
                    "transformation_type": self._strip(row[6]) if row[6] else "DIRECT",
                    "depth": row[7] if row[7] is not None else 1
                }
                for row in rows
            ]
