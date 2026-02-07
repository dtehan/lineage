#!/usr/bin/env python3
"""
Python Flask Backend for Lineage API
Implements the same API as the Go backend using teradatasql driver.

Reads configuration from .env file and environment variables.
Environment variables take precedence over .env file values.

DATABASE Environment Variables:
    TERADATA_HOST     - Teradata host (default: ClearScape test environment)
    TERADATA_USER     - Teradata username (default: demo_user)
    TERADATA_PASSWORD - Teradata password (REQUIRED)
    TERADATA_DATABASE - Default database (default: demo_user)

    Legacy aliases (deprecated): TD_HOST, TD_USER, TD_PASSWORD, TD_DATABASE

SERVER Environment Variables:
    API_PORT - Server port (default: 8080)
    PORT     - Legacy alias for API_PORT
"""

import os
import sys
import json
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS
import teradatasql

# Try to load .env file (python-dotenv is optional)
try:
    from dotenv import load_dotenv
    # Look for .env in project root (parent of lineage-api/)
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Also check current working directory
        load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, rely on environment variables


# Required credentials that must be provided (primary, fallback) - at least one must be set
REQUIRED_CREDENTIALS = [
    ("TERADATA_PASSWORD", "TD_PASSWORD"),  # At least one must be set
]


def validate_required_credentials():
    """
    Validate that all required credentials are set.
    Exits with code 1 if any required credentials are missing.
    """
    missing = []

    for primary, fallback in REQUIRED_CREDENTIALS:
        primary_val = os.environ.get(primary, "").strip()
        fallback_val = os.environ.get(fallback, "").strip()

        if not primary_val and not fallback_val:
            missing.append(f"{primary} (or {fallback})")

    if missing:
        print("ERROR: Missing required environment variables:", file=sys.stderr)
        for var in missing:
            print(f"  - {var}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Please set these in your environment or .env file.", file=sys.stderr)
        print("See .env.example for configuration template.", file=sys.stderr)
        sys.exit(1)


# Run validation at module load time (after dotenv loading)
validate_required_credentials()


app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3004", "http://localhost:5173"])

# Database configuration - supports both TD_* (database scripts) and TERADATA_* (Go server) prefixes
# Password is required - validation already ran, so at least one is set
DB_CONFIG = {
    "host": os.environ.get("TERADATA_HOST") or os.environ.get("TD_HOST", "test-sad3sstx4u4llczi.env.clearscape.teradata.com"),
    "user": os.environ.get("TERADATA_USER") or os.environ.get("TD_USER", "demo_user"),
    "password": os.environ.get("TERADATA_PASSWORD") or os.environ.get("TD_PASSWORD"),
    "database": os.environ.get("TERADATA_DATABASE") or os.environ.get("TD_DATABASE", "demo_user"),
}


def get_db_connection():
    """Create a database connection."""
    return teradatasql.connect(
        host=DB_CONFIG["host"],
        user=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        database=DB_CONFIG["database"],
    )


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


@app.route("/api/v1/assets/databases", methods=["GET"])
def list_databases():
    """List all databases with lineage data."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        d.database_id,
                        d.database_name,
                        COUNT(DISTINCT t.table_id) as table_count
                    FROM LIN_DATABASE d
                    LEFT JOIN LIN_TABLE t ON d.database_name = t.database_name AND t.is_active = 'Y'
                    WHERE d.is_active = 'Y'
                    GROUP BY d.database_id, d.database_name
                    ORDER BY d.database_name
                """)
                rows = cur.fetchall()
                databases = [
                    {
                        "id": row[0].strip() if row[0] else "",
                        "name": row[1].strip() if row[1] else "",
                        "tableCount": row[2] or 0
                    }
                    for row in rows
                ]
        return jsonify({"databases": databases})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/assets/databases/<database>/tables", methods=["GET"])
def list_tables(database):
    """List tables in a database."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        t.table_id,
                        t.table_name,
                        t.database_name,
                        COUNT(DISTINCT c.column_id) as column_count,
                        t.row_count,
                        t.table_kind
                    FROM LIN_TABLE t
                    LEFT JOIN LIN_COLUMN c ON t.database_name = c.database_name AND t.table_name = c.table_name AND c.is_active = 'Y'
                    WHERE UPPER(t.database_name) = UPPER(?)
                      AND t.is_active = 'Y'
                    GROUP BY t.table_id, t.table_name, t.database_name, t.row_count, t.table_kind
                    ORDER BY t.table_name
                """, [database])
                rows = cur.fetchall()
                tables = [
                    {
                        "id": row[0].strip() if row[0] else "",
                        "tableName": row[1].strip() if row[1] else "",
                        "databaseName": row[2].strip() if row[2] else "",
                        "tableKind": (row[5].strip() if row[5] else "T"),
                        "columnCount": row[3] or 0,
                        "rowCount": row[4] or 0
                    }
                    for row in rows
                ]
        return jsonify({"tables": tables})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/assets/databases/<database>/tables/<table>/columns", methods=["GET"])
def list_columns(database, table):
    """List columns in a table."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        column_id,
                        column_name,
                        column_type,
                        nullable,
                        comment_string
                    FROM LIN_COLUMN
                    WHERE UPPER(database_name) = UPPER(?)
                      AND UPPER(table_name) = UPPER(?)
                      AND is_active = 'Y'
                    ORDER BY column_position
                """, [database, table])
                rows = cur.fetchall()
                columns = [
                    {
                        "id": row[0].strip() if row[0] else "",
                        "columnName": row[1].strip() if row[1] else "",
                        "columnType": row[2].strip() if row[2] else "",
                        "nullable": row[3] == "Y" if row[3] else True,
                        "commentString": row[4].strip() if row[4] else "",
                        "databaseName": database,
                        "tableName": table,
                        "columnPosition": idx
                    }
                    for idx, row in enumerate(rows)
                ]
        return jsonify({"columns": columns})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def get_column_metadata(cur, column_id):
    """Get metadata for a column from LIN_COLUMN and LIN_TABLE tables."""
    parts = column_id.split(".")
    if len(parts) != 3:
        return None

    database, table, column = parts[0], parts[1], parts[2]
    cur.execute("""
        SELECT c.column_type, c.nullable, c.column_position, t.table_kind
        FROM LIN_COLUMN c
        LEFT JOIN LIN_TABLE t ON c.database_name = t.database_name AND c.table_name = t.table_name AND t.is_active = 'Y'
        WHERE UPPER(c.database_name) = UPPER(?)
          AND UPPER(c.table_name) = UPPER(?)
          AND UPPER(c.column_name) = UPPER(?)
          AND c.is_active = 'Y'
    """, [database, table, column])

    row = cur.fetchone()
    if row:
        return {
            "columnType": row[0].strip() if row[0] else "unknown",
            "nullable": row[1] == "Y" if row[1] else True,
            "columnPosition": row[2] if row[2] else 0,
            "tableKind": row[3].strip() if row[3] else "T"
        }
    return None


