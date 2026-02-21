#!/usr/bin/env python3
"""
Python Flask Backend for Lineage API

Application factory pattern with Flask Blueprints.
Routes organized by feature area in routes/ package.
Business logic in services/ package.
Data access in repositories/ package.
"""

import os
from flask import Flask
from flask_cors import CORS
from loguru import logger

from config import get_db_connection
from cache import init_cache, cache
from repositories.lineage_repository import LineageRepository
from repositories.dataset_repository import DatasetRepository
from services.lineage_service import LineageService
from services.dataset_service import DatasetService
from services.impact_service import ImpactService
from routes.health import health_bp
from routes.openlineage import openlineage_bp
from routes.cache import cache_bp
from routes.graph import graph_bp
from routes import openlineage as openlineage_routes
from utils.logging_config import configure_logging
from middleware.correlation_id import init_correlation_id_middleware
from middleware.error_handlers import register_error_handlers
from middleware.timing import init_timing_middleware
from graph.engine import graph_engine


def create_app():
    """
    Application factory for Flask app.

    Creates and configures the Flask application with:
    - Structured logging (loguru)
    - CORS configuration
    - Database connection
    - Repository layer
    - Service layer
    - Route Blueprints
    - Correlation ID middleware
    - Global error handlers

    Returns:
        Flask: Configured Flask application
    """
    # Step 1: Configure logging FIRST (before any other setup)
    # This ensures all subsequent startup logs use structured JSON format
    configure_logging()

    app = Flask(__name__)

    # Configure CORS
    CORS(app, origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3004",
        "http://localhost:5173"
    ], expose_headers=["Server-Timing"])

    # Step 2: Initialize correlation ID middleware (after CORS, before routes)
    init_correlation_id_middleware(app)

    # Step 2a: Initialize Server-Timing middleware (after correlation ID, before routes)
    init_timing_middleware(app)

    # Step 2.5: Initialize cache (before repositories, after CORS)
    init_cache(app)

    # Extract raw redis-py client for graph engine serialization.
    # If Redis is unavailable (SimpleCache fallback), redis_client is None
    # and graph engine operates without Redis persistence.
    redis_client = None
    try:
        redis_client = cache.cache._read_client
    except Exception:
        pass

    # Create database connection (shared across all repositories)
    connection = get_db_connection()

    # Initialize in-memory graph engine (background warmup thread)
    # Starts a daemon thread that loads OL_COLUMN_LINEAGE into a networkx DiGraph.
    # Does NOT block — app immediately proceeds to serve requests via CTE fallback.
    # Once warmup completes, column and table lineage requests switch to BFS traversal.
    # If Redis is available, _warmup() will restore from Redis snapshot on restart,
    # skipping Teradata load for fast cold starts.
    graph_engine.initialize(connection, redis_client=redis_client)
    logger.info("Graph engine: background warmup initiated")

    # Instantiate repositories
    lineage_repo = LineageRepository(connection)
    dataset_repo = DatasetRepository(connection)

    # Instantiate services
    lineage_svc = LineageService(lineage_repo, dataset_repo)
    dataset_svc = DatasetService(dataset_repo)
    impact_svc = ImpactService(lineage_repo, dataset_repo)

    # Initialize services in openlineage routes module
    openlineage_routes.init_services(lineage_svc, dataset_svc, impact_svc)

    # Register Blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(openlineage_bp)
    app.register_blueprint(cache_bp)
    app.register_blueprint(graph_bp)

    # Step 3: Register error handlers LAST (after all routes are registered)
    register_error_handlers(app)

    return app


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT") or os.environ.get("PORT", "8080"))
    logger.info(f"Starting Python Lineage API on port {port}", port=port)

    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=False)
