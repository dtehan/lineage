#!/usr/bin/env python3
"""
View Lineage Extractor Module

Derives column-level lineage from view definitions stored in DBC.TablesV.RequestText.
Parses SQL using SQLGlot to extract column-level source->target mappings and inserts
them as OL_COLUMN_LINEAGE records.

Usage:
    from view_lineage_extractor import ViewLineageExtractor

    extractor = ViewLineageExtractor(
        cursor=cursor,
        namespace_uri=namespace_uri,
        database='demo_user',
        verbose=True
    )
    count = extractor.extract_all()
"""

import hashlib
import logging
import re
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger('view_lineage_extractor')

# Batch size limit to prevent query explosion
BATCH_SIZE = 100


def _generate_ol_lineage_id(source: str, target: str) -> str:
    """Generate a stable lineage ID from source and target column paths."""
    combined = f"{source}->{target}"
    return hashlib.md5(combined.encode()).hexdigest()[:24]


def _map_transformation_type(ol_type: str) -> Tuple[str, str]:
    """Map transformation type string to (OL_type, OL_subtype) tuple."""
    mapping = {
        "DIRECT": ("DIRECT", "IDENTITY"),
        "CALCULATION": ("DIRECT", "TRANSFORMATION"),
    }
    return mapping.get(ol_type.upper(), ("DIRECT", "IDENTITY"))


