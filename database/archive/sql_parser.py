#!/usr/bin/env python3
"""
SQL Parser for Column-Level Lineage Extraction

Uses SQLGlot to parse SQL statements and extract column-level lineage.
Supports Teradata SQL dialect including INSERT...SELECT, MERGE, CTAS, and UPDATE statements.

Usage:
    from sql_parser import TeradataSQLParser

    parser = TeradataSQLParser()
    lineage = parser.extract_column_lineage(sql_text, statement_type)

Dependencies:
    pip install sqlglot>=25.0.0
"""

import re
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

try:
    import sqlglot
    from sqlglot import exp
    from sqlglot.errors import ParseError
except ImportError:
    raise ImportError("sqlglot is required. Install with: pip install sqlglot>=25.0.0")


@dataclass
class ColumnReference:
    """Represents a column reference in SQL."""
    database: Optional[str] = None
    table: Optional[str] = None
    column: str = ""
    alias: Optional[str] = None
    is_expression: bool = False
    expression_text: Optional[str] = None


@dataclass
class ColumnLineage:
    """Represents a column-to-column lineage relationship."""
    source_database: str
    source_table: str
    source_column: str
    target_database: str
    target_table: str
    target_column: str
    transformation_type: str = "DIRECT"
    confidence_score: float = 0.9

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "source_database": self.source_database,
            "source_table": self.source_table,
            "source_column": self.source_column,
            "target_database": self.target_database,
            "target_table": self.target_table,
            "target_column": self.target_column,
            "transformation_type": self.transformation_type,
            "confidence_score": self.confidence_score,
        }


