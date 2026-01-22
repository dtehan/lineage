#!/usr/bin/env python3
"""
Lineage API Server - Python Flask Implementation

This server provides the same REST API as the Go backend but uses
teradatasql for database connectivity.
"""

import os
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
import teradatasql

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000"])

# Database configuration
DB_CONFIG = {
    "host": os.environ.get("TD_HOST", "localhost"),
    "user": os.environ.get("TD_USER", "demo_user"),
    "password": os.environ.get("TD_PASSWORD", ""),
    "database": os.environ.get("TD_DATABASE", "demo_user")
}

def get_connection():
    """Create a new database connection."""
    return teradatasql.connect(
        host=DB_CONFIG["host"],
        user=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        database=DB_CONFIG["database"]
    )


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


@app.route('/api/v1/assets/databases', methods=['GET'])
def list_databases():
    """List all databases with lineage data."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.database_name, COUNT(DISTINCT t.table_name) as table_count
                FROM LIN_DATABASE d
                LEFT JOIN LIN_TABLE t ON d.database_name = t.database_name
                GROUP BY d.database_name
                ORDER BY d.database_name
            """)
            rows = cur.fetchall()

    databases = [
        {
            "id": row[0],
            "name": row[0],
            "tableCount": row[1] or 0
        }
        for row in rows
    ]
    return jsonify({"databases": databases})


@app.route('/api/v1/assets/databases/<database>/tables', methods=['GET'])
def list_tables(database):
    """List tables in a database."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT t.table_name, t.database_name,
                       COUNT(DISTINCT c.column_name) as column_count
                FROM LIN_TABLE t
                LEFT JOIN LIN_COLUMN c ON t.database_name = c.database_name
                    AND t.table_name = c.table_name
                WHERE t.database_name = ?
                GROUP BY t.table_name, t.database_name
                ORDER BY t.table_name
            """, [database])
            rows = cur.fetchall()

    tables = [
        {
            "id": f"{row[1]}.{row[0]}",
            "tableName": row[0],
            "databaseName": row[1],
            "tableKind": "T",
            "columnCount": row[2] or 0
        }
        for row in rows
    ]
    return jsonify({"tables": tables})


@app.route('/api/v1/assets/databases/<database>/tables/<table>/columns', methods=['GET'])
def list_columns(database, table):
    """List columns in a table."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name, data_type, is_nullable
                FROM LIN_COLUMN
                WHERE database_name = ? AND table_name = ?
                ORDER BY column_name
            """, [database, table])
            rows = cur.fetchall()

    columns = [
        {
            "id": f"{database}.{table}.{row[0]}",
            "name": row[0],
            "dataType": row[1] or "VARCHAR",
            "nullable": row[2] == 'Y' if row[2] else True
        }
        for row in rows
    ]
    return jsonify({"columns": columns})


@app.route('/api/v1/lineage/<path:asset_id>', methods=['GET'])
def get_lineage(asset_id):
    """Get lineage graph for an asset."""
    direction = request.args.get('direction', 'both')
    max_depth = int(request.args.get('maxDepth', '5'))

    parts = asset_id.split('.')
    if len(parts) != 3:
        return jsonify({"error": "Invalid asset ID format. Expected: database.table.column"}), 400

    database, table, column = parts

    nodes = []
    edges = []
    visited = set()

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Add the root node
            cur.execute("""
                SELECT column_name, data_type, database_name, table_name
                FROM LIN_COLUMN
                WHERE database_name = ? AND table_name = ? AND column_name = ?
            """, [database, table, column])
            root = cur.fetchone()

            if root:
                root_id = f"{root[2]}.{root[3]}.{root[0]}"
                nodes.append({
                    "id": root_id,
                    "database": root[2],
                    "table": root[3],
                    "column": root[0],
                    "dataType": root[1] or "VARCHAR"
                })
                visited.add(root_id)

            # Get upstream lineage
            if direction in ('upstream', 'both'):
                get_upstream_lineage(cur, database, table, column, nodes, edges, visited, max_depth)

            # Get downstream lineage
            if direction in ('downstream', 'both'):
                get_downstream_lineage(cur, database, table, column, nodes, edges, visited, max_depth)

    return jsonify({"nodes": nodes, "edges": edges})


