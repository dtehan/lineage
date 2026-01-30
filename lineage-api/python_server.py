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


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT") or os.environ.get("PORT", "8080"))
    print(f"Starting Python Lineage API on port {port}")
    print(f"Database: {DB_CONFIG['host']}")
    app.run(host="0.0.0.0", port=port, debug=False)