class TeradataSQLParser:
    """Parses Teradata SQL to extract column-level lineage."""

    # Default database when not specified
    DEFAULT_DATABASE = "demo_user"

    # Confidence scores by extraction method
    CONFIDENCE_DIRECT = 0.95       # Direct column reference
    CONFIDENCE_EXPRESSION = 0.85   # Column in expression
    CONFIDENCE_STAR = 0.70         # SELECT * expansion
    CONFIDENCE_PATTERN = 0.60      # Pattern-based (fallback)

    def __init__(self, default_database: str = None):
        self.default_database = default_database or self.DEFAULT_DATABASE
        # Table alias to (database, table) mapping
        self._table_aliases: Dict[str, Tuple[str, str]] = {}

    def extract_column_lineage(
        self,
        sql: str,
        statement_type: Optional[str] = None
    ) -> List[dict]:
        """
        Extract column-level lineage from a SQL statement.

        Args:
            sql: The SQL statement to parse
            statement_type: Optional hint about statement type (Insert, Merge Into, etc.)

        Returns:
            List of lineage records as dictionaries
        """
        if not sql or not sql.strip():
            return []

        # Clean the SQL
        sql = self._clean_sql(sql)

        # Try SQLGlot parsing first
        try:
            lineage = self._parse_with_sqlglot(sql)
            if lineage:
                return [l.to_dict() for l in lineage]
        except Exception as e:
            # Fall through to pattern-based extraction
            pass

        # Fallback to pattern-based extraction
        lineage = self._extract_with_patterns(sql, statement_type)
        return [l.to_dict() for l in lineage]

    def _clean_sql(self, sql: str) -> str:
        """Clean SQL for parsing."""
        # Remove leading/trailing whitespace
        sql = sql.strip()
        # Remove trailing semicolons
        sql = sql.rstrip(";")
        # Normalize whitespace
        sql = re.sub(r"\s+", " ", sql)
        return sql

    def _parse_with_sqlglot(self, sql: str) -> List[ColumnLineage]:
        """Parse SQL using SQLGlot and extract lineage."""
        # Reset table aliases
        self._table_aliases = {}

        # Parse with Teradata dialect
        try:
            parsed = sqlglot.parse_one(sql, dialect="teradata")
        except ParseError:
            # Try without dialect specification
            parsed = sqlglot.parse_one(sql)

        if parsed is None:
            return []

        # Determine statement type and extract accordingly
        if isinstance(parsed, exp.Insert):
            return self._extract_insert_lineage(parsed)
        elif isinstance(parsed, exp.Merge):
            return self._extract_merge_lineage(parsed)
        elif isinstance(parsed, exp.Create):
            return self._extract_ctas_lineage(parsed)
        elif isinstance(parsed, exp.Update):
            return self._extract_update_lineage(parsed)

        return []

    def _extract_insert_lineage(self, stmt: exp.Insert) -> List[ColumnLineage]:
        """Extract lineage from INSERT...SELECT statement."""
        lineage = []

        # Get target table
        target_table = stmt.this
        if not target_table:
            return []

        target_db, target_tbl = self._resolve_table(target_table)

        # Get target columns (if specified)
        target_columns = []
        if hasattr(stmt, 'columns') and stmt.columns:
            for col in stmt.columns:
                if isinstance(col, exp.Column):
                    target_columns.append(col.name)
                elif hasattr(col, 'name'):
                    target_columns.append(col.name)

        # Get SELECT clause
        select_expr = stmt.expression
        if not isinstance(select_expr, exp.Select):
            return []

        # Build table aliases from FROM clause
        self._build_table_aliases(select_expr)

        # Extract source columns from SELECT expressions
        source_columns = self._extract_select_columns(select_expr)

        # Match source to target columns
        for i, source_info in enumerate(source_columns):
            # Determine target column
            if i < len(target_columns):
                target_col = target_columns[i]
            elif source_info.alias:
                target_col = source_info.alias
            elif source_info.column:
                target_col = source_info.column
            else:
                continue

            # Resolve source table
            source_db, source_tbl = self._resolve_column_table(source_info)

            if source_db and source_tbl and source_info.column:
                transformation = "CALCULATION" if source_info.is_expression else "DIRECT"
                confidence = self.CONFIDENCE_EXPRESSION if source_info.is_expression else self.CONFIDENCE_DIRECT

                lineage.append(ColumnLineage(
                    source_database=source_db,
                    source_table=source_tbl,
                    source_column=source_info.column,
                    target_database=target_db,
                    target_table=target_tbl,
                    target_column=target_col,
                    transformation_type=transformation,
                    confidence_score=confidence,
                ))

        return lineage

    def _extract_merge_lineage(self, stmt: exp.Merge) -> List[ColumnLineage]:
        """Extract lineage from MERGE statement."""
        lineage = []

        # Get target table
        target_table = stmt.this
        if not target_table:
            return []

        target_db, target_tbl = self._resolve_table(target_table)

        # Build table aliases
        if hasattr(stmt, 'using') and stmt.using:
            using_table = stmt.using
            self._build_table_aliases_from_table(using_table)

        # Process WHEN MATCHED and WHEN NOT MATCHED clauses
        for when_clause in stmt.expressions:
            if isinstance(when_clause, exp.When):
                # Get the action (UPDATE or INSERT)
                for action in when_clause.expressions:
                    if isinstance(action, exp.Update):
                        # Extract UPDATE SET column assignments
                        for set_expr in action.expressions:
                            if isinstance(set_expr, exp.EQ):
                                target_col = self._get_column_name(set_expr.this)
                                source_refs = self._extract_column_refs(set_expr.expression)

                                for source_ref in source_refs:
                                    source_db, source_tbl = self._resolve_column_table(source_ref)
                                    if source_db and source_tbl and source_ref.column:
                                        lineage.append(ColumnLineage(
                                            source_database=source_db,
                                            source_table=source_tbl,
                                            source_column=source_ref.column,
                                            target_database=target_db,
                                            target_table=target_tbl,
                                            target_column=target_col,
                                            transformation_type="DIRECT" if len(source_refs) == 1 else "CALCULATION",
                                            confidence_score=self.CONFIDENCE_DIRECT if len(source_refs) == 1 else self.CONFIDENCE_EXPRESSION,
                                        ))

        return lineage

    def _extract_ctas_lineage(self, stmt: exp.Create) -> List[ColumnLineage]:
        """Extract lineage from CREATE TABLE AS SELECT."""
        lineage = []

        # Get target table
        target_table = stmt.this
        if not target_table:
            return []

        target_db, target_tbl = self._resolve_table(target_table)

        # Get SELECT clause
        select_expr = stmt.expression
        if not isinstance(select_expr, exp.Select):
            return []

        # Build table aliases from FROM clause
        self._build_table_aliases(select_expr)

        # Extract source columns from SELECT expressions
        source_columns = self._extract_select_columns(select_expr)

        # For CTAS, target columns are derived from SELECT
        for source_info in source_columns:
            # Target column name
            target_col = source_info.alias or source_info.column
            if not target_col:
                continue

            # Resolve source table
            source_db, source_tbl = self._resolve_column_table(source_info)

            if source_db and source_tbl and source_info.column:
                transformation = "CALCULATION" if source_info.is_expression else "DIRECT"
                confidence = self.CONFIDENCE_EXPRESSION if source_info.is_expression else self.CONFIDENCE_DIRECT

                lineage.append(ColumnLineage(
                    source_database=source_db,
                    source_table=source_tbl,
                    source_column=source_info.column,
                    target_database=target_db,
                    target_table=target_tbl,
                    target_column=target_col,
                    transformation_type=transformation,
                    confidence_score=confidence,
                ))

        return lineage

    def _extract_update_lineage(self, stmt: exp.Update) -> List[ColumnLineage]:
        """Extract lineage from UPDATE statement."""
        lineage = []

        # Get target table
        target_table = stmt.this
        if not target_table:
            return []

        target_db, target_tbl = self._resolve_table(target_table)

        # Build table aliases from FROM clause if present
        from_clause = stmt.args.get('from_') or stmt.args.get('from')
        if from_clause:
            self._build_table_aliases_from_expression(from_clause)

        # Process SET clauses
        for set_expr in stmt.expressions:
            if isinstance(set_expr, exp.EQ):
                target_col = self._get_column_name(set_expr.this)
                source_refs = self._extract_column_refs(set_expr.expression)

                for source_ref in source_refs:
                    source_db, source_tbl = self._resolve_column_table(source_ref)
                    if source_db and source_tbl and source_ref.column:
                        lineage.append(ColumnLineage(
                            source_database=source_db,
                            source_table=source_tbl,
                            source_column=source_ref.column,
                            target_database=target_db,
                            target_table=target_tbl,
                            target_column=target_col,
                            transformation_type="DIRECT" if len(source_refs) == 1 else "CALCULATION",
                            confidence_score=self.CONFIDENCE_DIRECT if len(source_refs) == 1 else self.CONFIDENCE_EXPRESSION,
                        ))

        return lineage

    def _build_table_aliases(self, select: exp.Select) -> None:
        """Build table alias mapping from SELECT statement's FROM clause."""
        # SQLGlot uses 'from_' not 'from' as the key
        from_clause = select.args.get('from_') or select.args.get('from')
        if from_clause:
            self._build_table_aliases_from_expression(from_clause)

        # Also search for tables in the entire SELECT tree as fallback
        if not self._table_aliases:
            for table in select.find_all(exp.Table):
                self._build_table_aliases_from_table(table)

        # Also check JOINs
        for join in select.args.get('joins', []):
            self._build_table_aliases_from_expression(join)

    def _build_table_aliases_from_expression(self, expr) -> None:
        """Build table alias mapping from an expression."""
        for table in expr.find_all(exp.Table):
            self._build_table_aliases_from_table(table)

    def _build_table_aliases_from_table(self, table: exp.Table) -> None:
        """Build alias mapping for a single table expression."""
        db, tbl = self._resolve_table(table)
        alias = table.alias

        if alias:
            self._table_aliases[alias.lower()] = (db, tbl)
        # Also map the table name itself
        self._table_aliases[tbl.lower()] = (db, tbl)

    def _resolve_table(self, table_expr) -> Tuple[str, str]:
        """Resolve table expression to (database, table) tuple."""
        if isinstance(table_expr, exp.Table):
            db = table_expr.db or self.default_database
            tbl = table_expr.name
            return (db, tbl)
        elif isinstance(table_expr, exp.Schema):
            # Schema wraps table in INSERT...SELECT with column list
            inner = table_expr.this
            if isinstance(inner, exp.Table):
                return (inner.db or self.default_database, inner.name)
            # Fallback: try to extract from string representation
            return self._resolve_table(inner)
        elif hasattr(table_expr, 'this') and isinstance(table_expr.this, exp.Table):
            # Handle other wrapper expressions
            return self._resolve_table(table_expr.this)
        elif hasattr(table_expr, 'name'):
            # Try to parse as database.table
            name = str(table_expr.name)
            if '.' in name:
                parts = name.split('.')
                return (parts[0], parts[1])
            return (self.default_database, name)
        return (self.default_database, str(table_expr))

    def _resolve_column_table(self, col_ref: ColumnReference) -> Tuple[str, str]:
        """Resolve column reference to (database, table) tuple."""
        if col_ref.database and col_ref.table:
            return (col_ref.database, col_ref.table)

        if col_ref.table:
            # Look up in aliases
            key = col_ref.table.lower()
            if key in self._table_aliases:
                return self._table_aliases[key]
            return (self.default_database, col_ref.table)

        # If no table specified and only one table in scope, use that
        if len(self._table_aliases) == 1:
            return list(self._table_aliases.values())[0]

        return (self.default_database, "UNKNOWN")

    def _extract_select_columns(self, select: exp.Select) -> List[ColumnReference]:
        """Extract column references from SELECT clause."""
        columns = []

        for expr in select.expressions:
            if isinstance(expr, exp.Star):
                # Handle SELECT *
                # This would require schema information to expand
                continue

            alias = expr.alias if hasattr(expr, 'alias') else None

            if isinstance(expr, exp.Column):
                # Direct column reference
                col_ref = ColumnReference(
                    database=expr.table if hasattr(expr, 'db') and expr.db else None,
                    table=expr.table if hasattr(expr, 'table') else None,
                    column=expr.name,
                    alias=alias,
                    is_expression=False,
                )
                columns.append(col_ref)

            elif isinstance(expr, exp.Alias):
                # Aliased expression
                inner = expr.this
                alias_name = expr.alias

                if isinstance(inner, exp.Column):
                    col_ref = ColumnReference(
                        database=inner.db if hasattr(inner, 'db') else None,
                        table=inner.table if hasattr(inner, 'table') else None,
                        column=inner.name,
                        alias=alias_name,
                        is_expression=False,
                    )
                    columns.append(col_ref)
                else:
                    # Expression (function, calculation, etc.)
                    # Find all column references in the expression
                    inner_cols = self._extract_column_refs(inner)
                    for col in inner_cols:
                        col.alias = alias_name
                        col.is_expression = True
                        columns.append(col)

            else:
                # Other expression types
                inner_cols = self._extract_column_refs(expr)
                for col in inner_cols:
                    col.alias = alias
                    col.is_expression = True
                    columns.append(col)

        return columns

    def _extract_column_refs(self, expr) -> List[ColumnReference]:
        """Extract all column references from an expression."""
        columns = []

        for col in expr.find_all(exp.Column):
            col_ref = ColumnReference(
                database=col.db if hasattr(col, 'db') else None,
                table=col.table if hasattr(col, 'table') else None,
                column=col.name,
                is_expression=False,
            )
            columns.append(col_ref)

        return columns

    def _get_column_name(self, expr) -> str:
        """Get column name from expression."""
        if isinstance(expr, exp.Column):
            return expr.name
        elif hasattr(expr, 'name'):
            return expr.name
        return str(expr)

    # =========================================================================
    # Pattern-Based Extraction (Fallback)
    # =========================================================================

    def _extract_with_patterns(
        self,
        sql: str,
        statement_type: Optional[str] = None
    ) -> List[ColumnLineage]:
        """
        Fallback pattern-based extraction when SQLGlot parsing fails.
        Uses regex to extract basic lineage information.
        """
        lineage = []

        # Normalize SQL
        sql_upper = sql.upper()

        # Detect statement type
        if statement_type:
            stmt_type = statement_type.upper()
        elif "INSERT" in sql_upper and "SELECT" in sql_upper:
            stmt_type = "INSERT"
        elif "MERGE" in sql_upper:
            stmt_type = "MERGE"
        elif "CREATE" in sql_upper and "SELECT" in sql_upper:
            stmt_type = "CTAS"
        elif "UPDATE" in sql_upper:
            stmt_type = "UPDATE"
        else:
            return []

        # Extract target table
        target_match = None
        if stmt_type == "INSERT":
            target_match = re.search(
                r'INSERT\s+INTO\s+(["\w]+(?:\.["\w]+)?)',
                sql,
                re.IGNORECASE
            )
        elif stmt_type == "MERGE":
            target_match = re.search(
                r'MERGE\s+INTO\s+(["\w]+(?:\.["\w]+)?)',
                sql,
                re.IGNORECASE
            )
        elif stmt_type == "CTAS":
            target_match = re.search(
                r'CREATE\s+(?:MULTISET\s+)?TABLE\s+(["\w]+(?:\.["\w]+)?)',
                sql,
                re.IGNORECASE
            )
        elif stmt_type == "UPDATE":
            target_match = re.search(
                r'UPDATE\s+(["\w]+(?:\.["\w]+)?)',
                sql,
                re.IGNORECASE
            )

        if not target_match:
            return []

        target = target_match.group(1).replace('"', '')
        if '.' in target:
            target_db, target_tbl = target.split('.', 1)
        else:
            target_db = self.default_database
            target_tbl = target

        # Extract source tables from FROM clause
        from_matches = re.findall(
            r'FROM\s+(["\w]+(?:\.["\w]+)?)',
            sql,
            re.IGNORECASE
        )

        # Extract source tables from JOIN clauses
        join_matches = re.findall(
            r'JOIN\s+(["\w]+(?:\.["\w]+)?)',
            sql,
            re.IGNORECASE
        )

        source_tables = []
        for match in from_matches + join_matches:
            table = match.replace('"', '')
            if '.' in table:
                db, tbl = table.split('.', 1)
            else:
                db = self.default_database
                tbl = table
            source_tables.append((db, tbl))

        # If we can't determine specific column mappings, create table-level references
        # This is a low-confidence fallback
        if source_tables:
            # Create a generic lineage record indicating table relationship
            for source_db, source_tbl in source_tables:
                lineage.append(ColumnLineage(
                    source_database=source_db,
                    source_table=source_tbl,
                    source_column="*",  # Indicates unknown column mapping
                    target_database=target_db,
                    target_table=target_tbl,
                    target_column="*",
                    transformation_type="UNKNOWN",
                    confidence_score=self.CONFIDENCE_PATTERN,
                ))

        return lineage