def get_column_lineage(cur, column_id, direction, max_depth):
    """Get lineage for a single column."""
    nodes = {}
    edges = []

    # Get upstream lineage if direction is upstream or both
    if direction in ("upstream", "both"):
        cur.execute("""
            WITH RECURSIVE upstream_lineage AS (
                SELECT
                    source_column_id,
                    source_database,
                    source_table,
                    source_column,
                    target_column_id,
                    target_database,
                    target_table,
                    target_column,
                    transformation_type,
                    confidence_score,
                    1 as depth,
                    CAST(target_column_id || '->' || source_column_id AS VARCHAR(10000)) as path
                FROM LIN_COLUMN_LINEAGE
                WHERE target_column_id = ?
                  AND is_active = 'Y'

                UNION ALL

                SELECT
                    l.source_column_id,
                    l.source_database,
                    l.source_table,
                    l.source_column,
                    l.target_column_id,
                    l.target_database,
                    l.target_table,
                    l.target_column,
                    l.transformation_type,
                    l.confidence_score,
                    u.depth + 1,
                    u.path || '->' || l.source_column_id
                FROM LIN_COLUMN_LINEAGE l
                INNER JOIN upstream_lineage u ON l.target_column_id = u.source_column_id
                WHERE l.is_active = 'Y'
                  AND u.depth < ?
                  AND POSITION(l.source_column_id IN u.path) = 0
            )
            SELECT DISTINCT
                source_column_id,
                source_database,
                source_table,
                source_column,
                target_column_id,
                target_database,
                target_table,
                target_column,
                transformation_type,
                confidence_score,
                depth
            FROM upstream_lineage
        """, [column_id, max_depth])

        for row in cur.fetchall():
            source_id = row[0].strip() if row[0] else ""
            target_id = row[4].strip() if row[4] else ""

            if source_id not in nodes:
                node = {
                    "id": source_id,
                    "type": "column",
                    "databaseName": row[1].strip() if row[1] else "",
                    "tableName": row[2].strip() if row[2] else "",
                    "columnName": row[3].strip() if row[3] else ""
                }
                metadata = get_column_metadata(cur, source_id)
                if metadata:
                    node["metadata"] = metadata
                nodes[source_id] = node

            if target_id not in nodes:
                node = {
                    "id": target_id,
                    "type": "column",
                    "databaseName": row[5].strip() if row[5] else "",
                    "tableName": row[6].strip() if row[6] else "",
                    "columnName": row[7].strip() if row[7] else ""
                }
                metadata = get_column_metadata(cur, target_id)
                if metadata:
                    node["metadata"] = metadata
                nodes[target_id] = node

            edge_id = f"{source_id}->{target_id}"
            edges.append({
                "id": edge_id,
                "source": source_id,
                "target": target_id,
                "transformationType": row[8].strip() if row[8] else "DIRECT",
                "confidenceScore": float(row[9]) if row[9] else 1.0
            })

    # Get downstream lineage if direction is downstream or both
    if direction in ("downstream", "both"):
        cur.execute("""
            WITH RECURSIVE downstream_lineage AS (
                SELECT
                    source_column_id,
                    source_database,
                    source_table,
                    source_column,
                    target_column_id,
                    target_database,
                    target_table,
                    target_column,
                    transformation_type,
                    confidence_score,
                    1 as depth,
                    CAST(source_column_id || '->' || target_column_id AS VARCHAR(10000)) as path
                FROM LIN_COLUMN_LINEAGE
                WHERE source_column_id = ?
                  AND is_active = 'Y'

                UNION ALL

                SELECT
                    l.source_column_id,
                    l.source_database,
                    l.source_table,
                    l.source_column,
                    l.target_column_id,
                    l.target_database,
                    l.target_table,
                    l.target_column,
                    l.transformation_type,
                    l.confidence_score,
                    d.depth + 1,
                    d.path || '->' || l.target_column_id
                FROM LIN_COLUMN_LINEAGE l
                INNER JOIN downstream_lineage d ON l.source_column_id = d.target_column_id
                WHERE l.is_active = 'Y'
                  AND d.depth < ?
                  AND POSITION(l.target_column_id IN d.path) = 0
            )
            SELECT DISTINCT
                source_column_id,
                source_database,
                source_table,
                source_column,
                target_column_id,
                target_database,
                target_table,
                target_column,
                transformation_type,
                confidence_score,
                depth
            FROM downstream_lineage
        """, [column_id, max_depth])

        for row in cur.fetchall():
            source_id = row[0].strip() if row[0] else ""
            target_id = row[4].strip() if row[4] else ""

            if source_id not in nodes:
                node = {
                    "id": source_id,
                    "type": "column",
                    "databaseName": row[1].strip() if row[1] else "",
                    "tableName": row[2].strip() if row[2] else "",
                    "columnName": row[3].strip() if row[3] else ""
                }
                metadata = get_column_metadata(cur, source_id)
                if metadata:
                    node["metadata"] = metadata
                nodes[source_id] = node

            if target_id not in nodes:
                node = {
                    "id": target_id,
                    "type": "column",
                    "databaseName": row[5].strip() if row[5] else "",
                    "tableName": row[6].strip() if row[6] else "",
                    "columnName": row[7].strip() if row[7] else ""
                }
                metadata = get_column_metadata(cur, target_id)
                if metadata:
                    node["metadata"] = metadata
                nodes[target_id] = node

            edge_id = f"{source_id}->{target_id}"
            if not any(e["source"] == source_id and e["target"] == target_id for e in edges):
                edges.append({
                    "id": edge_id,
                    "source": source_id,
                    "target": target_id,
                    "transformationType": row[8].strip() if row[8] else "DIRECT",
                    "confidenceScore": float(row[9]) if row[9] else 1.0
                })

    return nodes, edges


@app.route("/api/v1/lineage/<path:asset_id>", methods=["GET"])
def get_lineage(asset_id):
    """Get lineage graph for an asset."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    try:
        nodes = {}
        edges = []
        parts = asset_id.split(".")

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check if this is a table-level request (2 parts) or column-level (3 parts)
                if len(parts) == 2:
                    # Table-level lineage: aggregate lineage for all columns in the table
                    database, table = parts[0], parts[1]

                    # Add the table as a root node
                    table_id = f"{database}.{table}"
                    nodes[table_id] = {
                        "id": table_id,
                        "type": "table",
                        "databaseName": database,
                        "tableName": table
                    }

                    # Get all columns for this table
                    cur.execute("""
                        SELECT column_id
                        FROM LIN_COLUMN
                        WHERE UPPER(database_name) = UPPER(?)
                          AND UPPER(table_name) = UPPER(?)
                          AND is_active = 'Y'
                    """, [database, table])

                    column_ids = [row[0].strip() for row in cur.fetchall()]

                    # Get lineage for each column and merge results
                    for col_id in column_ids:
                        col_nodes, col_edges = get_column_lineage(cur, col_id, direction, max_depth)

                        # Merge nodes (dedup by ID)
                        for node_id, node in col_nodes.items():
                            if node_id not in nodes:
                                nodes[node_id] = node

                        # Merge edges (dedup by source+target)
                        for edge in col_edges:
                            if not any(e["source"] == edge["source"] and e["target"] == edge["target"] for e in edges):
                                edges.append(edge)

                    return jsonify({
                        "assetId": asset_id,
                        "graph": {
                            "nodes": list(nodes.values()),
                            "edges": edges
                        }
                    })

                # Column-level lineage (3 parts)
                nodes, edges = get_column_lineage(cur, asset_id, direction, max_depth)

                # Add the root node if not already present
                if asset_id not in nodes and len(parts) >= 3:
                    node = {
                        "id": asset_id,
                        "type": "column",
                        "databaseName": parts[0],
                        "tableName": parts[1],
                        "columnName": parts[2]
                    }
                    metadata = get_column_metadata(cur, asset_id)
                    if metadata:
                        node["metadata"] = metadata
                    nodes[asset_id] = node

        return jsonify({
            "assetId": asset_id,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/lineage/<path:asset_id>/upstream", methods=["GET"])
def get_upstream_lineage(asset_id):
    """Get upstream lineage for an asset."""
    max_depth = int(request.args.get("maxDepth", "10"))

    try:
        lineage = []

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    WITH RECURSIVE upstream_lineage AS (
                        SELECT
                            source_column_id,
                            source_database,
                            source_table,
                            source_column,
                            transformation_type,
                            confidence_score,
                            1 as depth,
                            CAST(? || '->' || source_column_id AS VARCHAR(10000)) as path
                        FROM LIN_COLUMN_LINEAGE
                        WHERE target_column_id = ?
                          AND is_active = 'Y'

                        UNION ALL

                        SELECT
                            l.source_column_id,
                            l.source_database,
                            l.source_table,
                            l.source_column,
                            l.transformation_type,
                            l.confidence_score,
                            u.depth + 1,
                            u.path || '->' || l.source_column_id
                        FROM LIN_COLUMN_LINEAGE l
                        INNER JOIN upstream_lineage u ON l.target_column_id = u.source_column_id
                        WHERE l.is_active = 'Y'
                          AND u.depth < ?
                          AND POSITION(l.source_column_id IN u.path) = 0
                    )
                    SELECT DISTINCT
                        source_column_id,
                        source_database,
                        source_table,
                        source_column,
                        transformation_type,
                        confidence_score,
                        depth,
                        path
                    FROM upstream_lineage
                    ORDER BY depth
                """, [asset_id, asset_id, max_depth])

                for row in cur.fetchall():
                    lineage.append({
                        "id": row[0].strip() if row[0] else "",
                        "database": row[1].strip() if row[1] else "",
                        "table": row[2].strip() if row[2] else "",
                        "column": row[3].strip() if row[3] else "",
                        "transformationType": row[4].strip() if row[4] else "DIRECT",
                        "confidence": float(row[5]) if row[5] else 1.0,
                        "depth": row[6]
                    })

        return jsonify({"lineage": lineage})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/lineage/<path:asset_id>/downstream", methods=["GET"])