class ViewLineageExtractor:
    """Extracts column-level lineage from view definitions.

    Queries OL_DATASET for views, fetches their SQL from DBC.TablesV.RequestText,
    parses with SQLGlot to extract column mappings, and inserts them as
    OL_COLUMN_LINEAGE records.

    Attributes:
        cursor: Active Teradata database cursor
        namespace_uri: OpenLineage namespace URI (e.g. teradata://host:1025)
        database: Default database name for the OL_* tables
        verbose: Enable verbose logging
        dry_run: Preview mode - don't insert any records
    """

    def __init__(
        self,
        cursor,
        namespace_uri: str,
        database: str,
        verbose: bool = False,
        dry_run: bool = False,
    ):
        """Initialize the view lineage extractor.

        Args:
            cursor: Active Teradata database cursor
            namespace_uri: OpenLineage namespace URI
            database: Database name containing the OL_* tables (e.g. 'demo_user')
            verbose: Enable verbose/debug logging
            dry_run: If True, preview changes without inserting
        """
        # Fail fast if sqlglot not installed
        import sqlglot  # noqa: F401 -- just to verify it's available
        from sqlglot import exp  # noqa: F401

        self.cursor = cursor
        self.namespace_uri = namespace_uri
        self.database = database
        self.verbose = verbose
        self.dry_run = dry_run

        if verbose:
            logging.getLogger('view_lineage_extractor').setLevel(logging.DEBUG)

    def extract_all(self) -> int:
        """Discover all views, parse their SQL, and insert lineage records.

        Returns:
            Total number of lineage records inserted (or that would be inserted
            in dry_run mode).
        """
        # Step 1: Discover views
        views = self._discover_views()
        logger.info(f"Discovered {len(views)} views in OL_DATASET")
        print(f"  Discovered {len(views)} views in OL_DATASET")

        if not views:
            return 0

        # Step 2: Fetch view definitions from DBC.TablesV
        view_names = [(name.split('.')[0], name.split('.')[1]) for _, name in views]
        definitions = self._fetch_view_definitions(view_names)
        logger.info(f"Fetched {len(definitions)} view definitions")
        print(f"  Fetched {len(definitions)} view definitions")

        # Step 3: Build a set of known view names for reference
        view_name_set: Set[str] = {name.upper() for _, name in views}

        # Step 4: For each view, parse and extract lineage records
        all_records = []
        for dataset_id, view_name in views:
            parts = view_name.split('.')
            if len(parts) != 2:
                logger.warning(f"Unexpected view name format: {view_name}, skipping")
                continue

            view_db, view_tbl = parts[0], parts[1]
            key = (view_db.upper(), view_tbl.upper())
            view_sql = definitions.get(key)

            if not view_sql:
                logger.warning(f"No definition available for view {view_name}, skipping")
                continue

            try:
                records = self._parse_view_lineage(
                    view_db, view_tbl, view_sql, dataset_id
                )
                all_records.extend(records)
                logger.debug(
                    f"Extracted {len(records)} lineage records from {view_name}"
                )
            except Exception as e:
                logger.warning(f"Failed to parse view {view_name}: {e}, skipping")

        logger.info(
            f"Total lineage records extracted from view definitions: {len(all_records)}"
        )

        # Step 5: Insert records
        if not self.dry_run:
            inserted = self._insert_lineage_records(all_records)
        else:
            inserted = len(all_records)
            print(f"  [DRY RUN] Would create {inserted} lineage records from view definitions")

        print(f"  Created {inserted} lineage records from view definitions")
        return inserted

    def _discover_views(self) -> List[Tuple[str, str]]:
        """Query OL_DATASET for all active VIEW entries.

        Returns:
            List of (dataset_id, name) tuples for VIEW rows with is_active='Y'.
            The name field is in 'DATABASE.VIEWNAME' format.
        """
        try:
            self.cursor.execute(f"""
                SELECT dataset_id, name
                FROM {self.database}.OL_DATASET
                WHERE source_type = 'VIEW'
                  AND is_active = 'Y'
            """)
            rows = self.cursor.fetchall()
            return [(row[0], row[1]) for row in rows]
        except Exception as e:
            logger.warning(f"Failed to discover views from OL_DATASET: {e}")
            return []

    def _fetch_view_definitions(
        self, view_refs: List[Tuple[str, str]]
    ) -> Dict[Tuple[str, str], Optional[str]]:
        """Fetch view SQL definitions from DBC.TablesV.RequestText.

        Handles RequestTxtOverFlow (truncated definitions) by falling back
        to SHOW VIEW. Processes in batches of BATCH_SIZE.

        Args:
            view_refs: List of (database, tablename) tuples (normalized uppercase)

        Returns:
            Dict mapping (database_upper, tablename_upper) -> SQL string or None
        """
        if not view_refs:
            return {}

        definitions: Dict[Tuple[str, str], Optional[str]] = {}

        for batch_start in range(0, len(view_refs), BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, len(view_refs))
            batch_refs = view_refs[batch_start:batch_end]

            conditions = []
            for db, tbl in batch_refs:
                db_upper = db.upper()
                tbl_upper = tbl.upper()
                conditions.append(
                    f"(UPPER(TRIM(DatabaseName)) = '{db_upper}' AND "
                    f"UPPER(TRIM(TableName)) = '{tbl_upper}')"
                )

            where_clause = " OR ".join(conditions)

            try:
                # Try with RequestTxtOverFlow column first
                query = f"""
                    SELECT TRIM(DatabaseName), TRIM(TableName), RequestText, RequestTxtOverFlow
                    FROM DBC.TablesV
                    WHERE ({where_clause}) AND TableKind = 'V'
                """
                self.cursor.execute(query)
                rows = self.cursor.fetchall()

                for row in rows:
                    db, tbl, text, overflow = row[0], row[1], row[2], row[3]
                    key = (db.upper(), tbl.upper())

                    if overflow == 'Y':
                        logger.warning(
                            f"View definition truncated (RequestTxtOverFlow='Y') for "
                            f"{db}.{tbl}, attempting SHOW VIEW fallback"
                        )
                        definitions[key] = None  # Signal for fallback
                    elif text:
                        definitions[key] = text.strip()
                    else:
                        definitions[key] = None

            except Exception:
                # Fallback: query without RequestTxtOverFlow column
                logger.debug(
                    "RequestTxtOverFlow column unavailable, using fallback query"
                )
                try:
                    query_fallback = f"""
                        SELECT TRIM(DatabaseName), TRIM(TableName), RequestText
                        FROM DBC.TablesV
                        WHERE ({where_clause}) AND TableKind = 'V'
                    """
                    self.cursor.execute(query_fallback)
                    rows = self.cursor.fetchall()

                    for row in rows:
                        db, tbl, text = row[0], row[1], row[2]
                        key = (db.upper(), tbl.upper())

                        if text and len(text) >= 12500:
                            logger.warning(
                                f"View definition may be truncated (len={len(text)}) "
                                f"for {db}.{tbl}, attempting SHOW VIEW fallback"
                            )
                            definitions[key] = None
                        elif text:
                            definitions[key] = text.strip()
                        else:
                            definitions[key] = None
                except Exception as e2:
                    logger.warning(f"Failed to fetch view definitions batch: {e2}")

        # Handle truncated definitions via SHOW VIEW fallback
        for key in list(definitions.keys()):
            if definitions[key] is None:
                db, tbl = key
                result = self._fetch_show_view(db, tbl)
                definitions[key] = result

        return definitions

    def _fetch_show_view(self, database: str, table: str) -> Optional[str]:
        """Execute SHOW VIEW as fallback for truncated RequestText.

        Args:
            database: Database name (uppercase)
            table: View name (uppercase)

        Returns:
            View definition SQL, or None on failure
        """
        try:
            self.cursor.execute(f"SHOW VIEW {database}.{table}")
            rows = self.cursor.fetchall()
            if not rows:
                return None
            lines = [str(row[0]) for row in rows if row and row[0]]
            result = "\n".join(lines).strip()
            return result if result else None
        except Exception as e:
            logger.warning(f"SHOW VIEW failed for {database}.{table}: {e}")
            return None

    def _parse_view_lineage(
        self,
        view_db: str,
        view_tbl: str,
        view_sql: str,
        target_dataset_id: str,
    ) -> List[Dict]:
        """Parse view SQL and extract column-level lineage records.

        Args:
            view_db: Database name of the view
            view_tbl: View name
            view_sql: Raw view definition SQL (may be REPLACE VIEW or CREATE VIEW)
            target_dataset_id: Dataset ID for the view in OL_DATASET

        Returns:
            List of lineage record dicts ready for insertion.
        """
        import sqlglot
        from sqlglot import exp

        # Normalize REPLACE VIEW -> CREATE VIEW
        # Teradata stores view definitions as "REPLACE VIEW ..." in RequestText
        normalized_sql = re.sub(
            r'^\s*REPLACE\s+VIEW',
            'CREATE VIEW',
            view_sql,
            count=1,
            flags=re.IGNORECASE
        )

        # Parse with Teradata dialect, fallback to generic
        parsed = None
        try:
            parsed = sqlglot.parse_one(normalized_sql, dialect="teradata")
        except Exception:
            try:
                parsed = sqlglot.parse_one(normalized_sql)
            except Exception as parse_err:
                logger.warning(
                    f"Failed to parse view {view_db}.{view_tbl}: {parse_err}"
                )
                return []

        if parsed is None:
            logger.warning(
                f"sqlglot returned None for view {view_db}.{view_tbl}"
            )
            return []

        # Extract SELECT expression from the CREATE VIEW AST
        select_expr = None
        if isinstance(parsed, exp.Create):
            inner = parsed.expression
            if isinstance(inner, exp.Subquery):
                inner = inner.this
            if isinstance(inner, exp.Select):
                select_expr = inner
        elif isinstance(parsed, exp.Select):
            select_expr = parsed

        if select_expr is None:
            logger.warning(
                f"Could not extract SELECT from view {view_db}.{view_tbl}"
            )
            return []

        # Build table alias map from FROM/JOIN clauses
        # Maps alias (uppercase) -> (database, table) both uppercase
        alias_map: Dict[str, Tuple[str, str]] = {}
        default_source_db = view_db.upper()

        for table_node in select_expr.find_all(exp.Table):
            tbl_name = table_node.name.upper() if table_node.name else None
            tbl_db = (
                table_node.db.upper()
                if table_node.db
                else default_source_db
            )

            if not tbl_name:
                continue

            # Map the table name itself
            alias_map[tbl_name] = (tbl_db, tbl_name)

            # Map the alias if present
            if table_node.alias:
                alias_map[table_node.alias.upper()] = (tbl_db, tbl_name)

        # Determine view column names from OL_DATASET_FIELD (for SELECT * expansion)
        # We query them lazily only if needed
        view_columns_cache: Optional[List[str]] = None

        records = []
        view_dataset = f"{view_db}.{view_tbl}"

        for expr in select_expr.expressions:
            # Determine target (view) column name
            if isinstance(expr, exp.Alias):
                target_field = expr.alias
                source_expr = expr.this
            else:
                # No alias - column name is the target
                if isinstance(expr, exp.Column):
                    target_field = expr.name
                    source_expr = expr
                elif isinstance(expr, exp.Star):
                    # SELECT * case - handled separately below
                    target_field = None
                    source_expr = expr
                else:
                    # Some other expression without alias (edge case)
                    # Try to walk it for source columns, use None as target
                    target_field = None
                    source_expr = expr

            # Handle SELECT * wildcard
            if isinstance(source_expr, exp.Star):
                # Expand wildcard: try to get columns from the source table(s)
                star_records = self._expand_star_lineage(
                    alias_map, view_dataset, view_db, view_tbl, default_source_db
                )
                records.extend(star_records)
                continue

            # Handle simple column reference: t.col or col
            if isinstance(source_expr, exp.Column) and not self._has_function(source_expr):
                source_field = source_expr.name
                if not source_field:
                    continue

                # Resolve the table
                if source_expr.table:
                    table_alias = source_expr.table.upper()
                    if table_alias in alias_map:
                        src_db, src_tbl = alias_map[table_alias]
                    else:
                        # Alias not in map - try treating it as a table name directly
                        src_db = default_source_db
                        src_tbl = table_alias
                else:
                    # Unqualified column - check which source table has it
                    resolved = self._resolve_unqualified_column(
                        source_field.upper(), alias_map
                    )
                    if resolved is None:
                        # Ambiguous or unknown - skip
                        logger.warning(
                            f"Ambiguous/unresolved column '{source_field}' in "
                            f"{view_db}.{view_tbl}, skipping"
                        )
                        continue
                    src_db, src_tbl = resolved

                if not target_field:
                    target_field = source_field

                records.append(
                    self._build_record(
                        src_db, src_tbl, source_field,
                        view_db, view_tbl, target_field,
                        "DIRECT", 0.90
                    )
                )

            else:
                # Expression with functions - walk all column refs
                if not target_field:
                    # Can't create a lineage record without a target column name
                    continue

                source_columns = list(source_expr.find_all(exp.Column))
                if not source_columns:
                    continue

                for src_col_node in source_columns:
                    src_field = src_col_node.name
                    if not src_field:
                        continue

                    if src_col_node.table:
                        tbl_alias = src_col_node.table.upper()
                        if tbl_alias in alias_map:
                            src_db, src_tbl = alias_map[tbl_alias]
                        else:
                            src_db = default_source_db
                            src_tbl = tbl_alias
                    else:
                        resolved = self._resolve_unqualified_column(
                            src_field.upper(), alias_map
                        )
                        if resolved is None:
                            logger.warning(
                                f"Ambiguous/unresolved column '{src_field}' in "
                                f"expression for {view_db}.{view_tbl}, skipping"
                            )
                            continue
                        src_db, src_tbl = resolved

                    records.append(
                        self._build_record(
                            src_db, src_tbl, src_field,
                            view_db, view_tbl, target_field,
                            "CALCULATION", 0.80
                        )
                    )

        logger.debug(
            f"Parsed {len(records)} lineage records from {view_db}.{view_tbl}"
        )
        return records

    def _has_function(self, expr) -> bool:
        """Check if an expression contains any function calls."""
        from sqlglot import exp
        return any(True for _ in expr.find_all(exp.Func))

    def _expand_star_lineage(
        self,
        alias_map: Dict[str, Tuple[str, str]],
        view_dataset: str,
        view_db: str,
        view_tbl: str,
        default_source_db: str,
    ) -> List[Dict]:
        """Expand SELECT * to column-level lineage by querying OL_DATASET_FIELD.

        Args:
            alias_map: Map of alias -> (db, table)
            view_dataset: Fully qualified view name "db.view"
            view_db: View database name
            view_tbl: View table name
            default_source_db: Default database to use for unqualified refs

        Returns:
            List of lineage record dicts
        """
        records = []

        # Get view's own columns
        view_cols = self._get_dataset_columns(view_db, view_tbl)

        # If only one source table, map by ordinal position
        unique_sources = list(set(alias_map.values()))

        if len(unique_sources) == 1:
            src_db, src_tbl = unique_sources[0]
            src_cols = self._get_dataset_columns(src_db, src_tbl)

            if not src_cols:
                logger.warning(
                    f"SELECT * in {view_db}.{view_tbl}: no columns found for "
                    f"source {src_db}.{src_tbl} in OL_DATASET_FIELD"
                )
                # Create generic star record
                for col in view_cols:
                    records.append(
                        self._build_record(
                            src_db, src_tbl, col,
                            view_db, view_tbl, col,
                            "DIRECT", 0.70
                        )
                    )
                return records

            if len(src_cols) != len(view_cols) and view_cols:
                logger.warning(
                    f"SELECT * column count mismatch in {view_db}.{view_tbl}: "
                    f"source {src_db}.{src_tbl} has {len(src_cols)} cols, "
                    f"view has {len(view_cols)} cols"
                )

            # Map by ordinal position (or by name if counts match and match by name)
            cols_to_map = view_cols if view_cols else src_cols
            for col in cols_to_map:
                if col in src_cols:
                    records.append(
                        self._build_record(
                            src_db, src_tbl, col,
                            view_db, view_tbl, col,
                            "DIRECT", 0.70
                        )
                    )
                elif src_cols:
                    # Map by position
                    idx = cols_to_map.index(col) if col in cols_to_map else None
                    if idx is not None and idx < len(src_cols):
                        records.append(
                            self._build_record(
                                src_db, src_tbl, src_cols[idx],
                                view_db, view_tbl, col,
                                "DIRECT", 0.70
                            )
                        )
        else:
            # Multiple source tables - can't determine which table each column comes from
            # Log a warning and skip (ambiguous attribution)
            logger.warning(
                f"SELECT * with multiple source tables in {view_db}.{view_tbl}: "
                f"ambiguous attribution, skipping wildcard expansion"
            )

        return records

    def _get_dataset_columns(self, database: str, table: str) -> List[str]:
        """Get column names for a dataset from OL_DATASET_FIELD in ordinal order.

        Args:
            database: Database name
            table: Table name

        Returns:
            List of column names in ordinal position order, empty list on error
        """
        try:
            self.cursor.execute(f"""
                SELECT df.field_name
                FROM {self.database}.OL_DATASET_FIELD df
                JOIN {self.database}.OL_DATASET d ON df.dataset_id = d.dataset_id
                WHERE UPPER(d.name) = '{database.upper()}.{table.upper()}'
                ORDER BY df.ordinal_position
            """)
            rows = self.cursor.fetchall()
            return [row[0] for row in rows]
        except Exception as e:
            logger.warning(
                f"Failed to get columns for {database}.{table} from "
                f"OL_DATASET_FIELD: {e}"
            )
            return []

    def _resolve_unqualified_column(
        self,
        column_name_upper: str,
        alias_map: Dict[str, Tuple[str, str]],
    ) -> Optional[Tuple[str, str]]:
        """Try to resolve an unqualified column to its source table.

        If only one source table exists in the alias map, assume that table.
        If multiple exist, query OL_DATASET_FIELD to find which has the column.

        Args:
            column_name_upper: Column name already normalized to uppercase
            alias_map: Map of alias -> (db, table)

        Returns:
            (database, table) tuple or None if ambiguous/not found
        """
        unique_sources = list(set(alias_map.values()))

        if len(unique_sources) == 0:
            return None

        if len(unique_sources) == 1:
            return unique_sources[0]

        # Multiple sources - try to find the one that has this column
        matching = []
        for src_db, src_tbl in unique_sources:
            try:
                self.cursor.execute(f"""
                    SELECT COUNT(*)
                    FROM {self.database}.OL_DATASET_FIELD df
                    JOIN {self.database}.OL_DATASET d ON df.dataset_id = d.dataset_id
                    WHERE UPPER(d.name) = '{src_db.upper()}.{src_tbl.upper()}'
                      AND UPPER(df.field_name) = '{column_name_upper}'
                """)
                row = self.cursor.fetchone()
                if row and row[0] > 0:
                    matching.append((src_db, src_tbl))
            except Exception:
                pass

        if len(matching) == 1:
            return matching[0]

        # Ambiguous or not found
        return None

    def _build_record(
        self,
        src_db: str, src_tbl: str, src_field: str,
        tgt_db: str, tgt_tbl: str, tgt_field: str,
        transformation_type: str,
        confidence_score: float,
    ) -> Dict:
        """Build a lineage record dict for insertion.

        Args:
            src_db: Source database name
            src_tbl: Source table name
            src_field: Source field (column) name
            tgt_db: Target database name (the view)
            tgt_tbl: Target table/view name
            tgt_field: Target field (view column) name
            transformation_type: 'DIRECT' or 'CALCULATION'
            confidence_score: Confidence score (0.0-1.0)

        Returns:
            Dict with keys matching OL_COLUMN_LINEAGE columns
        """
        source_dataset = f"{src_db}.{src_tbl}"
        target_dataset = f"{tgt_db}.{tgt_tbl}"
        source_path = f"{source_dataset}.{src_field}"
        target_path = f"{target_dataset}.{tgt_field}"

        ol_type, ol_subtype = _map_transformation_type(transformation_type)

        return {
            "lineage_id": _generate_ol_lineage_id(source_path, target_path),
            "source_namespace": self.namespace_uri,
            "source_dataset": source_dataset,
            "source_field": src_field,
            "target_namespace": self.namespace_uri,
            "target_dataset": target_dataset,
            "target_field": tgt_field,
            "transformation_type": ol_type,
            "transformation_subtype": ol_subtype,
            "transformation_description": "Derived from view definition",
            "confidence_score": confidence_score,
        }

    def _insert_lineage_records(self, records: List[Dict]) -> int:
        """Insert lineage records into OL_COLUMN_LINEAGE.

        Handles duplicate key errors gracefully (skips with no error).

        Args:
            records: List of record dicts from _build_record()

        Returns:
            Number of records successfully inserted
        """
        if not records:
            return 0

        insert_sql = f"""
            INSERT INTO {self.database}.OL_COLUMN_LINEAGE
            (lineage_id, run_id, source_namespace, source_dataset, source_field,
             target_namespace, target_dataset, target_field,
             transformation_type, transformation_subtype, transformation_description,
             confidence_score, discovered_at, is_active)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), 'Y')
        """

        count = 0
        for rec in records:
            try:
                self.cursor.execute(insert_sql, (
                    rec["lineage_id"],
                    rec["source_namespace"],
                    rec["source_dataset"],
                    rec["source_field"],
                    rec["target_namespace"],
                    rec["target_dataset"],
                    rec["target_field"],
                    rec["transformation_type"],
                    rec["transformation_subtype"],
                    rec["transformation_description"],
                    rec["confidence_score"],
                ))
                count += 1
            except Exception as e:
                if "duplicate" not in str(e).lower() and "2801" not in str(e):
                    logger.warning(
                        f"Failed to insert lineage record "
                        f"{rec['source_dataset']}.{rec['source_field']} -> "
                        f"{rec['target_dataset']}.{rec['target_field']}: {e}"
                    )

        logger.info(f"Inserted {count} of {len(records)} lineage records")
        return count