# =============================================================================
# CLI for Testing
# =============================================================================

def main():
    """Test the parser with sample SQL."""
    import sys

    parser = TeradataSQLParser()

    # Sample SQL statements for testing
    test_cases = [
        # Simple INSERT...SELECT
        """
        INSERT INTO demo_user.STG_CUSTOMER (customer_id, full_name, email)
        SELECT
            customer_id,
            first_name || ' ' || last_name AS full_name,
            email
        FROM demo_user.SRC_CUSTOMER
        """,

        # INSERT with JOIN
        """
        INSERT INTO demo_user.FACT_SALES (date_sk, customer_sk, amount)
        SELECT
            d.date_sk,
            c.customer_sk,
            s.amount
        FROM demo_user.STG_SALES s
        JOIN demo_user.DIM_DATE d ON s.sale_date = d.full_date
        JOIN demo_user.DIM_CUSTOMER c ON s.customer_id = c.customer_id
        """,

        # CTAS
        """
        CREATE TABLE demo_user.SUMMARY_SALES AS (
            SELECT
                store_id,
                SUM(amount) AS total_sales,
                COUNT(*) AS transaction_count
            FROM demo_user.FACT_SALES
            GROUP BY store_id
        ) WITH DATA
        """,
    ]

    print("=" * 60)
    print("SQL Parser Test")
    print("=" * 60)

    for i, sql in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i} ---")
        print(f"SQL: {sql[:100]}...")

        try:
            lineage = parser.extract_column_lineage(sql)
            print(f"\nExtracted {len(lineage)} lineage records:")
            for record in lineage:
                print(f"  {record['source_database']}.{record['source_table']}.{record['source_column']}")
                print(f"    -> {record['target_database']}.{record['target_table']}.{record['target_column']}")
                print(f"    Type: {record['transformation_type']}, Confidence: {record['confidence_score']}")
        except Exception as e:
            print(f"ERROR: {e}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