def get_downstream_lineage(asset_id):
    """Get downstream lineage for an asset."""
    max_depth = int(request.args.get("maxDepth", "10"))

    try:
        lineage = []

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    WITH RECURSIVE downstream_lineage AS (
                        SELECT
                            target_column_id,
                            target_database,
                            target_table,
                            target_column,
                            transformation_type,
                            confidence_score,
                            1 as depth,
                            CAST(? || '->' || target_column_id AS VARCHAR(10000)) as path
                        FROM LIN_COLUMN_LINEAGE
                        WHERE source_column_id = ?
                          AND is_active = 'Y'

                        UNION ALL

                        SELECT
                            l.target_column_id,
                            l.target_database,
                            l.target_table,
                            l.target_column,
                            l.transformation_type,
                            l.confidence_score,
                            d.depth + 1,
                            d.path || '->' || l.target_column_id
                        FROM LIN_COLUMN_LINEAGE l
                        INNER JOIN downstream_lineage d ON l.source_column_id = d.target_column_id
                        WHERE l.is_active = 'Y'
                          AND d.depth < ?
                          AND POSITION(l.target_column_id IN d.path) = 0
                    )
                    SELECT DISTINCT
                        target_column_id,
                        target_database,
                        target_table,
                        target_column,
                        transformation_type,
                        confidence_score,
                        depth,
                        path
                    FROM downstream_lineage
                    ORDER BY depth
                """, [asset_id, asset_id, max_depth])

                for row in cur.fetchall():
                    lineage.append({
                        "id": row[0].strip() if row[0] else "",
                        "database": row[1].strip() if row[1] else "",
                        "table": row[2].strip() if row[2] else "",
                        "column": row[3].strip() if row[3] else "",
                        "transformationType": row[4].strip() if row[4] else "DIRECT",
                        "confidence": float(row[5]) if row[5] else 1.0,
                        "depth": row[6]
                    })

        return jsonify({"lineage": lineage})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/lineage/<path:asset_id>/impact", methods=["GET"])
def get_impact_analysis(asset_id):
    """Get impact analysis for an asset."""
    max_depth = int(request.args.get("maxDepth", "10"))

    try:
        impacted_assets = []
        by_database = {}
        by_depth = {}
        critical_count = 0

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    WITH RECURSIVE downstream_lineage AS (
                        SELECT
                            target_column_id,
                            target_database,
                            target_table,
                            target_column,
                            1 as depth,
                            CAST(? || '->' || target_column_id AS VARCHAR(10000)) as path
                        FROM LIN_COLUMN_LINEAGE
                        WHERE source_column_id = ?
                          AND is_active = 'Y'

                        UNION ALL

                        SELECT
                            l.target_column_id,
                            l.target_database,
                            l.target_table,
                            l.target_column,
                            d.depth + 1,
                            d.path || '->' || l.target_column_id
                        FROM LIN_COLUMN_LINEAGE l
                        INNER JOIN downstream_lineage d ON l.source_column_id = d.target_column_id
                        WHERE l.is_active = 'Y'
                          AND d.depth < ?
                          AND POSITION(l.target_column_id IN d.path) = 0
                    )
                    SELECT DISTINCT
                        target_column_id,
                        target_database,
                        target_table,
                        target_column,
                        depth,
                        path
                    FROM downstream_lineage
                    ORDER BY depth
                """, [asset_id, asset_id, max_depth])

                for row in cur.fetchall():
                    depth = row[4]
                    db = row[1].strip() if row[1] else ""
                    table = row[2].strip() if row[2] else ""
                    column = row[3].strip() if row[3] else ""

                    # Track by database
                    by_database[db] = by_database.get(db, 0) + 1

                    # Track by depth
                    by_depth[depth] = by_depth.get(depth, 0) + 1

                    # Critical if it's a FACT or RPT table
                    is_critical = "FACT" in table.upper() or "RPT" in table.upper()
                    if is_critical:
                        critical_count += 1

                    # Determine impact type based on depth
                    impact_type = "direct" if depth == 1 else "indirect"

                    impacted_assets.append({
                        "id": row[0].strip() if row[0] else "",
                        "databaseName": db,
                        "tableName": table,
                        "columnName": column,
                        "depth": depth,
                        "impactType": impact_type
                    })

        return jsonify({
            "assetId": asset_id,
            "impactedAssets": impacted_assets,
            "summary": {
                "totalImpacted": len(impacted_assets),
                "byDatabase": by_database,
                "byDepth": by_depth,
                "criticalCount": critical_count
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/lineage/database/<database>", methods=["GET"])
def get_database_lineage(database):
    """Get lineage graph for all tables in a database."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "3"))
    page = int(request.args.get("page", "1"))
    page_size = int(request.args.get("pageSize", "50"))

    try:
        nodes = {}
        edges = []

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get total count of tables in the database
                cur.execute("""
                    SELECT COUNT(DISTINCT table_name)
                    FROM LIN_TABLE
                    WHERE UPPER(database_name) = UPPER(?)
                      AND is_active = 'Y'
                """, [database])
                total_tables = cur.fetchone()[0] or 0

                # Get tables with pagination
                offset = (page - 1) * page_size
                cur.execute(f"""
                    SELECT table_id, table_name
                    FROM (
                        SELECT table_id, table_name,
                               ROW_NUMBER() OVER (ORDER BY table_name) as rn
                        FROM LIN_TABLE
                        WHERE UPPER(database_name) = UPPER(?)
                          AND is_active = 'Y'
                    ) t
                    WHERE rn > ? AND rn <= ?
                """, [database, offset, offset + page_size])

                tables = [(row[0].strip(), row[1].strip()) for row in cur.fetchall()]
                table_names = [t[1] for t in tables]

                if not table_names:
                    return jsonify({
                        "databaseName": database,
                        "graph": {"nodes": [], "edges": []},
                        "pagination": {
                            "page": page,
                            "pageSize": page_size,
                            "totalTables": total_tables,
                            "totalPages": (total_tables + page_size - 1) // page_size
                        }
                    })

                # First, add ALL columns from all tables in this page as nodes
                # This ensures all tables are shown even without lineage
                table_placeholders = ",".join(["?" for _ in table_names])
                table_params = [t.upper() for t in table_names]

                cur.execute(f"""
                    SELECT
                        c.column_id,
                        c.database_name,
                        c.table_name,
                        c.column_name,
                        c.column_type,
                        t.table_kind
                    FROM LIN_COLUMN c
                    LEFT JOIN LIN_TABLE t ON c.database_name = t.database_name AND c.table_name = t.table_name AND t.is_active = 'Y'
                    WHERE UPPER(c.database_name) = UPPER(?)
                      AND UPPER(c.table_name) IN ({table_placeholders})
                      AND c.is_active = 'Y'
                    ORDER BY c.table_name, c.column_position
                """, [database] + table_params)

                for row in cur.fetchall():
                    col_id = row[0].strip() if row[0] else ""
                    if col_id and col_id not in nodes:
                        nodes[col_id] = {
                            "id": col_id,
                            "type": "column",
                            "databaseName": row[1].strip() if row[1] else "",
                            "tableName": row[2].strip() if row[2] else "",
                            "columnName": row[3].strip() if row[3] else "",
                            "metadata": {
                                "columnType": row[4].strip() if row[4] else "unknown",
                                "tableKind": row[5].strip() if row[5] else "T"
                            }
                        }

                # Get all column IDs for tables in this page
                cur.execute(f"""
                    SELECT column_id
                    FROM LIN_COLUMN
                    WHERE UPPER(database_name) = UPPER(?)
                      AND UPPER(table_name) IN ({table_placeholders})
                      AND is_active = 'Y'
                """, [database] + table_params)

                column_ids = [row[0].strip() for row in cur.fetchall()]

                if column_ids:
                    col_placeholders = ",".join(["?" for _ in column_ids])

                    # Get upstream lineage using recursive CTE (traverse to max_depth)
                    if direction in ("upstream", "both"):
                        cur.execute(f"""
                            WITH RECURSIVE upstream_lineage AS (
                                SELECT
                                    source_column_id,
                                    source_database,
                                    source_table,
                                    source_column,
                                    target_column_id,
                                    target_database,
                                    target_table,
                                    target_column,
                                    transformation_type,
                                    confidence_score,
                                    1 as depth,
                                    CAST(target_column_id || '->' || source_column_id AS VARCHAR(10000)) as path
                                FROM LIN_COLUMN_LINEAGE
                                WHERE target_column_id IN ({col_placeholders})
                                  AND is_active = 'Y'

                                UNION ALL

                                SELECT
                                    l.source_column_id,
                                    l.source_database,
                                    l.source_table,
                                    l.source_column,
                                    l.target_column_id,
                                    l.target_database,
                                    l.target_table,
                                    l.target_column,
                                    l.transformation_type,
                                    l.confidence_score,
                                    u.depth + 1,
                                    u.path || '->' || l.source_column_id
                                FROM LIN_COLUMN_LINEAGE l
                                INNER JOIN upstream_lineage u ON l.target_column_id = u.source_column_id
                                WHERE l.is_active = 'Y'
                                  AND u.depth < ?
                                  AND POSITION(l.source_column_id IN u.path) = 0
                            )
                            SELECT DISTINCT
                                source_column_id,
                                source_database,
                                source_table,
                                source_column,
                                target_column_id,
                                target_database,
                                target_table,
                                target_column,
                                transformation_type,
                                confidence_score
                            FROM upstream_lineage
                        """, column_ids + [max_depth])

                        for row in cur.fetchall():
                            source_id = row[0].strip() if row[0] else ""
                            target_id = row[4].strip() if row[4] else ""

                            # Add source node (could be from another database)
                            if source_id and source_id not in nodes:
                                nodes[source_id] = {
                                    "id": source_id,
                                    "type": "column",
                                    "databaseName": row[1].strip() if row[1] else "",
                                    "tableName": row[2].strip() if row[2] else "",
                                    "columnName": row[3].strip() if row[3] else ""
                                }

                            # Add target node (could be from another database)
                            if target_id and target_id not in nodes:
                                nodes[target_id] = {
                                    "id": target_id,
                                    "type": "column",
                                    "databaseName": row[5].strip() if row[5] else "",
                                    "tableName": row[6].strip() if row[6] else "",
                                    "columnName": row[7].strip() if row[7] else ""
                                }

                            if source_id and target_id:
                                edge_key = f"{source_id}->{target_id}"
                                if not any(e["id"] == edge_key for e in edges):
                                    edges.append({
                                        "id": edge_key,
                                        "source": source_id,
                                        "target": target_id,
                                        "transformationType": row[8].strip() if row[8] else "DIRECT",
                                        "confidenceScore": float(row[9]) if row[9] else 1.0
                                    })

                    # Get downstream lineage using recursive CTE (traverse to max_depth)
                    if direction in ("downstream", "both"):
                        cur.execute(f"""
                            WITH RECURSIVE downstream_lineage AS (
                                SELECT
                                    source_column_id,
                                    source_database,
                                    source_table,
                                    source_column,
                                    target_column_id,
                                    target_database,
                                    target_table,
                                    target_column,
                                    transformation_type,
                                    confidence_score,
                                    1 as depth,
                                    CAST(source_column_id || '->' || target_column_id AS VARCHAR(10000)) as path
                                FROM LIN_COLUMN_LINEAGE
                                WHERE source_column_id IN ({col_placeholders})
                                  AND is_active = 'Y'

                                UNION ALL

                                SELECT
                                    l.source_column_id,
                                    l.source_database,
                                    l.source_table,
                                    l.source_column,
                                    l.target_column_id,
                                    l.target_database,
                                    l.target_table,
                                    l.target_column,
                                    l.transformation_type,
                                    l.confidence_score,
                                    d.depth + 1,
                                    d.path || '->' || l.target_column_id
                                FROM LIN_COLUMN_LINEAGE l
                                INNER JOIN downstream_lineage d ON l.source_column_id = d.target_column_id
                                WHERE l.is_active = 'Y'
                                  AND d.depth < ?
                                  AND POSITION(l.target_column_id IN d.path) = 0
                            )
                            SELECT DISTINCT
                                source_column_id,
                                source_database,
                                source_table,
                                source_column,
                                target_column_id,
                                target_database,
                                target_table,
                                target_column,
                                transformation_type,
                                confidence_score
                            FROM downstream_lineage
                        """, column_ids + [max_depth])

                        for row in cur.fetchall():
                            source_id = row[0].strip() if row[0] else ""
                            target_id = row[4].strip() if row[4] else ""

                            # Add source node (could be from another database)
                            if source_id and source_id not in nodes:
                                nodes[source_id] = {
                                    "id": source_id,
                                    "type": "column",
                                    "databaseName": row[1].strip() if row[1] else "",
                                    "tableName": row[2].strip() if row[2] else "",
                                    "columnName": row[3].strip() if row[3] else ""
                                }

                            # Add target node (could be from another database)
                            if target_id and target_id not in nodes:
                                nodes[target_id] = {
                                    "id": target_id,
                                    "type": "column",
                                    "databaseName": row[5].strip() if row[5] else "",
                                    "tableName": row[6].strip() if row[6] else "",
                                    "columnName": row[7].strip() if row[7] else ""
                                }

                            if source_id and target_id:
                                edge_key = f"{source_id}->{target_id}"
                                if not any(e["id"] == edge_key for e in edges):
                                    edges.append({
                                        "id": edge_key,
                                        "source": source_id,
                                        "target": target_id,
                                        "transformationType": row[8].strip() if row[8] else "DIRECT",
                                        "confidenceScore": float(row[9]) if row[9] else 1.0
                                    })

        return jsonify({
            "databaseName": database,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            },
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "totalTables": total_tables,
                "totalPages": (total_tables + page_size - 1) // page_size
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/lineage/all-databases", methods=["GET"])
def get_all_databases_lineage():
    """Get lineage graph for all tables across all databases."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "2"))
    page = int(request.args.get("page", "1"))
    page_size = int(request.args.get("pageSize", "20"))
    database_filter = request.args.getlist("database")

    try:
        nodes = {}
        edges = []

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Build database filter clause for LIN_TABLE
                db_filter_clause = ""
                db_params = []
                if database_filter:
                    placeholders = ",".join(["?" for _ in database_filter])
                    db_filter_clause = f"AND UPPER(database_name) IN ({placeholders})"
                    db_params = [db.upper() for db in database_filter]

                # Get total count of tables
                cur.execute(f"""
                    SELECT COUNT(DISTINCT table_id)
                    FROM LIN_TABLE
                    WHERE is_active = 'Y'
                    {db_filter_clause}
                """, db_params)
                total_tables = cur.fetchone()[0] or 0

                # Get tables with pagination
                offset = (page - 1) * page_size
                cur.execute(f"""
                    SELECT table_id, database_name, table_name
                    FROM (
                        SELECT table_id, database_name, table_name,
                               ROW_NUMBER() OVER (ORDER BY database_name, table_name) as rn
                        FROM LIN_TABLE
                        WHERE is_active = 'Y'
                        {db_filter_clause}
                    ) t
                    WHERE rn > ? AND rn <= ?
                """, db_params + [offset, offset + page_size])

                tables = [(row[0].strip(), row[1].strip(), row[2].strip()) for row in cur.fetchall()]

                if not tables:
                    return jsonify({
                        "graph": {"nodes": [], "edges": []},
                        "pagination": {
                            "page": page,
                            "pageSize": page_size,
                            "totalTables": total_tables,
                            "totalPages": (total_tables + page_size - 1) // page_size
                        },
                        "appliedFilters": {
                            "databases": database_filter if database_filter else "all"
                        }
                    })

                # Build efficient single query to get all lineage for these tables
                # Group tables by database for the query
                db_table_pairs = [(t[1].upper(), t[2].upper()) for t in tables]

                # First, add all columns from selected tables as nodes with tableKind
                col_conditions = []
                col_params = []
                for db, tbl in db_table_pairs:
                    col_conditions.append("(UPPER(c.database_name) = ? AND UPPER(c.table_name) = ?)")
                    col_params.extend([db, tbl])

                col_where = " OR ".join(col_conditions)

                cur.execute(f"""
                    SELECT
                        c.column_id,
                        c.database_name,
                        c.table_name,
                        c.column_name,
                        c.column_type,
                        t.table_kind
                    FROM LIN_COLUMN c
                    LEFT JOIN LIN_TABLE t ON c.database_name = t.database_name AND c.table_name = t.table_name AND t.is_active = 'Y'
                    WHERE c.is_active = 'Y'
                      AND ({col_where})
                    ORDER BY c.database_name, c.table_name, c.column_position
                """, col_params)

                for row in cur.fetchall():
                    col_id = row[0].strip() if row[0] else ""
                    if col_id and col_id not in nodes:
                        nodes[col_id] = {
                            "id": col_id,
                            "type": "column",
                            "databaseName": row[1].strip() if row[1] else "",
                            "tableName": row[2].strip() if row[2] else "",
                            "columnName": row[3].strip() if row[3] else "",
                            "metadata": {
                                "columnType": row[4].strip() if row[4] else "unknown",
                                "tableKind": row[5].strip() if row[5] else "T"
                            }
                        }

                # Get all column IDs from selected tables for recursive traversal
                column_ids = list(nodes.keys())

                if column_ids:
                    col_placeholders = ",".join(["?" for _ in column_ids])

                    # Get upstream lineage using recursive CTE (traverse to max_depth)
                    if direction in ("upstream", "both"):
                        cur.execute(f"""
                            WITH RECURSIVE upstream_lineage AS (
                                SELECT
                                    source_column_id,
                                    source_database,
                                    source_table,
                                    source_column,
                                    target_column_id,
                                    target_database,
                                    target_table,
                                    target_column,
                                    transformation_type,
                                    confidence_score,
                                    1 as depth,
                                    CAST(target_column_id || '->' || source_column_id AS VARCHAR(10000)) as path
                                FROM LIN_COLUMN_LINEAGE
                                WHERE target_column_id IN ({col_placeholders})
                                  AND is_active = 'Y'

                                UNION ALL

                                SELECT
                                    l.source_column_id,
                                    l.source_database,
                                    l.source_table,
                                    l.source_column,
                                    l.target_column_id,
                                    l.target_database,
                                    l.target_table,
                                    l.target_column,
                                    l.transformation_type,
                                    l.confidence_score,
                                    u.depth + 1,
                                    u.path || '->' || l.source_column_id
                                FROM LIN_COLUMN_LINEAGE l
                                INNER JOIN upstream_lineage u ON l.target_column_id = u.source_column_id
                                WHERE l.is_active = 'Y'
                                  AND u.depth < ?
                                  AND POSITION(l.source_column_id IN u.path) = 0
                            )
                            SELECT DISTINCT
                                source_column_id,
                                source_database,
                                source_table,
                                source_column,
                                target_column_id,
                                target_database,
                                target_table,
                                target_column,
                                transformation_type,
                                confidence_score
                            FROM upstream_lineage
                        """, column_ids + [max_depth])

                        for row in cur.fetchall():
                            source_id = row[0].strip() if row[0] else ""
                            target_id = row[4].strip() if row[4] else ""

                            # Add source node (could be from another database)
                            if source_id and source_id not in nodes:
                                nodes[source_id] = {
                                    "id": source_id,
                                    "type": "column",
                                    "databaseName": row[1].strip() if row[1] else "",
                                    "tableName": row[2].strip() if row[2] else "",
                                    "columnName": row[3].strip() if row[3] else ""
                                }

                            # Add target node (could be from another database)
                            if target_id and target_id not in nodes:
                                nodes[target_id] = {
                                    "id": target_id,
                                    "type": "column",
                                    "databaseName": row[5].strip() if row[5] else "",
                                    "tableName": row[6].strip() if row[6] else "",
                                    "columnName": row[7].strip() if row[7] else ""
                                }

                            if source_id and target_id:
                                edge_key = f"{source_id}->{target_id}"
                                if not any(e["id"] == edge_key for e in edges):
                                    edges.append({
                                        "id": edge_key,
                                        "source": source_id,
                                        "target": target_id,
                                        "transformationType": row[8].strip() if row[8] else "DIRECT",
                                        "confidenceScore": float(row[9]) if row[9] else 1.0
                                    })

                    # Get downstream lineage using recursive CTE (traverse to max_depth)
                    if direction in ("downstream", "both"):
                        cur.execute(f"""
                            WITH RECURSIVE downstream_lineage AS (
                                SELECT
                                    source_column_id,
                                    source_database,
                                    source_table,
                                    source_column,
                                    target_column_id,
                                    target_database,
                                    target_table,
                                    target_column,
                                    transformation_type,
                                    confidence_score,
                                    1 as depth,
                                    CAST(source_column_id || '->' || target_column_id AS VARCHAR(10000)) as path
                                FROM LIN_COLUMN_LINEAGE
                                WHERE source_column_id IN ({col_placeholders})
                                  AND is_active = 'Y'

                                UNION ALL

                                SELECT
                                    l.source_column_id,
                                    l.source_database,
                                    l.source_table,
                                    l.source_column,
                                    l.target_column_id,
                                    l.target_database,
                                    l.target_table,
                                    l.target_column,
                                    l.transformation_type,
                                    l.confidence_score,
                                    d.depth + 1,
                                    d.path || '->' || l.target_column_id
                                FROM LIN_COLUMN_LINEAGE l
                                INNER JOIN downstream_lineage d ON l.source_column_id = d.target_column_id
                                WHERE l.is_active = 'Y'
                                  AND d.depth < ?
                                  AND POSITION(l.target_column_id IN d.path) = 0
                            )
                            SELECT DISTINCT
                                source_column_id,
                                source_database,
                                source_table,
                                source_column,
                                target_column_id,
                                target_database,
                                target_table,
                                target_column,
                                transformation_type,
                                confidence_score
                            FROM downstream_lineage
                        """, column_ids + [max_depth])

                        for row in cur.fetchall():
                            source_id = row[0].strip() if row[0] else ""
                            target_id = row[4].strip() if row[4] else ""

                            # Add source node (could be from another database)
                            if source_id and source_id not in nodes:
                                nodes[source_id] = {
                                    "id": source_id,
                                    "type": "column",
                                    "databaseName": row[1].strip() if row[1] else "",
                                    "tableName": row[2].strip() if row[2] else "",
                                    "columnName": row[3].strip() if row[3] else ""
                                }

                            # Add target node (could be from another database)
                            if target_id and target_id not in nodes:
                                nodes[target_id] = {
                                    "id": target_id,
                                    "type": "column",
                                    "databaseName": row[5].strip() if row[5] else "",
                                    "tableName": row[6].strip() if row[6] else "",
                                    "columnName": row[7].strip() if row[7] else ""
                                }

                            if source_id and target_id:
                                edge_key = f"{source_id}->{target_id}"
                                if not any(e["id"] == edge_key for e in edges):
                                    edges.append({
                                        "id": edge_key,
                                        "source": source_id,
                                        "target": target_id,
                                        "transformationType": row[8].strip() if row[8] else "DIRECT",
                                        "confidenceScore": float(row[9]) if row[9] else 1.0
                                    })

        return jsonify({
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            },
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "totalTables": total_tables,
                "totalPages": (total_tables + page_size - 1) // page_size
            },
            "appliedFilters": {
                "databases": database_filter if database_filter else "all"
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/search", methods=["GET"])
def search():
    """Search for assets."""
    query = request.args.get("q", "")
    asset_type = request.args.getlist("type")
    limit = int(request.args.get("limit", "50"))

    if not query or len(query) < 2:
        return jsonify({"error": "Query must be at least 2 characters"}), 400

    try:
        results = []
        search_pattern = f"%{query}%"

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Search databases
                if not asset_type or "database" in asset_type:
                    cur.execute(f"""
                        SELECT TOP {limit}
                            database_id,
                            database_name,
                            'database' as asset_type
                        FROM LIN_DATABASE
                        WHERE database_name LIKE ?
                    """, [search_pattern])

                    for row in cur.fetchall():
                        results.append({
                            "id": row[0].strip() if row[0] else "",
                            "type": "database",
                            "databaseName": row[1].strip() if row[1] else "",
                            "matchedOn": "database_name",
                            "score": 0.9
                        })

                # Search tables
                if not asset_type or "table" in asset_type:
                    cur.execute(f"""
                        SELECT TOP {limit}
                            table_id,
                            table_name,
                            database_name,
                            'table' as asset_type
                        FROM LIN_TABLE
                        WHERE table_name LIKE ? OR database_name LIKE ?
                    """, [search_pattern, search_pattern])

                    for row in cur.fetchall():
                        results.append({
                            "id": row[0].strip() if row[0] else "",
                            "type": "table",
                            "databaseName": row[2].strip() if row[2] else "",
                            "tableName": row[1].strip() if row[1] else "",
                            "matchedOn": "table_name",
                            "score": 0.85
                        })

                # Search columns
                if not asset_type or "column" in asset_type:
                    cur.execute(f"""
                        SELECT TOP {limit}
                            column_id,
                            column_name,
                            table_name,
                            database_name,
                            'column' as asset_type
                        FROM LIN_COLUMN
                        WHERE column_name LIKE ? OR table_name LIKE ?
                    """, [search_pattern, search_pattern])

                    for row in cur.fetchall():
                        results.append({
                            "id": row[0].strip() if row[0] else "",
                            "type": "column",
                            "databaseName": row[3].strip() if row[3] else "",
                            "tableName": row[2].strip() if row[2] else "",
                            "columnName": row[1].strip() if row[1] else "",
                            "matchedOn": "column_name",
                            "score": 0.8
                        })

        # Sort by relevance and limit
        results.sort(key=lambda x: x["score"], reverse=True)
        results = results[:limit]

        return jsonify({
            "results": results,
            "total": len(results),
            "query": query
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================================================
# API v2 - OpenLineage Aligned Routes
# ============================================================================

@app.route("/api/v2/openlineage/namespaces", methods=["GET"])
def list_namespaces():
    """List all OpenLineage namespaces."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
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
                namespaces = [
                    {
                        "id": row[0].strip() if row[0] else "",
                        "uri": row[1].strip() if row[1] else "",
                        "description": row[2].strip() if row[2] else "",
                        "specVersion": row[3].strip() if row[3] else "2-0-2",
                        "createdAt": row[4].isoformat() if row[4] else None
                    }
                    for row in rows
                ]
        return jsonify({"namespaces": namespaces})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/namespaces/<namespace_id>", methods=["GET"])
def get_namespace(namespace_id):
    """Get a specific OpenLineage namespace."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
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
                    return jsonify({"error": "Namespace not found"}), 404

                namespace = {
                    "id": row[0].strip() if row[0] else "",
                    "uri": row[1].strip() if row[1] else "",
                    "description": row[2].strip() if row[2] else "",
                    "specVersion": row[3].strip() if row[3] else "2-0-2",
                    "createdAt": row[4].isoformat() if row[4] else None
                }
        return jsonify(namespace)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/namespaces/<namespace_id>/datasets", methods=["GET"])
def list_datasets(namespace_id):
    """List datasets in a namespace."""
    limit = int(request.args.get("limit", "100"))
    offset = int(request.args.get("offset", "0"))

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get total count
                cur.execute("""
                    SELECT COUNT(*)
                    FROM OL_DATASET
                    WHERE namespace_id = ?
                """, [namespace_id])
                total = cur.fetchone()[0] or 0

                # Get datasets with pagination using ROW_NUMBER (Teradata native)
                cur.execute("""
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
                        WHERE d.namespace_id = ?
                    ) t
                    WHERE rn > ? AND rn <= ?
                """, [namespace_id, offset, offset + limit])

                rows = cur.fetchall()
                datasets = [
                    {
                        "id": row[0].strip() if row[0] else "",
                        "name": row[1].strip() if row[1] else "",
                        "namespace": row[3].strip() if row[3] else "",  # namespace_uri
                        "description": row[4].strip() if row[4] else "",
                        "sourceType": row[5].strip() if row[5] else None,
                        "createdAt": row[6].isoformat() if row[6] else None,
                        "updatedAt": row[7].isoformat() if row[7] else None
                    }
                    for row in rows
                ]

        return jsonify({
            "datasets": datasets,
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/datasets/<path:dataset_id>", methods=["GET"])
def get_dataset(dataset_id):
    """Get a specific dataset with its fields."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
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
                    return jsonify({"error": "Dataset not found"}), 404

                dataset = {
                    "id": row[0].strip() if row[0] else "",
                    "name": row[1].strip() if row[1] else "",
                    "namespace": row[3].strip() if row[3] else "",  # namespace_uri
                    "description": row[4].strip() if row[4] else "",
                    "sourceType": row[5].strip() if row[5] else None,
                    "createdAt": row[6].isoformat() if row[6] else None,
                    "updatedAt": row[7].isoformat() if row[7] else None
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
                        "id": row[0].strip() if row[0] else "",
                        "name": row[1].strip() if row[1] else "",
                        "type": row[2].strip() if row[2] else None,
                        "description": row[3].strip() if row[3] else None,
                        "ordinalPosition": row[4] if row[4] is not None else 0,
                        "nullable": row[5] == 'Y' if row[5] else True
                    }
                    for row in cur.fetchall()
                ]

                dataset["fields"] = fields

        return jsonify(dataset)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/datasets/<path:dataset_id>/statistics", methods=["GET"])
def get_dataset_statistics(dataset_id):
    """Get statistics for a dataset (table/view)."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Verify dataset exists in OL_DATASET (match by dataset_id OR name)
                cur.execute("""
                    SELECT dataset_id, "name", source_type FROM OL_DATASET
                    WHERE dataset_id = ? OR "name" = ?
                """, [dataset_id, dataset_id])
                ds_row = cur.fetchone()
                if not ds_row:
                    return jsonify({"error": "Dataset not found"}), 404
                resolved_dataset_id = ds_row[0]
                resolved_name = ds_row[1]

                # Parse database.table from resolved dataset name
                name_part = resolved_name.strip() if resolved_name else (dataset_id.split("/", 1)[1] if "/" in dataset_id else dataset_id)
                parts = name_part.split(".", 1)
                if len(parts) != 2:
                    return jsonify({"error": "Dataset not found"}), 404
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
                    return jsonify({"error": "Dataset not found"}), 404

                table_kind = tab_row[1].strip() if tab_row[1] else ""
                source_type = "VIEW" if table_kind == "V" else "TABLE"

                result = {
                    "datasetId": resolved_dataset_id,
                    "databaseName": db_name,
                    "tableName": tab_row[0] if tab_row[0] else table_name,
                    "sourceType": source_type,
                    "creatorName": tab_row[2] if tab_row[2] else None,
                    "createTimestamp": tab_row[3].isoformat() if tab_row[3] else None,
                    "lastAlterTimestamp": tab_row[4].isoformat() if tab_row[4] else None,
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

        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/v2/openlineage/datasets/<path:dataset_id>/ddl", methods=["GET"])
def get_dataset_ddl(dataset_id):
    """Get DDL/definition for a dataset (table/view)."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Verify dataset exists in OL_DATASET (match by dataset_id OR name)
                cur.execute("""
                    SELECT dataset_id, "name", source_type FROM OL_DATASET
                    WHERE dataset_id = ? OR "name" = ?
                """, [dataset_id, dataset_id])
                ds_row = cur.fetchone()
                if not ds_row:
                    return jsonify({"error": "Dataset not found"}), 404
                resolved_dataset_id = ds_row[0]
                resolved_name = ds_row[1]

                # Parse database.table from resolved dataset name
                name_part = resolved_name.strip() if resolved_name else (dataset_id.split("/", 1)[1] if "/" in dataset_id else dataset_id)
                parts = name_part.split(".", 1)
                if len(parts) != 2:
                    return jsonify({"error": "Dataset not found"}), 404
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
                        table_kind = tab_row[0].strip() if tab_row[0] else ""
                        table_comment = tab_row[1] if tab_row[1] else None
                        if tab_row[2]:
                            view_sql = tab_row[2].strip() if isinstance(tab_row[2], str) else str(tab_row[2]).strip()
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
                        table_kind = tab_row[0].strip() if tab_row[0] else ""
                        table_comment = tab_row[1] if tab_row[1] else None
                        if tab_row[2]:
                            view_sql = tab_row[2].strip() if isinstance(tab_row[2], str) else str(tab_row[2]).strip()
                            truncated = len(view_sql) >= 12500

                if table_kind is None:
                    return jsonify({"error": "Dataset not found"}), 404

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
                        col_name = row[0].strip() if row[0] else ""
                        col_comment = row[1].strip() if row[1] else ""
                        if col_name and col_comment:
                            result["columnComments"][col_name] = col_comment
                except Exception:
                    pass  # Permission issue, return empty column comments

        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/v2/openlineage/datasets/search", methods=["GET"])
def search_datasets():
    """Search for datasets."""
    query = request.args.get("q", "")
    limit = int(request.args.get("limit", "50"))

    if not query or len(query) < 2:
        return jsonify({"error": "Query must be at least 2 characters"}), 400

    try:
        search_pattern = f"%{query}%"

        with get_db_connection() as conn:
            with conn.cursor() as cur:
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
                datasets = [
                    {
                        "id": row[0].strip() if row[0] else "",
                        "name": row[1].strip() if row[1] else "",
                        "namespace": row[3].strip() if row[3] else "",  # namespace_uri
                        "description": row[4].strip() if row[4] else "",
                        "sourceType": row[5].strip() if row[5] else None,
                        "createdAt": row[6].isoformat() if row[6] else None,
                        "updatedAt": row[7].isoformat() if row[7] else None
                    }
                    for row in rows
                ]

        return jsonify({
            "datasets": datasets,
            "query": query,
            "count": len(datasets)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/search", methods=["GET"])
def unified_search():
    """Unified search for both databases (extracted from dataset names) and datasets."""
    query = request.args.get("q", "")
    limit = int(request.args.get("limit", "50"))

    if not query or len(query) < 2:
        return jsonify({"error": "Query must be at least 2 characters"}), 400

    try:
        search_pattern = f"%{query}%"

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Search datasets
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
                        "id": row[0].strip() if row[0] else "",
                        "name": row[1].strip() if row[1] else "",
                        "namespace": row[3].strip() if row[3] else "",
                        "description": row[4].strip() if row[4] else "",
                        "sourceType": row[5].strip() if row[5] else None,
                        "createdAt": row[6].isoformat() if row[6] else None,
                        "updatedAt": row[7].isoformat() if row[7] else None
                    }
                    for row in dataset_rows
                ]

                # Extract unique databases from dataset names and filter by query
                databases_dict = {}
                for dataset in datasets:
                    # Parse database name from dataset name (e.g., "demo_user.customer" -> "demo_user")
                    parts = dataset["name"].split(".")
                    if len(parts) > 1:
                        db_name = parts[0]
                        # Only include if database name matches query
                        if query.lower() in db_name.lower():
                            if db_name not in databases_dict:
                                databases_dict[db_name] = {
                                    "name": db_name,
                                    "namespace": dataset["namespace"],
                                    "tableCount": 0
                                }
                            databases_dict[db_name]["tableCount"] += 1

                databases = list(databases_dict.values())
                databases.sort(key=lambda x: x["name"])

        return jsonify({
            "databases": databases,
            "datasets": datasets,
            "query": query,
            "totalCount": len(databases) + len(datasets),
            "databaseCount": len(databases),
            "datasetCount": len(datasets)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/lineage/<path:dataset_id>/<field_name>", methods=["GET"])
def get_openlineage_lineage(dataset_id, field_name):
    """Get lineage graph for a dataset field using OpenLineage tables."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    try:
        nodes = {}
        edges = []

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get the dataset name for the requested dataset_id
                cur.execute("""
                    SELECT "name", namespace_id
                    FROM OL_DATASET
                    WHERE dataset_id = ?
                """, [dataset_id])

                dataset_row = cur.fetchone()
                if not dataset_row:
                    return jsonify({"error": "Dataset not found"}), 404

                dataset_name = dataset_row[0].strip() if dataset_row[0] else ""

                # OL_COLUMN_LINEAGE uses string columns (source_dataset, source_field, etc.)
                # not foreign key references, so we query by dataset name + field name

                # Get upstream lineage if requested
                if direction in ("upstream", "both"):
                    cur.execute("""
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
                                CAST(target_dataset || '.' || target_field || '->' || source_dataset || '.' || source_field AS VARCHAR(10000)) as path
                            FROM OL_COLUMN_LINEAGE
                            WHERE target_dataset = ?
                              AND UPPER(target_field) = UPPER(?)
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
                                ON cl.target_dataset = ul.source_dataset
                                AND cl.target_field = ul.source_field
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
                            transformation_type
                        FROM upstream_lineage
                    """, [dataset_name, field_name, max_depth])

                    for row in cur.fetchall():
                        source_key = f"{row[1]}.{row[2]}"
                        target_key = f"{row[4]}.{row[5]}"

                        # Add source node
                        if source_key not in nodes:
                            nodes[source_key] = {
                                "id": source_key,
                                "type": "field",
                                "name": row[2].strip() if row[2] else "",
                                "dataset": {
                                    "name": row[1].strip() if row[1] else "",
                                    "namespace": row[0].strip() if row[0] else ""
                                }
                            }

                        # Add target node
                        if target_key not in nodes:
                            nodes[target_key] = {
                                "id": target_key,
                                "type": "field",
                                "name": row[5].strip() if row[5] else "",
                                "dataset": {
                                    "name": row[4].strip() if row[4] else "",
                                    "namespace": row[3].strip() if row[3] else ""
                                }
                            }

                        # Add edge
                        edge_id = f"{source_key}->{target_key}"
                        if not any(e["id"] == edge_id for e in edges):
                            edges.append({
                                "id": edge_id,
                                "source": source_key,
                                "target": target_key,
                                "transformationType": row[6].strip() if row[6] else "DIRECT"
                            })

                # Get downstream lineage if requested
                if direction in ("downstream", "both"):
                    cur.execute("""
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
                                CAST(source_dataset || '.' || source_field || '->' || target_dataset || '.' || target_field AS VARCHAR(10000)) as path
                            FROM OL_COLUMN_LINEAGE
                            WHERE source_dataset = ?
                              AND UPPER(source_field) = UPPER(?)
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
                                ON cl.source_dataset = dl.target_dataset
                                AND cl.source_field = dl.target_field
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
                            transformation_type
                        FROM downstream_lineage
                    """, [dataset_name, field_name, max_depth])

                    for row in cur.fetchall():
                        source_key = f"{row[1]}.{row[2]}"
                        target_key = f"{row[4]}.{row[5]}"

                        # Add source node
                        if source_key not in nodes:
                            nodes[source_key] = {
                                "id": source_key,
                                "type": "field",
                                "name": row[2].strip() if row[2] else "",
                                "dataset": {
                                    "name": row[1].strip() if row[1] else "",
                                    "namespace": row[0].strip() if row[0] else ""
                                }
                            }

                        # Add target node
                        if target_key not in nodes:
                            nodes[target_key] = {
                                "id": target_key,
                                "type": "field",
                                "name": row[5].strip() if row[5] else "",
                                "dataset": {
                                    "name": row[4].strip() if row[4] else "",
                                    "namespace": row[3].strip() if row[3] else ""
                                }
                            }

                        # Add edge
                        edge_id = f"{source_key}->{target_key}"
                        if not any(e["id"] == edge_id for e in edges):
                            edges.append({
                                "id": edge_id,
                                "source": source_key,
                                "target": target_key,
                                "transformationType": row[6].strip() if row[6] else "DIRECT"
                            })

                # Add the root field node if not already present
                root_key = f"{dataset_name}.{field_name}"
                if root_key not in nodes:
                    # Get namespace for this dataset
                    cur.execute("""
                        SELECT n.namespace_uri
                        FROM OL_DATASET d
                        JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                        WHERE d.dataset_id = ?
                    """, [dataset_id])

                    ns_row = cur.fetchone()
                    namespace = ns_row[0].strip() if ns_row and ns_row[0] else ""

                    nodes[root_key] = {
                        "id": root_key,
                        "type": "field",
                        "name": field_name,
                        "dataset": {
                            "name": dataset_name,
                            "namespace": namespace
                        }
                    }

        return jsonify({
            "datasetId": dataset_id,
            "fieldName": field_name,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/lineage/table/<path:dataset_id>", methods=["GET"])
def get_openlineage_table_lineage(dataset_id):
    """Get lineage graph for all fields in a dataset (table-level lineage)."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    try:
        nodes = {}
        edges = []

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get the dataset name and namespace
                cur.execute("""
                    SELECT d."name", d.namespace_id, n.namespace_uri
                    FROM OL_DATASET d
                    JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                    WHERE d.dataset_id = ?
                """, [dataset_id])

                dataset_row = cur.fetchone()
                if not dataset_row:
                    return jsonify({"error": "Dataset not found"}), 404

                dataset_name = dataset_row[0].strip() if dataset_row[0] else ""
                namespace_uri = dataset_row[2].strip() if dataset_row[2] else ""

                # Get all fields for this dataset
                cur.execute("""
                    SELECT field_name
                    FROM OL_DATASET_FIELD
                    WHERE dataset_id = ?
                    ORDER BY ordinal_position
                """, [dataset_id])

                fields = [row[0].strip() if row[0] else "" for row in cur.fetchall()]

                if not fields:
                    return jsonify({"error": "No fields found for dataset"}), 404

                # For each field, get its lineage
                for field_name in fields:
                    # Add the field as a root node
                    root_key = f"{dataset_name}.{field_name}"
                    if root_key not in nodes:
                        nodes[root_key] = {
                            "id": root_key,
                            "type": "field",
                            "name": field_name,
                            "dataset": {
                                "name": dataset_name,
                                "namespace": namespace_uri
                            }
                        }

                    # Get upstream lineage if requested
                    if direction in ("upstream", "both"):
                        cur.execute("""
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
                                    CAST(target_dataset || '.' || target_field || '->' || source_dataset || '.' || source_field AS VARCHAR(10000)) as path
                                FROM OL_COLUMN_LINEAGE
                                WHERE target_dataset = ?
                                  AND UPPER(target_field) = UPPER(?)
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
                                    ON cl.target_dataset = ul.source_dataset
                                    AND cl.target_field = ul.source_field
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
                                transformation_type
                            FROM upstream_lineage
                        """, [dataset_name, field_name, max_depth])

                        for row in cur.fetchall():
                            source_key = f"{row[1]}.{row[2]}"
                            target_key = f"{row[4]}.{row[5]}"

                            # Add source node
                            if source_key not in nodes:
                                nodes[source_key] = {
                                    "id": source_key,
                                    "type": "field",
                                    "name": row[2].strip() if row[2] else "",
                                    "dataset": {
                                        "name": row[1].strip() if row[1] else "",
                                        "namespace": row[0].strip() if row[0] else ""
                                    }
                                }

                            # Add target node
                            if target_key not in nodes:
                                nodes[target_key] = {
                                    "id": target_key,
                                    "type": "field",
                                    "name": row[5].strip() if row[5] else "",
                                    "dataset": {
                                        "name": row[4].strip() if row[4] else "",
                                        "namespace": row[3].strip() if row[3] else ""
                                    }
                                }

                            # Add edge
                            edge_id = f"{source_key}->{target_key}"
                            if not any(e["id"] == edge_id for e in edges):
                                edges.append({
                                    "id": edge_id,
                                    "source": source_key,
                                    "target": target_key,
                                    "transformationType": row[6].strip() if row[6] else "DIRECT"
                                })

                    # Get downstream lineage if requested
                    if direction in ("downstream", "both"):
                        cur.execute("""
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
                                    CAST(source_dataset || '.' || source_field || '->' || target_dataset || '.' || target_field AS VARCHAR(10000)) as path
                                FROM OL_COLUMN_LINEAGE
                                WHERE source_dataset = ?
                                  AND UPPER(source_field) = UPPER(?)
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
                                    ON cl.source_dataset = dl.target_dataset
                                    AND cl.source_field = dl.target_field
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
                                transformation_type
                            FROM downstream_lineage
                        """, [dataset_name, field_name, max_depth])

                        for row in cur.fetchall():
                            source_key = f"{row[1]}.{row[2]}"
                            target_key = f"{row[4]}.{row[5]}"

                            # Add source node
                            if source_key not in nodes:
                                nodes[source_key] = {
                                    "id": source_key,
                                    "type": "field",
                                    "name": row[2].strip() if row[2] else "",
                                    "dataset": {
                                        "name": row[1].strip() if row[1] else "",
                                        "namespace": row[0].strip() if row[0] else ""
                                    }
                                }

                            # Add target node
                            if target_key not in nodes:
                                nodes[target_key] = {
                                    "id": target_key,
                                    "type": "field",
                                    "name": row[5].strip() if row[5] else "",
                                    "dataset": {
                                        "name": row[4].strip() if row[4] else "",
                                        "namespace": row[3].strip() if row[3] else ""
                                    }
                                }

                            # Add edge
                            edge_id = f"{source_key}->{target_key}"
                            if not any(e["id"] == edge_id for e in edges):
                                edges.append({
                                    "id": edge_id,
                                    "source": source_key,
                                    "target": target_key,
                                    "transformationType": row[6].strip() if row[6] else "DIRECT"
                                })

        return jsonify({
            "datasetId": dataset_id,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/v2/openlineage/lineage/database/<database_name>", methods=["GET"])
def get_openlineage_database_lineage(database_name):
    """Get column-level lineage graph for all tables/views in a database."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "3"))  # Default to 3 for database-level

    try:
        nodes = {}  # column_key -> node info
        edges = []  # list of edges

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get all datasets (tables/views) in this database
                search_pattern = f"{database_name}.%"

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
                        "id": row[0].strip() if row[0] else "",
                        "name": row[1].strip() if row[1] else "",
                        "sourceType": row[2].strip() if row[2] else "TABLE",
                        "namespace": row[3].strip() if row[3] else "",
                        "description": row[4].strip() if row[4] else ""
                    }
                    datasets.append(dataset)
                    dataset_names.add(dataset["name"])

                if not datasets:
                    return jsonify({"error": f"No tables found in database '{database_name}'"}), 404

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
                        field_name = field_row[0].strip() if field_row[0] else ""
                        field_type = field_row[1].strip() if field_row[1] else None
                        nullable = field_row[2].strip() if field_row[2] else None
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

                # Now get all column lineage where source OR target is in this database
                # This captures both internal database lineage and cross-database lineage
                placeholders = ",".join("?" * len(dataset_names))
                dataset_list = list(dataset_names)

                lineage_query = f"""
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
                                 cl.target_dataset || '.' || cl.target_field AS VARCHAR(10000)) as path
                        FROM OL_COLUMN_LINEAGE cl
                        WHERE cl.is_active = 'Y'
                          AND (cl.source_dataset IN ({placeholders})
                               OR cl.target_dataset IN ({placeholders}))

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
                            ON (cl.source_dataset = lc.target_dataset AND cl.source_field = lc.target_field)
                               OR (cl.target_dataset = lc.source_dataset AND cl.target_field = lc.source_field)
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
                        transformation_type
                    FROM lineage_cte
                """

                # Execute with dataset names repeated for placeholders
                params = dataset_list + dataset_list + [max_depth]
                cur.execute(lineage_query, params)

                # Process lineage results - add any nodes that weren't already added
                # and create edges
                for row in cur.fetchall():
                    source_namespace = row[0].strip() if row[0] else ""
                    source_dataset = row[1].strip() if row[1] else ""
                    source_field = row[2].strip() if row[2] else ""
                    target_namespace = row[3].strip() if row[3] else ""
                    target_dataset = row[4].strip() if row[4] else ""
                    target_field = row[5].strip() if row[5] else ""
                    transformation_type = row[6].strip() if row[6] else "DIRECT"

                    source_key = f"{source_dataset}.{source_field}"
                    target_key = f"{target_dataset}.{target_field}"

                    # Add source node (if it's from an external dataset)
                    if source_key not in nodes:
                        # Look up sourceType from our metadata, or fetch it if external
                        source_meta = dataset_metadata.get(source_dataset)
                        if not source_meta:
                            # External dataset - try to fetch sourceType
                            cur.execute("""
                                SELECT d.source_type, n.namespace_uri
                                FROM OL_DATASET d
                                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                                WHERE d."name" = ?
                            """, [source_dataset])
                            ext_row = cur.fetchone()
                            if ext_row:
                                source_meta = {
                                    "namespace": ext_row[1].strip() if ext_row[1] else source_namespace,
                                    "sourceType": ext_row[0].strip() if ext_row[0] else "TABLE"
                                }
                            else:
                                source_meta = {"namespace": source_namespace, "sourceType": "TABLE"}

                        # Fetch field metadata
                        cur.execute("""
                            SELECT f.field_type, f.nullable
                            FROM OL_DATASET_FIELD f
                            JOIN OL_DATASET d ON f.dataset_id = d.dataset_id
                            WHERE d."name" = ? AND UPPER(f.field_name) = UPPER(?)
                        """, [source_dataset, source_field])
                        field_row = cur.fetchone()
                        field_type = field_row[0].strip() if field_row and field_row[0] else None
                        nullable = field_row[1].strip() if field_row and field_row[1] else None

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
                                "nullable": nullable == 'Y'
                            }
                        }

                    # Add target node (if it's from an external dataset)
                    if target_key not in nodes:
                        # Look up sourceType from our metadata, or fetch it if external
                        target_meta = dataset_metadata.get(target_dataset)
                        if not target_meta:
                            # External dataset - try to fetch sourceType
                            cur.execute("""
                                SELECT d.source_type, n.namespace_uri
                                FROM OL_DATASET d
                                JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
                                WHERE d."name" = ?
                            """, [target_dataset])
                            ext_row = cur.fetchone()
                            if ext_row:
                                target_meta = {
                                    "namespace": ext_row[1].strip() if ext_row[1] else target_namespace,
                                    "sourceType": ext_row[0].strip() if ext_row[0] else "TABLE"
                                }
                            else:
                                target_meta = {"namespace": target_namespace, "sourceType": "TABLE"}

                        # Fetch field metadata
                        cur.execute("""
                            SELECT f.field_type, f.nullable
                            FROM OL_DATASET_FIELD f
                            JOIN OL_DATASET d ON f.dataset_id = d.dataset_id
                            WHERE d."name" = ? AND UPPER(f.field_name) = UPPER(?)
                        """, [target_dataset, target_field])
                        field_row = cur.fetchone()
                        field_type = field_row[0].strip() if field_row and field_row[0] else None
                        nullable = field_row[1].strip() if field_row and field_row[1] else None

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
                                "nullable": nullable == 'Y'
                            }
                        }

                    # Add edge
                    edge_id = f"{source_key}->{target_key}"
                    if not any(e["id"] == edge_id for e in edges):
                        edges.append({
                            "id": edge_id,
                            "source": source_key,
                            "target": target_key,
                            "transformationType": transformation_type
                        })

        return jsonify({
            "databaseName": database_name,
            "direction": direction,
            "maxDepth": max_depth,
            "graph": {
                "nodes": list(nodes.values()),
                "edges": edges
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT") or os.environ.get("PORT", "8080"))
    print(f"Starting Python Lineage API on port {port}")
    print(f"Database: {DB_CONFIG['host']}")
    app.run(host="0.0.0.0", port=port, debug=False)