def get_upstream_lineage(cur, database, table, column, nodes, edges, visited, max_depth, current_depth=0):
    """Recursively get upstream lineage."""
    if current_depth >= max_depth:
        return

    cur.execute("""
        SELECT l.source_database_name, l.source_table_name, l.source_column_name,
               l.target_database_name, l.target_table_name, l.target_column_name,
               l.transformation_type, l.confidence_score,
               c.data_type
        FROM LIN_COLUMN_LINEAGE l
        LEFT JOIN LIN_COLUMN c ON l.source_database_name = c.database_name
            AND l.source_table_name = c.table_name
            AND l.source_column_name = c.column_name
        WHERE l.target_database_name = ?
            AND l.target_table_name = ?
            AND l.target_column_name = ?
    """, [database, table, column])

    for row in cur.fetchall():
        source_id = f"{row[0]}.{row[1]}.{row[2]}"
        target_id = f"{row[3]}.{row[4]}.{row[5]}"

        # Add edge
        edge = {
            "source": source_id,
            "target": target_id,
            "transformationType": row[6] or "DIRECT",
            "confidence": float(row[7]) if row[7] else 1.0
        }
        if edge not in edges:
            edges.append(edge)

        # Add source node if not visited
        if source_id not in visited:
            visited.add(source_id)
            nodes.append({
                "id": source_id,
                "database": row[0],
                "table": row[1],
                "column": row[2],
                "dataType": row[8] or "VARCHAR"
            })
            # Recurse for upstream
            get_upstream_lineage(cur, row[0], row[1], row[2], nodes, edges, visited, max_depth, current_depth + 1)


def get_downstream_lineage(cur, database, table, column, nodes, edges, visited, max_depth, current_depth=0):
    """Recursively get downstream lineage."""
    if current_depth >= max_depth:
        return

    cur.execute("""
        SELECT l.source_database_name, l.source_table_name, l.source_column_name,
               l.target_database_name, l.target_table_name, l.target_column_name,
               l.transformation_type, l.confidence_score,
               c.data_type
        FROM LIN_COLUMN_LINEAGE l
        LEFT JOIN LIN_COLUMN c ON l.target_database_name = c.database_name
            AND l.target_table_name = c.table_name
            AND l.target_column_name = c.column_name
        WHERE l.source_database_name = ?
            AND l.source_table_name = ?
            AND l.source_column_name = ?
    """, [database, table, column])

    for row in cur.fetchall():
        source_id = f"{row[0]}.{row[1]}.{row[2]}"
        target_id = f"{row[3]}.{row[4]}.{row[5]}"

        # Add edge
        edge = {
            "source": source_id,
            "target": target_id,
            "transformationType": row[6] or "DIRECT",
            "confidence": float(row[7]) if row[7] else 1.0
        }
        if edge not in edges:
            edges.append(edge)

        # Add target node if not visited
        if target_id not in visited:
            visited.add(target_id)
            nodes.append({
                "id": target_id,
                "database": row[3],
                "table": row[4],
                "column": row[5],
                "dataType": row[8] or "VARCHAR"
            })
            # Recurse for downstream
            get_downstream_lineage(cur, row[3], row[4], row[5], nodes, edges, visited, max_depth, current_depth + 1)


@app.route('/api/v1/lineage/<path:asset_id>/upstream', methods=['GET'])
def get_upstream(asset_id):
    """Get upstream lineage for an asset."""
    # Reuse main lineage endpoint with direction=upstream
    return get_lineage_with_direction(asset_id, 'upstream')


@app.route('/api/v1/lineage/<path:asset_id>/downstream', methods=['GET'])
def get_downstream(asset_id):
    """Get downstream lineage for an asset."""
    return get_lineage_with_direction(asset_id, 'downstream')


def get_lineage_with_direction(asset_id, direction):
    """Helper to get lineage with specific direction."""
    max_depth = int(request.args.get('maxDepth', '10'))

    parts = asset_id.split('.')
    if len(parts) != 3:
        return jsonify({"error": "Invalid asset ID format"}), 400

    database, table, column = parts
    nodes = []
    edges = []
    visited = set()

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Add root node
            cur.execute("""
                SELECT column_name, data_type, database_name, table_name
                FROM LIN_COLUMN
                WHERE database_name = ? AND table_name = ? AND column_name = ?
            """, [database, table, column])
            root = cur.fetchone()

            if root:
                root_id = f"{root[2]}.{root[3]}.{root[0]}"
                nodes.append({
                    "id": root_id,
                    "database": root[2],
                    "table": root[3],
                    "column": root[0],
                    "dataType": root[1] or "VARCHAR"
                })
                visited.add(root_id)

            if direction == 'upstream':
                get_upstream_lineage(cur, database, table, column, nodes, edges, visited, max_depth)
            else:
                get_downstream_lineage(cur, database, table, column, nodes, edges, visited, max_depth)

    return jsonify({"nodes": nodes, "edges": edges})


