"""
Dataset Repository

Provides data access methods for datasets, fields, namespaces,
search, statistics, and DDL operations.
"""

from repositories.base import BaseRepository


class DatasetRepository(BaseRepository):
    """
    Repository for dataset and namespace operations.

    Handles queries against OL_DATASET, OL_DATASET_FIELD, OL_NAMESPACE
    tables as well as DBC views for statistics and DDL.
    """

    def get_namespace(self, namespace_id: str):
        """
        Get a specific namespace by ID.

        Args:
            namespace_id: Namespace identifier

        Returns:
            dict or None: Namespace data with keys: id, uri, description,
                         specVersion, createdAt. None if not found.
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT
                    namespace_id,
                    namespace_uri,
                    description,
                    spec_version,
                    created_at
                FROM OL_NAMESPACE
                WHERE namespace_id = ?
            """, [namespace_id])
            row = cur.fetchone()
            if not row:
                return None

            return {
                "id": self._strip(row[0]) if row[0] else "",
                "uri": self._strip(row[1]) if row[1] else "",
                "description": self._strip(row[2]) if row[2] else "",
                "specVersion": self._strip(row[3]) if row[3] else "2-0-2",
                "createdAt": self._isoformat(row[4])
            }

    def list_namespaces(self):
        """
        List all namespaces.

        Returns:
            list[dict]: List of namespaces with keys: id, uri, description,
                       specVersion, createdAt
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT
                    namespace_id,
                    namespace_uri,
                    description,
                    spec_version,
                    created_at
                FROM OL_NAMESPACE
                ORDER BY namespace_uri
            """)
            rows = cur.fetchall()
            return [
                {
                    "id": self._strip(row[0]) if row[0] else "",
                    "uri": self._strip(row[1]) if row[1] else "",
                    "description": self._strip(row[2]) if row[2] else "",
                    "specVersion": self._strip(row[3]) if row[3] else "2-0-2",
                    "createdAt": self._isoformat(row[4])
                }
                for row in rows
            ]

    def list_databases(self, namespace_id: str):
        """List distinct database names with table/view counts from OL_DATASET."""
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT
                    TRIM(STRTOK(d."name", '.', 1)) AS database_name,
                    SUM(CASE WHEN d.source_type = 'TABLE' THEN 1 ELSE 0 END) AS table_count,
                    SUM(CASE WHEN d.source_type = 'VIEW' THEN 1 ELSE 0 END) AS view_count,
                    COUNT(*) AS total_count
                FROM OL_DATASET d
                WHERE d.namespace_id = ?
                GROUP BY 1
                ORDER BY 1
            """, [namespace_id])
            rows = cur.fetchall()
            return [
                {
                    "name": self._strip(row[0]) if row[0] else "",
                    "tableCount": int(row[1]) if row[1] else 0,
                    "viewCount": int(row[2]) if row[2] else 0,
                    "totalCount": int(row[3]) if row[3] else 0,
                }
                for row in rows
            ]

    def get_dataset(self, dataset_id: str):
        """
        Get a specific dataset with its fields.

        Args:
            dataset_id: Dataset identifier

        Returns:
            dict or None: Dataset data with keys: id, name, namespace,
                         description, sourceType, createdAt, updatedAt, fields.
                         None if not found.
        """
        with self.connection.cursor() as cur:
            # Get dataset
            cur.execute("""
                SELECT
                    d.dataset_id,
                    d."name",
                    d.namespace_id,
                    n.namespace_uri,
                    d.description,
                    d.source_type,
                    d.created_at,
                    d.updated_at
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE d.dataset_id = ?
            """, [dataset_id])

            row = cur.fetchone()
            if not row:
                return None

            dataset = {
                "id": self._strip(row[0]) if row[0] else "",
                "name": self._strip(row[1]) if row[1] else "",
                "namespace": self._strip(row[3]) if row[3] else "",  # namespace_uri
                "description": self._strip(row[4]) if row[4] else "",
                "sourceType": self._strip(row[5]) if row[5] else None,
                "createdAt": self._isoformat(row[6]),
                "updatedAt": self._isoformat(row[7])
            }

            # Get fields
            cur.execute("""
                SELECT
                    field_id,
                    field_name,
                    field_type,
                    field_description,
                    ordinal_position,
                    nullable
                FROM OL_DATASET_FIELD
                WHERE dataset_id = ?
                ORDER BY ordinal_position, field_name
            """, [dataset_id])

            fields = [
                {
                    "id": self._strip(row[0]) if row[0] else "",
                    "name": self._strip(row[1]) if row[1] else "",
                    "type": self._strip(row[2]) if row[2] else None,
                    "description": self._strip(row[3]) if row[3] else None,
                    "ordinalPosition": row[4] if row[4] is not None else 0,
                    "nullable": row[5] == 'Y' if row[5] else True
                }
                for row in cur.fetchall()
            ]

            dataset["fields"] = fields

        return dataset

    def list_datasets(self, namespace_id: str, limit: int = 100, offset: int = 0, database_filter: str = None):
        """
        List datasets in a namespace with pagination.

        Args:
            namespace_id: Namespace identifier
            limit: Maximum number of datasets to return
            offset: Number of datasets to skip
            database_filter: Optional database name to filter by (matches datasets
                             whose name starts with "{database_filter}.")

        Returns:
            tuple: (datasets list, total count)
                datasets: List of dicts with keys: id, name, namespace,
                         description, sourceType, createdAt, updatedAt
                total: Total number of datasets in namespace
        """
        extra_where = ""
        extra_params = []
        if database_filter:
            extra_where = ' AND d."name" LIKE ?'
            extra_params = [f"{database_filter}.%"]

        with self.connection.cursor() as cur:
            # Get total count
            if database_filter:
                cur.execute("""
                    SELECT COUNT(*)
                    FROM OL_DATASET d
                    WHERE d.namespace_id = ?
                      AND d."name" LIKE ?
                """, [namespace_id, f"{database_filter}.%"])
            else:
                cur.execute("""
                    SELECT COUNT(*)
                    FROM OL_DATASET
                    WHERE namespace_id = ?
                """, [namespace_id])
            total = cur.fetchone()[0] or 0

            # Get datasets with pagination using ROW_NUMBER (Teradata native)
            cur.execute(f"""
                SELECT dataset_id, dataset_name, namespace_id, namespace_uri,
                       description, source_type, created_at, updated_at
                FROM (
                    SELECT
                        d.dataset_id,
                        d."name" as dataset_name,
                        d.namespace_id,
                        n.namespace_uri,
                        d.description,
                        d.source_type,
                        d.created_at,
                        d.updated_at,
                        ROW_NUMBER() OVER (ORDER BY d."name") as rn
                    FROM OL_DATASET d
                    JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                    WHERE d.namespace_id = ?{extra_where}
                ) t
                WHERE rn > ? AND rn <= ?
            """, [namespace_id] + extra_params + [offset, offset + limit])

            rows = cur.fetchall()
            datasets = [
                {
                    "id": self._strip(row[0]) if row[0] else "",
                    "name": self._strip(row[1]) if row[1] else "",
                    "namespace": self._strip(row[3]) if row[3] else "",  # namespace_uri
                    "description": self._strip(row[4]) if row[4] else "",
                    "sourceType": self._strip(row[5]) if row[5] else None,
                    "createdAt": self._isoformat(row[6]),
                    "updatedAt": self._isoformat(row[7])
                }
                for row in rows
            ]

        return datasets, total

    def search_datasets(self, query: str, limit: int = 50):
        """
        Search for datasets by name or description.

        Args:
            query: Search query string
            limit: Maximum number of results

        Returns:
            list[dict]: List of matching datasets with keys: id, name,
                       namespace, description, sourceType, createdAt, updatedAt
        """
        search_pattern = f"%{query}%"

        with self.connection.cursor() as cur:
            cur.execute(f"""
                SELECT TOP {limit}
                    d.dataset_id,
                    d."name",
                    d.namespace_id,
                    n.namespace_uri,
                    d.description,
                    d.source_type,
                    d.created_at,
                    d.updated_at
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE d."name" LIKE ?
                   OR d.description LIKE ?
                ORDER BY d."name"
            """, [search_pattern, search_pattern])

            rows = cur.fetchall()
            return [
                {
                    "id": self._strip(row[0]) if row[0] else "",
                    "name": self._strip(row[1]) if row[1] else "",
                    "namespace": self._strip(row[3]) if row[3] else "",  # namespace_uri
                    "description": self._strip(row[4]) if row[4] else "",
                    "sourceType": self._strip(row[5]) if row[5] else None,
                    "createdAt": self._isoformat(row[6]),
                    "updatedAt": self._isoformat(row[7])
                }
                for row in rows
            ]

    def unified_search(self, query: str, limit: int = 50):
        """
        Unified search across databases, datasets, and columns.

        Searches OL_DATASET names/descriptions and OL_DATASET_FIELD names.
        Extracts unique databases from all matched dataset names.

        Args:
            query: Search query string
            limit: Maximum number of results per category

        Returns:
            dict: Contains databases, datasets, and columns lists
        """
        search_pattern = f"%{query}%"

        with self.connection.cursor() as cur:
            # Search datasets by name/description
            cur.execute(f"""
                SELECT TOP {limit}
                    d.dataset_id,
                    d."name",
                    d.namespace_id,
                    n.namespace_uri,
                    d.description,
                    d.source_type,
                    d.created_at,
                    d.updated_at
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE d."name" LIKE ?
                   OR d.description LIKE ?
                ORDER BY d."name"
            """, [search_pattern, search_pattern])

            dataset_rows = cur.fetchall()
            datasets = [
                {
                    "id": self._strip(row[0]) if row[0] else "",
                    "name": self._strip(row[1]) if row[1] else "",
                    "namespace": self._strip(row[3]) if row[3] else "",
                    "description": self._strip(row[4]) if row[4] else "",
                    "sourceType": self._strip(row[5]) if row[5] else None,
                    "createdAt": self._isoformat(row[6]),
                    "updatedAt": self._isoformat(row[7])
                }
                for row in dataset_rows
            ]

            # Search columns by field name
            cur.execute(f"""
                SELECT TOP {limit}
                    f.field_id,
                    f.field_name,
                    f.field_type,
                    f.dataset_id,
                    d."name" AS dataset_name,
                    d.namespace_id,
                    n.namespace_uri
                FROM OL_DATASET_FIELD f
                JOIN OL_DATASET d ON f.dataset_id = d.dataset_id
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE f.field_name LIKE ?
                ORDER BY d."name", f.field_name
            """, [search_pattern])

            column_rows = cur.fetchall()
            columns = [
                {
                    "fieldId": self._strip(row[0]) if row[0] else "",
                    "fieldName": self._strip(row[1]) if row[1] else "",
                    "fieldType": self._strip(row[2]) if row[2] else None,
                    "datasetId": self._strip(row[3]) if row[3] else "",
                    "datasetName": self._strip(row[4]) if row[4] else "",
                    "namespace": self._strip(row[6]) if row[6] else ""
                }
                for row in column_rows
            ]

            # Extract unique databases from ALL matched results
            databases_dict = {}
            all_dataset_names = (
                [d["name"] for d in datasets]
                + [c["datasetName"] for c in columns]
            )
            for name in all_dataset_names:
                parts = name.split(".")
                if len(parts) > 1:
                    db_name = parts[0]
                    if query.lower() in db_name.lower():
                        if db_name not in databases_dict:
                            databases_dict[db_name] = {
                                "name": db_name,
                                "namespace": "",
                                "tableCount": 0
                            }
                        databases_dict[db_name]["tableCount"] += 1

            # Fill namespace from datasets if available
            for dataset in datasets:
                parts = dataset["name"].split(".")
                if len(parts) > 1:
                    db_name = parts[0]
                    if db_name in databases_dict and not databases_dict[db_name]["namespace"]:
                        databases_dict[db_name]["namespace"] = dataset["namespace"]

            databases = list(databases_dict.values())
            databases.sort(key=lambda x: x["name"])

        return {
            "databases": databases,
            "datasets": datasets,
            "columns": columns
        }

    def get_dataset_statistics(self, dataset_id: str):
        """
        Get statistics for a dataset (table/view) from DBC views.

        Args:
            dataset_id: Dataset identifier

        Returns:
            dict or None: Statistics with keys: datasetId, databaseName,
                         tableName, sourceType, creatorName, createTimestamp,
                         lastAlterTimestamp, rowCount, sizeBytes, tableComment.
                         None if not found.
        """
        with self.connection.cursor() as cur:
            # Verify dataset exists in OL_DATASET (match by dataset_id OR name)
            cur.execute("""
                SELECT dataset_id, "name", source_type FROM OL_DATASET
                WHERE dataset_id = ? OR "name" = ?
            """, [dataset_id, dataset_id])
            ds_row = cur.fetchone()
            if not ds_row:
                return None
            resolved_dataset_id = ds_row[0]
            resolved_name = ds_row[1]

            # Parse database.table from resolved dataset name
            name_part = self._strip(resolved_name) if resolved_name else (dataset_id.split("/", 1)[1] if "/" in dataset_id else dataset_id)
            parts = name_part.split(".", 1)
            if len(parts) != 2:
                return None
            db_name, table_name = parts[0].strip(), parts[1].strip()

            # Query DBC.TablesV for table/view metadata
            cur.execute("""
                SELECT
                    TRIM(t.TableName),
                    t.TableKind,
                    TRIM(t.CreatorName),
                    t.CreateTimeStamp,
                    t.LastAlterTimeStamp,
                    TRIM(t.CommentString)
                FROM DBC.TablesV t
                WHERE t.DatabaseName = ?
                  AND t.TableName = ?
            """, [db_name, table_name])
            tab_row = cur.fetchone()

            if not tab_row:
                return None

            table_kind = self._strip(tab_row[1]) if tab_row[1] else ""
            source_type = "VIEW" if table_kind == "V" else "TABLE"

            result = {
                "datasetId": resolved_dataset_id,
                "databaseName": db_name,
                "tableName": tab_row[0] if tab_row[0] else table_name,
                "sourceType": source_type,
                "creatorName": tab_row[2] if tab_row[2] else None,
                "createTimestamp": self._isoformat(tab_row[3]),
                "lastAlterTimestamp": self._isoformat(tab_row[4]),
                "rowCount": None,
                "sizeBytes": None,
                "tableComment": tab_row[5] if tab_row[5] else None,
            }

            # Query DBC.TableStatsV for row count (may fail on permission)
            try:
                cur.execute("""
                    SELECT MAX(RowCount)
                    FROM DBC.TableStatsV
                    WHERE DatabaseName = ? AND TableName = ?
                """, [db_name, table_name])
                stats_row = cur.fetchone()
                if stats_row and stats_row[0] is not None:
                    result["rowCount"] = int(stats_row[0])
            except Exception:
                pass  # Permission or availability issue, leave rowCount null

            # Fallback: if DBC.TableStatsV had no row count, use COUNT(*)
            if result["rowCount"] is None:
                try:
                    cur.execute(f"""
                        SELECT COUNT(*)
                        FROM "{db_name}"."{table_name}"
                    """)
                    count_row = cur.fetchone()
                    if count_row and count_row[0] is not None:
                        result["rowCount"] = int(count_row[0])
                except Exception:
                    pass  # Permission or lock issue, leave rowCount null

            # Query DBC.TableSizeV for size (only meaningful for tables, not views)
            if source_type == "TABLE":
                try:
                    cur.execute("""
                        SELECT SUM(CurrentPerm)
                        FROM DBC.TableSizeV
                        WHERE DatabaseName = ? AND TableName = ?
                    """, [db_name, table_name])
                    size_row = cur.fetchone()
                    if size_row and size_row[0] is not None:
                        result["sizeBytes"] = int(size_row[0])
                except Exception:
                    pass  # Permission or availability issue, leave sizeBytes null

        return result

    def get_dataset_ddl(self, dataset_id: str):
        """
        Get DDL/definition for a dataset (table/view) from DBC views.

        Args:
            dataset_id: Dataset identifier

        Returns:
            dict or None: DDL data with keys: datasetId, databaseName,
                         tableName, sourceType, viewSql, tableDdl, truncated,
                         tableComment, columnComments. None if not found.
        """
        with self.connection.cursor() as cur:
            # Verify dataset exists in OL_DATASET (match by dataset_id OR name)
            cur.execute("""
                SELECT dataset_id, "name", source_type FROM OL_DATASET
                WHERE dataset_id = ? OR "name" = ?
            """, [dataset_id, dataset_id])
            ds_row = cur.fetchone()
            if not ds_row:
                return None
            resolved_dataset_id = ds_row[0]
            resolved_name = ds_row[1]

            # Parse database.table from resolved dataset name
            name_part = self._strip(resolved_name) if resolved_name else (dataset_id.split("/", 1)[1] if "/" in dataset_id else dataset_id)
            parts = name_part.split(".", 1)
            if len(parts) != 2:
                return None
            db_name, table_name = parts[0].strip(), parts[1].strip()

            # Query DBC.TablesV for view SQL and table comment
            # Try with RequestTxtOverFlow first, fall back without it
            truncated = False
            view_sql = None
            table_comment = None
            table_kind = None

            try:
                cur.execute("""
                    SELECT
                        t.TableKind,
                        TRIM(t.CommentString),
                        t.RequestText,
                        t.RequestTxtOverFlow
                    FROM DBC.TablesV t
                    WHERE t.DatabaseName = ?
                      AND t.TableName = ?
                """, [db_name, table_name])
                tab_row = cur.fetchone()
                if tab_row:
                    table_kind = self._strip(tab_row[0]) if tab_row[0] else ""
                    table_comment = tab_row[1] if tab_row[1] else None
                    if tab_row[2]:
                        view_sql = self._strip(tab_row[2]) if isinstance(tab_row[2], str) else str(tab_row[2]).strip()
                    truncated = tab_row[3] == "Y" if tab_row[3] else False
            except Exception:
                # RequestTxtOverFlow column may not exist, retry without it
                cur.execute("""
                    SELECT
                        t.TableKind,
                        TRIM(t.CommentString),
                        t.RequestText
                    FROM DBC.TablesV t
                    WHERE t.DatabaseName = ?
                      AND t.TableName = ?
                """, [db_name, table_name])
                tab_row = cur.fetchone()
                if tab_row:
                    table_kind = self._strip(tab_row[0]) if tab_row[0] else ""
                    table_comment = tab_row[1] if tab_row[1] else None
                    if tab_row[2]:
                        view_sql = self._strip(tab_row[2]) if isinstance(tab_row[2], str) else str(tab_row[2]).strip()
                        truncated = len(view_sql) >= 12500

            if table_kind is None:
                return None

            source_type = "VIEW" if table_kind == "V" else "TABLE"

            # Only set viewSql for views
            if source_type != "VIEW":
                view_sql = None
                truncated = False

            # For tables, get CREATE TABLE DDL via SHOW TABLE
            table_ddl = None
            if source_type == "TABLE":
                try:
                    cur.execute(f"SHOW TABLE {db_name}.{table_name}")
                    ddl_rows = cur.fetchall()
                    if ddl_rows:
                        table_ddl = "\n".join(row[0] if isinstance(row[0], str) else str(row[0]) for row in ddl_rows).strip()
                except Exception:
                    pass  # Permission or availability issue, leave tableDdl null

            result = {
                "datasetId": resolved_dataset_id,
                "databaseName": db_name,
                "tableName": table_name,
                "sourceType": source_type,
                "viewSql": view_sql,
                "tableDdl": table_ddl,
                "truncated": truncated,
                "tableComment": table_comment,
                "columnComments": {},
            }

            # Query DBC.ColumnsJQV for column comments
            try:
                cur.execute("""
                    SELECT TRIM(ColumnName), TRIM(CommentString)
                    FROM DBC.ColumnsJQV
                    WHERE DatabaseName = ?
                      AND TableName = ?
                      AND CommentString IS NOT NULL
                      AND TRIM(CommentString) <> ''
                    ORDER BY ColumnId
                """, [db_name, table_name])
                for row in cur.fetchall():
                    col_name = self._strip(row[0]) if row[0] else ""
                    col_comment = self._strip(row[1]) if row[1] else ""
                    if col_name and col_comment:
                        result["columnComments"][col_name] = col_comment
            except Exception:
                pass  # Permission issue, return empty column comments

        return result

    def get_dataset_name(self, dataset_id: str):
        """
        Get dataset name by ID or name.

        Supports flexible lookup:
        - If dataset_id contains '/', treats as full ID (namespace_hash/dataset_name)
        - Otherwise, treats as dataset name and looks up by name

        Args:
            dataset_id: Dataset identifier (full ID or name)

        Returns:
            str or None: Dataset name. None if not found.
        """
        with self.connection.cursor() as cur:
            # Try exact match by dataset_id first
            cur.execute("""
                SELECT "name"
                FROM OL_DATASET
                WHERE dataset_id = ?
            """, [dataset_id])
            row = cur.fetchone()
            if row:
                return self._strip(row[0]) if row[0] else ""

            # If not found and input doesn't look like a full ID, try matching by name
            # This allows callers to pass dataset name directly (e.g., "demo_user.FACT_SALES")
            if '/' not in dataset_id:
                cur.execute("""
                    SELECT "name"
                    FROM OL_DATASET
                    WHERE "name" = ?
                """, [dataset_id])
                row = cur.fetchone()
                if row:
                    return self._strip(row[0]) if row[0] else ""

            return None

    def get_dataset_fields(self, dataset_id: str):
        """
        Get field names for a dataset.

        Args:
            dataset_id: Dataset identifier

        Returns:
            list[str]: List of field names
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT field_name
                FROM OL_DATASET_FIELD
                WHERE dataset_id = ?
                ORDER BY ordinal_position, field_name
            """, [dataset_id])
            rows = cur.fetchall()
            return [self._strip(row[0]) if row[0] else "" for row in rows]

    def get_dataset_with_namespace(self, dataset_id: str):
        """
        Get dataset name, namespace URI, and source type by ID.

        Used by lineage endpoints to retrieve dataset metadata.

        Args:
            dataset_id: Dataset identifier

        Returns:
            dict or None: Contains name, namespace_uri, and source_type. None if not found.
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT d."name", n.namespace_uri, d.source_type
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE d.dataset_id = ?
            """, [dataset_id])
            row = cur.fetchone()
            if not row:
                return None
            return {
                "name": self._strip(row[0]) if row[0] else "",
                "namespace_uri": self._strip(row[1]) if row[1] else "",
                "source_type": self._strip(row[2]) if row[2] else "TABLE"
            }

    def get_field_metadata(self, dataset_name: str, field_name: str):
        """
        Get field type and nullable for a field.

        Used by database lineage for field metadata.

        Args:
            dataset_name: Fully qualified dataset name
            field_name: Field name

        Returns:
            dict or None: Contains field_type and nullable. None if not found.
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT f.field_type, f.nullable
                FROM OL_DATASET_FIELD f
                JOIN OL_DATASET d ON f.dataset_id = d.dataset_id
                WHERE TRIM(d."name") = TRIM(?)
                  AND TRIM(f.field_name) = TRIM(?)
            """, [dataset_name, field_name])
            row = cur.fetchone()
            if not row:
                return None
            return {
                "field_type": self._strip(row[0]) if row[0] else None,
                "nullable": row[1] == 'Y' if row[1] else True
            }

    def get_dataset_metadata(self, dataset_name: str):
        """
        Get source_type and namespace_uri for a dataset.

        Used by database lineage for external datasets.

        Args:
            dataset_name: Fully qualified dataset name

        Returns:
            dict or None: Contains namespace and sourceType. None if not found.
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT d.source_type, n.namespace_uri
                FROM OL_DATASET d
                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                WHERE TRIM(d."name") = TRIM(?)
            """, [dataset_name])
            row = cur.fetchone()
            if not row:
                return None
            return {
                "namespace": self._strip(row[1]) if row[1] else "",
                "sourceType": self._strip(row[0]) if row[0] else "TABLE"
            }