@app.route('/api/v1/lineage/<path:asset_id>/impact', methods=['GET'])
def get_impact(asset_id):
    """Get impact analysis for an asset."""
    max_depth = int(request.args.get('maxDepth', '10'))

    parts = asset_id.split('.')
    if len(parts) != 3:
        return jsonify({"error": "Invalid asset ID format"}), 400

    database, table, column = parts

    impacted_assets = []
    impact_by_depth = {}
    impacted_databases = set()

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Get all downstream assets with depth
            visited = {f"{database}.{table}.{column}"}
            queue = [(database, table, column, 0)]

            while queue:
                db, tbl, col, depth = queue.pop(0)
                if depth >= max_depth:
                    continue

                cur.execute("""
                    SELECT target_database_name, target_table_name, target_column_name
                    FROM LIN_COLUMN_LINEAGE
                    WHERE source_database_name = ?
                        AND source_table_name = ?
                        AND source_column_name = ?
                """, [db, tbl, col])

                for row in cur.fetchall():
                    target_id = f"{row[0]}.{row[1]}.{row[2]}"
                    if target_id not in visited:
                        visited.add(target_id)
                        new_depth = depth + 1

                        impacted_assets.append({
                            "id": target_id,
                            "depth": new_depth,
                            "path": [f"{database}.{table}.{column}", target_id]
                        })

                        impact_by_depth[str(new_depth)] = impact_by_depth.get(str(new_depth), 0) + 1
                        impacted_databases.add(row[0])

                        queue.append((row[0], row[1], row[2], new_depth))

    max_depth_found = max([a["depth"] for a in impacted_assets]) if impacted_assets else 0

    return jsonify({
        "sourceAsset": asset_id,
        "totalImpactedAssets": len(impacted_assets),
        "impactedDatabases": list(impacted_databases),
        "impactByDepth": impact_by_depth,
        "impactedAssets": impacted_assets,
        "maxDepth": max_depth_found
    })


@app.route('/api/v1/search', methods=['GET'])
def search_assets():
    """Search for assets by name."""
    query = request.args.get('q', '')
    asset_type = request.args.get('type', '')
    limit = int(request.args.get('limit', '50'))

    if len(query) < 2:
        return jsonify({"results": [], "total": 0})

    results = []
    search_pattern = f"%{query}%"

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Search databases
            if not asset_type or asset_type == 'database':
                cur.execute("""
                    SELECT database_name FROM LIN_DATABASE
                    WHERE database_name LIKE ?
                    ORDER BY database_name
                """, [search_pattern])
                for row in cur.fetchall():
                    results.append({
                        "id": row[0],
                        "type": "database",
                        "databaseName": row[0],
                        "matchedOn": "database_name",
                        "score": 0.9
                    })

            # Search tables
            if not asset_type or asset_type == 'table':
                cur.execute("""
                    SELECT table_name, database_name FROM LIN_TABLE
                    WHERE table_name LIKE ?
                    ORDER BY table_name
                """, [search_pattern])
                for row in cur.fetchall():
                    results.append({
                        "id": f"{row[1]}.{row[0]}",
                        "type": "table",
                        "databaseName": row[1],
                        "tableName": row[0],
                        "matchedOn": "table_name",
                        "score": 0.85
                    })

            # Search columns
            if not asset_type or asset_type == 'column':
                cur.execute("""
                    SELECT column_name, table_name, database_name FROM LIN_COLUMN
                    WHERE column_name LIKE ? OR table_name LIKE ?
                    ORDER BY column_name
                """, [search_pattern, search_pattern])
                for row in cur.fetchall():
                    results.append({
                        "id": f"{row[2]}.{row[1]}.{row[0]}",
                        "type": "column",
                        "databaseName": row[2],
                        "tableName": row[1],
                        "columnName": row[0],
                        "matchedOn": "column_name",
                        "score": 0.8
                    })

    # Limit results
    results = results[:limit]

    return jsonify({
        "results": results,
        "total": len(results)
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8080'))
    print(f"Starting Lineage API server on port {port}...")
    print(f"Database: {DB_CONFIG['host']}")
    app.run(host='0.0.0.0', port=port, debug=True)
